import React from 'react';
import { Box, Text } from 'ink';
import { useTheme } from '../../context/theme.js';
import { useAppStore } from '../../context/store.js';
import type { Message } from '../../context/store.js';

export interface AssistantMessageProps {
  message: Message;
}

/**
 * 单条 AI 消息组件 - 无前缀
 */
export function AssistantMessage({ message }: AssistantMessageProps) {
  const { colors } = useTheme();
  const currentModel = useAppStore((state) => state.currentModel);
  const currentAgent = useAppStore((state) => state.currentAgent);

  return (
    <Box width="100%" flexDirection="column" paddingX={2} marginTop={1}>
      <Text color={colors.text}>{message.content}</Text>
      <Box marginTop={1}>
        <Text color={colors.secondary}>▣ </Text>
        <Text color={colors.text}>{currentAgent}</Text>
        <Text color={colors.textMuted}> · {currentModel}</Text>
        {message.isStreaming && <Text color={colors.accent}> · streaming...</Text>}
      </Box>
    </Box>
  );
}
