import React from 'react';
import { Box, Text } from 'ink';
import { useTheme } from '../../context/theme.js';
import { useAppStore } from '../../context/store.js';
import type { Message } from '../../context/store.js';
import { MarkdownText } from '../markdown-text/index.js';

export interface AssistantMessageProps {
  message: Message;
}

/**
 * 单条 AI 消息组件 - 无前缀
 * 使用 MarkdownText 组件渲染带样式的 Markdown 文本
 */
export function AssistantMessage({ message }: AssistantMessageProps) {
  const { colors } = useTheme();
  const currentModel = useAppStore((state) => state.currentModel);

  return (
    <Box width="100%" flexDirection="column" paddingX={2} marginTop={1}>
      {!message.isStreaming && message.content && <MarkdownText content={message.content} />}
    </Box>
  );
}
