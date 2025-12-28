import React, { useState } from 'react';
import { Box, Text, Static } from 'ink';
import { useTheme } from '../../context/theme.js';
import { useExecution } from '../../context/execution.js';
import {
  useCurrentSession,
  useCompletedMessages,
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
  const { isExecuting } = useExecution();
  const session = useCurrentSession();
  const completedMessages = useCompletedMessages();
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

  // 构建 Static 区域的 items - Header 作为第一个 item
  const staticItems: StaticItem[] = [
    { id: 'header', type: 'header' },
    ...completedMessages.map((m) => ({
      id: m.id,
      type: 'message' as const,
      message: m,
    })),
  ];

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
          // 消息项 - 根据 role 选择组件
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

      {/* 动态区域 - 执行流 + 流式消息 + 输入框 + Footer */}
      {/* 执行流展示 */}
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
