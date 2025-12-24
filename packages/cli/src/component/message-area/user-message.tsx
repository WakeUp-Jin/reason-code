import React from 'react';
import { Box, Text } from 'ink';
import { useTheme } from '../../context/theme.js';
import type { Message } from '../../context/store.js';

export interface UserMessageProps {
  message: Message;
}

/**
 * 单条用户消息组件 - 带左边框
 */
export function UserMessage({ message }: UserMessageProps) {
  const { colors } = useTheme();
  const username = 'You';

  return (
    <Box
      width="100%"
      borderStyle="bold"
      borderBottom={false}
      borderTop={false}
      borderRight={false}
      borderColor={colors.primary}
      marginTop={1}
    >
      <Box
        flexGrow={1}
        padding={1}
        flexDirection="column"
        paddingLeft={1}
        backgroundColor={colors.background}
      >
        <Text color={colors.text}>{message.content}</Text>
        <Text color={colors.textMuted}>{username}</Text>
      </Box>
    </Box>
  );
}
