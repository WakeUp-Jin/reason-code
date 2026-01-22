import React, { useState, useMemo } from 'react';
import { Box, Text, Static, useInput } from 'ink';
import { useTheme } from '../../context/theme.js';
import { useIsExecuting, useExecutionState } from '../../context/execution.js';
import {
  useCurrentSession,
  useStreamingMessage,
  useAppStore,
  useStaticTimelineItems,
  useDynamicTimelineItems,
} from '../../context/store.js';
import type { Message, Notice, TimelineItem } from '../../context/store.js';
import { Header } from './header.js';
import { Footer } from './footer.js';
import { UserMessage } from '../../component/message-area/user-message.js';
import { AssistantMessage } from '../../component/message-area/assistant-message.js';
import { ToolMessage } from '../../component/message-area/tool-message.js';
import { ThinkingMessage } from '../../component/message-area/thinking-message.js';
import { CompressionNotice } from '../../component/notice/CompressionNotice.js';
import { InputArea } from './inputArea.js';
import { ExecutionStream } from '../../component/execution/index.js';
import { TodoDisplay } from '../../component/execution/TodoDisplay.js';
import { useExecutionMessages } from '../../hooks/useExecutionMessages.js';

// Static 区域的 item 类型
type StaticItem =
  | { id: string; type: 'header' }
  | { id: string; type: 'message'; message: Message }
  | { id: string; type: 'notice'; notice: Notice };

// 需要隐藏的工具（不在消息区域显示，但保存到历史记录）
const HIDDEN_TOOLS = new Set(['TodoWrite', 'TodoRead']);

export function Session() {
  const { colors } = useTheme();
  const isExecuting = useIsExecuting();
  const { isPendingConfirm, todos, showTodos, toggleTodos } = useExecutionState();
  const session = useCurrentSession();
  const staticTimelineItems = useStaticTimelineItems();
  const dynamicTimelineItems = useDynamicTimelineItems();
  const streamingMessage = useStreamingMessage();
  const currentSessionId = useAppStore((state) => state.currentSessionId);

  // 命令面板显示状态
  const [isCommandPanelVisible, setIsCommandPanelVisible] = useState(false);

  // 快捷键：ctrl+t 切换 TODO 列表显示（无论执行中/已完成都可用）
  useInput(
    (input, key) => {
      // 兼容：不同终端/ink 解析下 ctrl+t 可能表现为 (key.ctrl && 't') 或控制字符 \x14
      const isCtrlT = (key.ctrl && input.toLowerCase() === 't') || input === '\u0014';
      if (isCtrlT && todos.length > 0) {
        toggleTodos();
      }
    },
    { isActive: true }
  );

  // 监听执行事件，自动创建 tool/thinking 消息
  useExecutionMessages({
    sessionId: currentSessionId,
    assistantPlaceholderId: streamingMessage?.id || null,
  });

  // 如果没有当前会话，显示错误
  if (!session) {
    return (
      <Box flexDirection="column" alignItems="center" justifyContent="center">
        <Text color={colors.error}>No session selected</Text>
        <Text color={colors.textMuted}>Press Esc to go back home</Text>
      </Box>
    );
  }

  // 渲染消息的通用函数
  const renderMessage = (message: Message) => {
    switch (message.role) {
      case 'user':
        return <UserMessage message={message} />;
      case 'assistant':
        // 过滤空内容的 assistant 消息
        if (!message.content) return null;
        return <AssistantMessage message={message} />;
      case 'tool':
        // 过滤掉不需要显示的工具（如 TODO 工具，已有专门的 TodoDisplay 组件）
        if (message.toolCall && HIDDEN_TOOLS.has(message.toolCall.toolName)) {
          return null;
        }
        return <ToolMessage message={message} />;
      case 'thinking':
        return <ThinkingMessage message={message} />;
      default:
        return null;
    }
  };

  // 构建 Static 区域的 items - Header 作为第一个 item
  // 使用新的 timeline hooks，已自动处理 notices 的位置和阻塞点逻辑
  const staticItems: StaticItem[] = useMemo(() => {
    const items: StaticItem[] = [{ id: 'header', type: 'header' }];

    for (const timelineItem of staticTimelineItems) {
      if (timelineItem.type === 'message') {
        const msg = timelineItem.data;
        // 过滤空 assistant 消息
        if (msg.role === 'assistant' && !msg.content) continue;
        items.push({
          id: msg.id,
          type: 'message' as const,
          message: msg,
        });
      } else if (timelineItem.type === 'notice') {
        items.push({
          id: `notice-${timelineItem.data.id}`,
          type: 'notice' as const,
          notice: timelineItem.data,
        });
      }
    }

    return items;
  }, [staticTimelineItems]);

  return (
    <>
      {/* Static 区域 - 固定已完成消息和通知 */}
      <Static items={staticItems}>
        {(item: StaticItem) => {
          if (item.type === 'header') {
            return (
              <Box key="header" paddingTop={1} paddingLeft={2} paddingRight={2}>
                <Header />
              </Box>
            );
          }
          if (item.type === 'notice') {
            return (
              <Box key={item.id} paddingLeft={2} paddingRight={2}>
                <CompressionNotice notice={item.notice} />
              </Box>
            );
          }
          return (
            <Box key={item.id} paddingLeft={2} paddingRight={2}>
              {renderMessage(item.message)}
            </Box>
          );
        }}
      </Static>

      {/* 动态区域 - 未完成的消息和 pending notices */}
      {dynamicTimelineItems.map((item) => {
        if (item.type === 'notice') {
          return (
            <Box key={`notice-${item.data.id}`} paddingLeft={2} paddingRight={2}>
              <CompressionNotice notice={item.data} />
            </Box>
          );
        }
        // item.type === 'message'
        const content = renderMessage(item.data);
        if (!content) return null;
        return (
          <Box key={item.data.id} paddingLeft={2} paddingRight={2}>
            {content}
          </Box>
        );
      })}

      {/* 执行状态指示器 */}
      {isExecuting && !isPendingConfirm && (
        <Box marginTop={1} paddingLeft={2} paddingRight={2}>
          <ExecutionStream />
        </Box>
      )}

      {/* TODO 列表显示 - 受 showTodos 控制 */}
      {showTodos && todos.length > 0 && (
        <Box paddingLeft={2} paddingRight={2}>
          <TodoDisplay todos={todos} />
        </Box>
      )}

      {/* 输入区域和 Footer */}
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
        {/* 仅在非命令面板模式下显示 Footer */}
        {!isCommandPanelVisible && <Footer />}
      </Box>
    </>
  );
}
