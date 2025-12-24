import React from 'react';
import { Box, Text, Static } from 'ink';
import { useTheme } from '../../context/theme.js';
import {
  useCurrentSession,
  useCompletedMessages,
  useStreamingMessage,
} from '../../context/store.js';
import type { Message } from '../../context/store.js';
import { Header } from './header.js';
import { Footer } from './footer.js';
import { UserMessage } from '../../component/message-area/user-message.js';
import { AssistantMessage } from '../../component/message-area/assistant-message.js';
import { InputArea } from './inputArea.js';

// Static 区域的 item 类型
type StaticItem =
  | { id: string; type: 'header' }
  | { id: string; type: 'message'; message: Message };

export function Session() {
  const { colors } = useTheme();
  const session = useCurrentSession();
  const completedMessages = useCompletedMessages();
  const streamingMessage = useStreamingMessage();

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
          // 消息项
          return (
            <Box key={item.id} paddingLeft={2} paddingRight={2}>
              {item.message.role === 'user' ? (
                <UserMessage message={item.message} />
              ) : (
                <AssistantMessage message={item.message} />
              )}
            </Box>
          );
        }}
      </Static>

      {/* 动态区域 - 流式消息 + 输入框 + Footer */}
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
        <InputArea />
        <Footer />
      </Box>
    </>
  );
}
