import React from 'react';
import { Box, Text } from 'ink';
import { useTheme } from '../../context/theme.js';
import type { Message } from '../../context/store.js';

export interface ThinkingMessageProps {
  message: Message;
}

/**
 * 思考内容最大显示字符数
 * 超过此长度的内容将被截断，显示省略号
 */
const MAX_PREVIEW_CHARS = 200;

/**
 * 思考消息组件
 * 显示推理模型的思考内容，固定截断显示
 *
 * 特点：
 * - 最多显示 200 个字符
 * - 超过部分截断并显示省略号
 * - 使用 textThinking 颜色（灰色斜体）
 */
export function ThinkingMessage({ message }: ThinkingMessageProps) {
  const { colors } = useTheme();

  const content = message.content || '';
  const isStreaming = message.isStreaming;

  // 判断是否需要截断
  const shouldTruncate = content.length > MAX_PREVIEW_CHARS;

  // 生成显示内容：截取前 200 个字符 + 省略号
  const displayContent = shouldTruncate ? content.slice(0, MAX_PREVIEW_CHARS) + '...' : content;

  return (
    <Box width="100%" flexDirection="column" paddingX={2} marginTop={1}>
      {/* 标题行 */}
      <Box>
        <Text color={colors.textThinking} italic>
          Thinking
        </Text>
        {isStreaming && <Text color={colors.accent}> · streaming...</Text>}
        {shouldTruncate && !isStreaming && (
          <Text color={colors.textThinking}> · ({content.length} chars)</Text>
        )}
      </Box>

      {/* 思考内容 - 使用 textThinking 颜色，斜体 */}
      <Box paddingLeft={2} flexDirection="column">
        <Text color={colors.textThinking} italic>
          {displayContent}
        </Text>
      </Box>
    </Box>
  );
}
