import React, { useState } from 'react';
import { Box, Text } from 'ink';
import { useTheme } from '../../context/theme.js';
import type { Message } from '../../context/store.js';

export interface ThinkingMessageProps {
  message: Message;
}

/**
 * 思考消息组件
 * 显示推理模型的思考内容，支持折叠/展开
 */
export function ThinkingMessage({ message }: ThinkingMessageProps) {
  const { colors } = useTheme();
  const [isExpanded, setIsExpanded] = useState(false);

  const content = message.content || '';
  const isStreaming = message.isStreaming;

  // 预览行数
  const PREVIEW_LINES = 3;
  const lines = content.split('\n');
  const shouldCollapse = lines.length > PREVIEW_LINES;
  const previewContent = shouldCollapse
    ? lines.slice(0, PREVIEW_LINES).join('\n') + '...'
    : content;

  const displayContent = isExpanded ? content : previewContent;

  return (
    <Box width="100%" flexDirection="column" paddingX={2} marginTop={1}>
      {/* 标题行 */}
      <Box>
        <Text color={colors.textMuted} italic>
          Thinking
        </Text>
        {isStreaming && <Text color={colors.accent}> · streaming...</Text>}
        {shouldCollapse && !isStreaming && (
          <Text color={colors.textMuted}>
            {' '}
            · {isExpanded ? '(expanded)' : `(${lines.length} lines)`}
          </Text>
        )}
      </Box>

      {/* 思考内容 */}
      <Box paddingLeft={2} flexDirection="column">
        <Text color={colors.textMuted} dimColor>
          {displayContent}
        </Text>
      </Box>

      {/* 展开/折叠提示 */}
      {shouldCollapse && !isStreaming && (
        <Box paddingLeft={2} marginTop={0}>
          <Text color={colors.info} dimColor>
            [{isExpanded ? 'collapsed' : 'expand'}]
          </Text>
        </Box>
      )}
    </Box>
  );
}
