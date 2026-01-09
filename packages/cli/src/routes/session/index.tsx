import React, { useState, useMemo } from 'react';
import { Box, Text, Static, useInput } from 'ink';
import { useTheme } from '../../context/theme.js';
import { useIsExecuting, useExecutionState } from '../../context/execution.js';
import {
  useCurrentSession,
  useStaticMessages,
  useDynamicMessages,
  useStreamingMessage,
  useAppStore,
  useCurrentMessages,
} from '../../context/store.js';
import type { Message } from '../../context/store.js';
import { Header } from './header.js';
import { Footer } from './footer.js';
import { UserMessage } from '../../component/message-area/user-message.js';
import { AssistantMessage } from '../../component/message-area/assistant-message.js';
import { ToolMessage } from '../../component/message-area/tool-message.js';
import { ThinkingMessage } from '../../component/message-area/thinking-message.js';
import { InputArea } from './inputArea.js';
import { ExecutionStream } from '../../component/execution/index.js';
import { TodoDisplay } from '../../component/execution/TodoDisplay.js';
import { useExecutionMessages } from '../../hooks/useExecutionMessages.js';

// Static 区域的 item 类型
type StaticItem =
  | { id: string; type: 'header' }
  | { id: string; type: 'message'; message: Message };

export function Session() {
  const { colors } = useTheme();
  const isExecuting = useIsExecuting();
  const { isPendingConfirm, todos, showTodos, isThinkingExpanded, toggleThinkingExpanded } =
    useExecutionState();
  const session = useCurrentSession();
  const staticMessages = useStaticMessages();
  const dynamicMessages = useDynamicMessages();
  const streamingMessage = useStreamingMessage();
  const currentSessionId = useAppStore((state) => state.currentSessionId);

  // 命令面板显示状态
  const [isCommandPanelVisible, setIsCommandPanelVisible] = useState(false);

  // 监听执行事件，自动创建 tool/thinking 消息
  useExecutionMessages({
    sessionId: currentSessionId,
    assistantPlaceholderId: streamingMessage?.id || null,
  });

  // 监听 ctrl+o 切换思考内容展开状态
  useInput((input, key) => {
    if (key.ctrl && input === 'o') {
      toggleThinkingExpanded();
    }
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
        return <ToolMessage message={message} />;
      case 'thinking':
        return <ThinkingMessage message={message} />;
      default:
        return null;
    }
  };

  // 展开模式下使用所有消息，折叠模式下使用 static/dynamic 分离
  const allMessages = useCurrentMessages();

  // 构建 Static 区域的 items - Header 作为第一个 item
  const staticItems: StaticItem[] = useMemo(() => {
    // 展开模式：所有消息都作为 static items
    const messages = isThinkingExpanded ? allMessages : staticMessages;
    return [
      { id: 'header', type: 'header' },
      ...messages
        .filter((m) => m.role !== 'assistant' || m.content) // 过滤空 assistant 消息
        .map((m) => ({
          id: m.id,
          type: 'message' as const,
          message: m,
        })),
    ];
  }, [isThinkingExpanded, allMessages, staticMessages]);

  return (
    <>
      {/* Static 区域 - 固定已完成消息（remount 后会重新渲染） */}
      <Static items={staticItems}>
        {(item: StaticItem) => {
          if (item.type === 'header') {
            return (
              <Box key="header" paddingTop={1} paddingLeft={2} paddingRight={2}>
                <Header />
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

      {/* 动态区域 - 仅在折叠模式下显示未完成的消息 */}
      {!isThinkingExpanded &&
        dynamicMessages.map((m) => {
          const content = renderMessage(m);
          if (!content) return null;
          return (
            <Box key={m.id} paddingLeft={2} paddingRight={2}>
              {content}
            </Box>
          );
        })}

      {/* 执行状态指示器 - 保持不变 */}
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

      {/* 流式消息 */}
      {/* {streamingMessage && !isPendingConfirm && <AssistantMessage message={streamingMessage} />} */}

      {/* 输入区域和 Footer - 思考展开时隐藏，但等待确认时始终显示 */}
      {(!isThinkingExpanded || isPendingConfirm) && (
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
      )}

      {/* 思考展开时显示提示 - 带分隔线（等待确认时不显示） */}
      {isThinkingExpanded && !isPendingConfirm && (
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
          borderColor={colors.border}
        >
          <Text color={colors.textThinking}>Showing detailed transcript · ctrl+o to toggle</Text>
        </Box>
      )}
    </>
  );
}
