import React, { useState, useMemo } from 'react';
import { Box, Text, Static } from 'ink';
import { useTheme } from '../../context/theme.js';
import { useIsExecuting, useExecutionState } from '../../context/execution.js';
import {
  useCurrentSession,
  useStaticMessages,
  useDynamicMessages,
  useStreamingMessage,
  useAppStore,
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
import { useExecutionMessages } from '../../hooks/useExecutionMessages.js';

// Static 区域的 item 类型
type StaticItem =
  | { id: string; type: 'header' }
  | { id: string; type: 'message'; message: Message };

export function Session() {
  const { colors } = useTheme();
  const isExecuting = useIsExecuting();
  const { isPendingConfirm } = useExecutionState();
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

  // 构建 Static 区域的 items - Header 作为第一个 item
  // 使用 useMemo 缓存，避免不必要的重新渲染
  const staticItems: StaticItem[] = useMemo(
    () => [
      { id: 'header', type: 'header' },
      ...staticMessages
        .filter((m) => m.role !== 'assistant' || m.content) // 过滤空 assistant 消息
        .map((m) => ({
          id: m.id,
          type: 'message' as const,
          message: m,
        })),
    ],
    [staticMessages]
  );

  return (
    <>
      {/* Static 区域 - Header + 已完成消息，打印后固定 */}
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

      {/* 动态区域 - 未完成的消息（阻塞点及之后） */}
      {dynamicMessages.map((m) => {
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

      {/* 流式消息 */}
      {/* {streamingMessage && !isPendingConfirm && <AssistantMessage message={streamingMessage} />} */}

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
