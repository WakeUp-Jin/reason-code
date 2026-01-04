# 方案二：将 `Static` 区域隔离为独立组件

## 核心思路

使用 React 的渲染优化技术（`memo`），确保 `Static` 区域只在 `completedMessages` 真正变化时才重新渲染，即使父组件 `Session` 重新渲染也不会影响它。

## 实现步骤

### Step 1: 创建独立的 `StaticMessages` 组件

```typescript
// packages/cli/src/routes/session/static-messages.tsx

import React, { memo, useMemo, useRef } from 'react';
import { Box, Static } from 'ink';
import type { Message } from '../../context/store.js';
import { useAppStore } from '../../context/store.js';
import { useShallow } from 'zustand/react/shallow';
import { Header } from './header.js';
import { UserMessage } from '../../component/message-area/user-message.js';
import { AssistantMessage } from '../../component/message-area/assistant-message.js';
import { ToolMessage } from '../../component/message-area/tool-message.js';
import { ThinkingMessage } from '../../component/message-area/thinking-message.js';

type StaticItem =
  | { id: string; type: 'header' }
  | { id: string; type: 'message'; message: Message };

/**
 * 使用稳定的选择器获取已完成消息
 * 只有当消息数量或最后一条消息 ID 变化时才返回新数组
 */
function useStableCompletedMessages(): Message[] {
  const prevRef = useRef<Message[]>([]);

  const result = useAppStore(
    useShallow((state) => {
      const id = state.currentSessionId;
      const messages = id ? state.messages[id] || [] : [];
      return messages.filter((m) => !m.isStreaming);
    })
  );

  // 比较数组长度和最后一条消息的 ID
  const prevMessages = prevRef.current;
  const isSame =
    prevMessages.length === result.length &&
    prevMessages[prevMessages.length - 1]?.id ===
      result[result.length - 1]?.id;

  if (!isSame) {
    prevRef.current = result;
  }

  return prevRef.current;
}

/**
 * 静态消息区域内部组件
 * 这个组件完全独立，不依赖任何会频繁变化的 props
 */
function StaticMessagesInner() {
  // 直接从 store 获取数据，使用稳定的选择器
  const completedMessages = useStableCompletedMessages();

  const staticItems: StaticItem[] = useMemo(
    () => [
      { id: 'header', type: 'header' },
      ...completedMessages.map((m) => ({
        id: m.id,
        type: 'message' as const,
        message: m,
      })),
    ],
    [completedMessages]
  );

  return (
    <Static items={staticItems}>
      {(item: StaticItem) => {
        if (item.type === 'header') {
          return (
            <Box key="header" paddingTop={1} paddingLeft={2} paddingRight={2}>
              <Header />
            </Box>
          );
        }

        const renderMessage = () => {
          switch (item.message.role) {
            case 'user':
              return <UserMessage message={item.message} />;
            case 'assistant':
              return <AssistantMessage message={item.message} />;
            case 'tool':
              return <ToolMessage message={item.message} />;
            case 'thinking':
              return <ThinkingMessage message={item.message} />;
            default:
              return null;
          }
        };

        return (
          <Box key={item.id} paddingLeft={2} paddingRight={2}>
            {renderMessage()}
          </Box>
        );
      }}
    </Static>
  );
}

/**
 * 导出的 StaticMessages 组件
 * 使用 memo 包裹，不接受任何 props
 * 这样父组件重新渲染时，这个组件不会重新渲染
 */
export const StaticMessages = memo(StaticMessagesInner);
```

### Step 2: 修改 `Session` 组件

```typescript
// packages/cli/src/routes/session/index.tsx

import React, { useState } from 'react';
import { Box, Text } from 'ink';
import { useTheme } from '../../context/theme.js';
import { useExecution } from '../../context/execution.js';
import {
  useCurrentSession,
  useStreamingMessage,
  useAppStore,
} from '../../context/store.js';
import { Footer } from './footer.js';
import { AssistantMessage } from '../../component/message-area/assistant-message.js';
import { InputArea } from './inputArea.js';
import { ExecutionStream } from '../../component/execution/index.js';
import { useExecutionMessages } from '../../hooks/useExecutionMessages.js';
import { StaticMessages } from './static-messages.js'; // 新增导入

export function Session() {
  const { colors } = useTheme();
  const { isExecuting } = useExecution();
  const session = useCurrentSession();
  const streamingMessage = useStreamingMessage();
  const currentSessionId = useAppStore((state) => state.currentSessionId);

  const [isCommandPanelVisible, setIsCommandPanelVisible] = useState(false);

  useExecutionMessages({
    sessionId: currentSessionId,
    assistantPlaceholderId: streamingMessage?.id || null,
  });

  if (!session) {
    return (
      <Box flexDirection="column" alignItems="center" justifyContent="center">
        <Text color={colors.error}>No session selected</Text>
        <Text color={colors.textMuted}>Press Esc to go back home</Text>
      </Box>
    );
  }

  return (
    <>
      {/* ⭐ Static 区域 - 使用独立的 memo 组件 */}
      <StaticMessages />

      {/* 动态区域 */}
      {isExecuting && (
        <Box paddingLeft={2} paddingRight={2}>
          <ExecutionStream />
        </Box>
      )}

      {streamingMessage && (
        <Box paddingLeft={2} paddingRight={2}>
          <AssistantMessage message={streamingMessage} />
        </Box>
      )}

      <Box
        flexDirection="column"
        paddingLeft={2}
        paddingRight={2}
        paddingBottom={1}
        borderStyle="single"
        borderTop={true}
        borderBottom={false}
        borderLeft={false}
        borderRight={false}
        borderColor={colors.border || 'gray'}
      >
        <InputArea onCommandPanelChange={setIsCommandPanelVisible} />
        {!isCommandPanelVisible && <Footer />}
      </Box>
    </>
  );
}
```

### Step 3: 可选 - 修改 `useCompletedMessages`

如果需要在其他地方使用，可以修改原有的 hook：

```typescript
// packages/cli/src/context/store.tsx

import { useRef } from 'react';

// 获取已完成的消息（非流式）
// 使用 ref 缓存，确保只在内容真正变化时返回新数组
export function useCompletedMessages(): Message[] {
  const prevRef = useRef<Message[]>([]);

  const result = useAppStore(
    useShallow((state) => {
      const id = state.currentSessionId;
      const messages = id ? state.messages[id] || [] : [];
      return messages.filter((m) => !m.isStreaming);
    })
  );

  // 比较数组长度和最后一条消息的 ID
  const prevMessages = prevRef.current;
  const isSame =
    prevMessages.length === result.length &&
    prevMessages[prevMessages.length - 1]?.id ===
      result[result.length - 1]?.id;

  if (!isSame) {
    prevRef.current = result;
  }

  return prevRef.current;
}
```

## 工作原理

### React.memo 的作用

```
Session 组件重新渲染
    ↓
React 检查 StaticMessages 组件
    ↓
StaticMessages 使用 memo 包裹且没有 props
    ↓
React 认为 props 没有变化（因为没有 props）
    ↓
StaticMessages 不重新渲染
    ↓
Static 不重新打印
    ↓
✅ 不闪动
```

### 稳定选择器的作用

```
Zustand store 更新
    ↓
useStableCompletedMessages 被调用
    ↓
比较新旧消息数组
    ↓
如果长度和最后一条消息 ID 相同
    ↓
返回缓存的旧数组（引用不变）
    ↓
useMemo 的依赖没变
    ↓
staticItems 不重新计算
    ↓
Static 不重新打印
```

## 优点

1. **不修改接口**：不需要修改 `useAgent` 的接口
2. **组件隔离**：符合 React 最佳实践
3. **可复用**：可以应用到其他需要隔离的场景

## 缺点

1. **实现复杂**：需要理解 React 渲染优化机制
2. **依赖 memo**：`memo` 在某些边缘情况下可能失效
3. **调试困难**：如果出问题，不容易定位原因

## 潜在风险

### 1. memo 失效的情况

```typescript
// ❌ 如果 StaticMessages 接受了 props，memo 可能失效
<StaticMessages someProps={...} />

// ✅ 正确做法：不传任何 props
<StaticMessages />
```

### 2. 选择器不稳定

```typescript
// ❌ 每次都返回新数组
const messages = useAppStore((state) => 
  state.messages[id].filter(m => !m.isStreaming)
);

// ✅ 使用 ref 缓存
const messages = useStableCompletedMessages();
```

### 3. Context 订阅问题

```typescript
// ❌ 如果 StaticMessagesInner 内部使用了会变化的 Context
function StaticMessagesInner() {
  const { something } = useExecution(); // 这会导致重新渲染
  // ...
}

// ✅ 不使用会变化的 Context
function StaticMessagesInner() {
  // 只使用稳定的数据源
  const completedMessages = useStableCompletedMessages();
  // ...
}
```

## 注意事项

1. `StaticMessages` 组件内部不能使用任何会频繁变化的 Context
2. 确保 `useStableCompletedMessages` 的比较逻辑正确
3. 如果需要在 `StaticMessages` 内部使用主题，确保主题 Context 不会频繁变化
4. 测试时注意验证各种边缘情况

