# CLI 层实现

## 1. 概述

CLI 层负责执行流的 UI 渲染，包括状态指示器、工具调用展示、思考过程展示等组件。

## 2. 执行流 Context

```tsx
// packages/cli/src/context/execution.tsx

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode
} from 'react';
import type {
  ExecutionSnapshot,
  ExecutionEvent,
  ExecutionStreamManager
} from '@reason-cli/core';

interface ExecutionContextValue {
  // 状态
  snapshot: ExecutionSnapshot | null;
  isExecuting: boolean;

  // 思考展示控制
  showThinking: boolean;
  toggleThinking: () => void;

  // 事件订阅
  subscribe: (handler: (event: ExecutionEvent) => void) => () => void;

  // 绑定执行流管理器
  bindManager: (manager: ExecutionStreamManager) => void;
}

const ExecutionContext = createContext<ExecutionContextValue | null>(null);

interface ExecutionProviderProps {
  children: ReactNode;
}

export function ExecutionProvider({ children }: ExecutionProviderProps) {
  const [snapshot, setSnapshot] = useState<ExecutionSnapshot | null>(null);
  const [showThinking, setShowThinking] = useState(false);
  const managerRef = useRef<ExecutionStreamManager | null>(null);
  const handlersRef = useRef<Set<(event: ExecutionEvent) => void>>(new Set());

  // 切换思考展示
  const toggleThinking = useCallback(() => {
    setShowThinking(prev => !prev);
  }, []);

  // 订阅事件
  const subscribe = useCallback((handler: (event: ExecutionEvent) => void) => {
    handlersRef.current.add(handler);
    return () => handlersRef.current.delete(handler);
  }, []);

  // 绑定管理器
  const bindManager = useCallback((manager: ExecutionStreamManager) => {
    managerRef.current = manager;

    // 订阅管理器事件
    const unsubscribe = manager.on((event) => {
      // 更新快照
      setSnapshot(manager.getSnapshot());

      // 转发给外部订阅者
      handlersRef.current.forEach(handler => handler(event));

      // 执行完成时重置思考展示
      if (event.type === 'execution:complete' ||
          event.type === 'execution:error' ||
          event.type === 'execution:cancel') {
        setShowThinking(false);
      }
    });

    return unsubscribe;
  }, []);

  // 计算是否正在执行
  const isExecuting = snapshot !== null &&
    snapshot.state !== 'idle' &&
    snapshot.state !== 'completed' &&
    snapshot.state !== 'error' &&
    snapshot.state !== 'cancelled';

  const value: ExecutionContextValue = {
    snapshot,
    isExecuting,
    showThinking,
    toggleThinking,
    subscribe,
    bindManager,
  };

  return (
    <ExecutionContext.Provider value={value}>
      {children}
    </ExecutionContext.Provider>
  );
}

export function useExecution(): ExecutionContextValue {
  const context = useContext(ExecutionContext);
  if (!context) {
    throw new Error('useExecution must be used within ExecutionProvider');
  }
  return context;
}
```

## 3. 常量定义

```typescript
// packages/cli/src/component/execution/constants.ts

import type { ThemeColors } from '../../context/theme.js';

/**
 * 工具状态图标
 */
export const TOOL_ICONS = {
  PENDING: '○',
  EXECUTING: '●',
  SUCCESS: '●',
  ERROR: '●',
  CANCELLED: '○',
} as const;

/**
 * 状态对应主题颜色键
 */
export const TOOL_STATUS_THEME_COLORS: Record<string, keyof ThemeColors> = {
  pending: 'textMuted',
  executing: 'textMuted',
  success: 'success',
  error: 'error',
  cancelled: 'textMuted',
};

/**
 * 状态短语池
 */
export const STATUS_PHRASES = [
  'Thinking...',
  'Analyzing...',
  'Processing...',
  'Reasoning...',
  'Deciphering...',
  'Elucidating...',
  'Crunching...',
  'Computing...',
] as const;

/**
 * Tip 提示池
 */
export const TIPS = [
  'Press ctrl+t to show thinking process',
  'Press esc to interrupt',
  'Hit shift+tab to cycle modes',
] as const;
```

## 4. 状态指示器组件

```tsx
// packages/cli/src/component/execution/StatusIndicator.tsx

import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import Spinner from 'ink-spinner';
import { useTheme } from '../../context/theme.js';
import { useExecution } from '../../context/execution.js';
import { TIPS } from './constants.js';

export function StatusIndicator() {
  const { colors } = useTheme();
  const { snapshot, isExecuting, showThinking, toggleThinking } = useExecution();
  const [elapsedTime, setElapsedTime] = useState(0);
  const [tipIndex, setTipIndex] = useState(0);

  // 快捷键监听
  useInput((input, key) => {
    if (key.ctrl && input === 't') {
      toggleThinking();
    }
  }, { isActive: isExecuting });

  // 计时器
  useEffect(() => {
    if (!isExecuting) {
      setElapsedTime(0);
      return;
    }

    const interval = setInterval(() => {
      setElapsedTime(prev => prev + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [isExecuting]);

  // Tip 轮换
  useEffect(() => {
    if (!isExecuting) return;

    const interval = setInterval(() => {
      setTipIndex(prev => (prev + 1) % TIPS.length);
    }, 8000);

    return () => clearInterval(interval);
  }, [isExecuting]);

  if (!isExecuting || !snapshot) {
    return null;
  }

  const formatTime = (seconds: number): string => {
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  const { stats, statusPhrase, state } = snapshot;

  return (
    <Box flexDirection="column">
      {/* 主状态行 */}
      <Box flexDirection="row" gap={1}>
        <Text color={colors.warning}>
          <Spinner type="dots" />
        </Text>
        <Text color={colors.warning}>{statusPhrase}</Text>
        <Text color={colors.textMuted}>
          (esc to interrupt · {formatTime(elapsedTime)}
          {stats.totalTokens > 0 && ` · ↓ ${stats.totalTokens} tokens`})
        </Text>
      </Box>

      {/* Tip 行 - 仅在思考状态且未展开时显示 */}
      {state === 'thinking' && !showThinking && (
        <Box paddingLeft={2}>
          <Text color={colors.textMuted}>
            └ Tip: {TIPS[tipIndex]}
          </Text>
        </Box>
      )}
    </Box>
  );
}
```

## 5. 工具调用展示组件

```tsx
// packages/cli/src/component/execution/ToolCallDisplay.tsx

import React from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import { useTheme } from '../../context/theme.js';
import { TOOL_ICONS, TOOL_STATUS_THEME_COLORS } from './constants.js';
import type { ToolCallRecord } from '@reason-cli/core';

interface ToolCallDisplayProps {
  toolCall: ToolCallRecord;
}

export function ToolCallDisplay({ toolCall }: ToolCallDisplayProps) {
  const { colors } = useTheme();

  // 获取状态对应的颜色
  const statusColorKey = TOOL_STATUS_THEME_COLORS[toolCall.status] || 'textMuted';
  const statusColor = colors[statusColorKey];

  // 状态图标
  const StatusIcon = () => {
    if (toolCall.status === 'executing') {
      return (
        <Text color={statusColor}>
          <Spinner type="dots" />
        </Text>
      );
    }

    const iconKey = toolCall.status.toUpperCase() as keyof typeof TOOL_ICONS;
    return (
      <Text color={statusColor}>
        {TOOL_ICONS[iconKey] || TOOL_ICONS.PENDING}
      </Text>
    );
  };

  return (
    <Box flexDirection="column">
      {/* 主行：图标 + 工具名称 + 参数摘要 */}
      <Box flexDirection="row" gap={1}>
        <StatusIcon />
        <Text color={colors.primary} bold>
          {toolCall.toolName}
        </Text>
        <Text color={colors.textMuted}>
          ({toolCall.paramsSummary})
        </Text>
      </Box>

      {/* 结果摘要行 */}
      {toolCall.resultSummary && (
        <Box paddingLeft={2}>
          <Text color={colors.textMuted}>└ </Text>
          <Text color={colors.text}>{toolCall.resultSummary}</Text>
        </Box>
      )}

      {/* 错误信息 */}
      {toolCall.error && (
        <Box paddingLeft={2}>
          <Text color={colors.error}>└ Error: {toolCall.error}</Text>
        </Box>
      )}

      {/* 实时输出（执行中） */}
      {toolCall.status === 'executing' && toolCall.liveOutput && (
        <Box paddingLeft={2} flexDirection="column">
          <Text color={colors.textMuted}>
            {toolCall.liveOutput.slice(-200)}
          </Text>
        </Box>
      )}
    </Box>
  );
}
```

## 6. 工具调用组容器

```tsx
// packages/cli/src/component/execution/ToolCallGroup.tsx

import React from 'react';
import { Box } from 'ink';
import { useTheme } from '../../context/theme.js';
import { ToolCallDisplay } from './ToolCallDisplay.js';
import type { ToolCallRecord } from '@reason-cli/core';

interface ToolCallGroupProps {
  toolCalls: ToolCallRecord[];
  currentToolCall?: ToolCallRecord;
}

export function ToolCallGroup({ toolCalls, currentToolCall }: ToolCallGroupProps) {
  const { colors } = useTheme();

  // 合并历史和当前
  const allCalls = currentToolCall
    ? [...toolCalls, currentToolCall]
    : toolCalls;

  if (allCalls.length === 0) {
    return null;
  }

  // 判断是否有正在执行的工具
  const hasExecuting = allCalls.some(tc => tc.status === 'executing');

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={hasExecuting ? colors.warning : colors.border}
      paddingX={1}
      gap={1}
    >
      {allCalls.map((toolCall) => (
        <ToolCallDisplay
          key={toolCall.id}
          toolCall={toolCall}
        />
      ))}
    </Box>
  );
}
```

## 7. 思考展示组件

```tsx
// packages/cli/src/component/execution/ThinkingDisplay.tsx

import React from 'react';
import { Box, Text } from 'ink';
import { useTheme } from '../../context/theme.js';
import type { ThinkingContent } from '@reason-cli/core';

interface ThinkingDisplayProps {
  thinking: ThinkingContent;
  isVisible: boolean;
  maxLines?: number;
}

export function ThinkingDisplay({
  thinking,
  isVisible,
  maxLines = 10
}: ThinkingDisplayProps) {
  const { colors } = useTheme();

  if (!isVisible || !thinking.content) {
    return null;
  }

  const lines = thinking.content.split('\n');
  const shouldTruncate = lines.length > maxLines;
  const displayLines = shouldTruncate ? lines.slice(0, maxLines) : lines;

  return (
    <Box flexDirection="column" paddingLeft={1}>
      {/* 标题行 */}
      <Box flexDirection="row" gap={1}>
        <Text color={colors.secondary}>▼</Text>
        <Text color={colors.secondary} bold>Thinking</Text>
        {!thinking.isComplete && (
          <Text color={colors.textMuted}>...</Text>
        )}
      </Box>

      {/* 内容区域 */}
      <Box
        flexDirection="column"
        paddingLeft={1}
        borderStyle="single"
        borderColor={colors.borderSubtle}
        borderLeft={true}
        borderRight={false}
        borderTop={false}
        borderBottom={false}
      >
        {displayLines.map((line, i) => (
          <Text key={i} color={colors.textMuted} wrap="wrap">
            {line}
          </Text>
        ))}

        {/* 截断提示 */}
        {shouldTruncate && (
          <Text color={colors.info}>
            ... ({lines.length - maxLines} more lines)
          </Text>
        )}
      </Box>

      {/* 底部分隔线 */}
      <Box paddingLeft={1}>
        <Text color={colors.borderSubtle}>
          └────────────────────────────────────────────────
        </Text>
      </Box>
    </Box>
  );
}
```

## 8. 执行流主组件

```tsx
// packages/cli/src/component/execution/ExecutionStream.tsx

import React from 'react';
import { Box } from 'ink';
import { useExecution } from '../../context/execution.js';
import { StatusIndicator } from './StatusIndicator.js';
import { ToolCallGroup } from './ToolCallGroup.js';
import { ThinkingDisplay } from './ThinkingDisplay.js';

export function ExecutionStream() {
  const { snapshot, isExecuting, showThinking } = useExecution();

  if (!snapshot || !isExecuting) {
    return null;
  }

  return (
    <Box flexDirection="column" gap={1}>
      {/* 思考展示（推理模型） */}
      {snapshot.thinking && (
        <ThinkingDisplay
          thinking={snapshot.thinking}
          isVisible={showThinking}
        />
      )}

      {/* 工具调用组 */}
      <ToolCallGroup
        toolCalls={snapshot.toolCallHistory}
        currentToolCall={snapshot.currentToolCall}
      />

      {/* 状态指示器 */}
      <StatusIndicator />
    </Box>
  );
}
```

## 9. 索引导出

```typescript
// packages/cli/src/component/execution/index.ts

export { ExecutionStream } from './ExecutionStream.js';
export { StatusIndicator } from './StatusIndicator.js';
export { ToolCallDisplay } from './ToolCallDisplay.js';
export { ToolCallGroup } from './ToolCallGroup.js';
export { ThinkingDisplay } from './ThinkingDisplay.js';
export * from './constants.js';
```

## 10. 集成到 Session 页面

```tsx
// packages/cli/src/routes/session/index.tsx

import { ExecutionStream } from '../../component/execution/index.js';

export function Session() {
  // ... 现有代码 ...

  return (
    <>
      {/* Static 区域 - 已完成消息 */}
      <Static items={staticItems}>
        {/* ... */}
      </Static>

      {/* 动态区域 */}
      <Box paddingLeft={2} paddingRight={2} flexDirection="column">
        {/* 执行流展示 */}
        <ExecutionStream />

        {/* 流式消息 */}
        {streamingMessage && (
          <AssistantMessage message={streamingMessage} />
        )}
      </Box>

      {/* 输入区域 */}
      {/* ... */}
    </>
  );
}
```
