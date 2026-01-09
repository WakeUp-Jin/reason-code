import React from 'react';
import { Box, Text } from 'ink';
import { useTheme } from '../../context/theme.js';
import { useExecutionState } from '../../context/execution.js';
import type { Message } from '../../context/store.js';

export interface ThinkingMessageProps {
  message: Message;
}

/**
 * 思考内容最大显示字符数
 * 计算方式：一行约 50 字符 × 1.5 行 - 3（省略号）= 72 字符
 */
const MAX_PREVIEW_CHARS = 72;

/**
 * 思考消息组件
 * 显示推理模型的思考内容，支持折叠/展开（通过 ctrl+o 全局控制）
 *
 * 特点：
 * - 默认显示最多 72 个字符（约 1.5 行）
 * - 使用 textThinking 颜色（灰色斜体）
 * - 展开状态由全局 ExecutionContext 控制
 */
export function ThinkingMessage({ message }: ThinkingMessageProps) {
  const { colors } = useTheme();
  const { isThinkingExpanded } = useExecutionState();

  const content = message.content || '';
  const isStreaming = message.isStreaming;

  // 判断是否需要折叠
  const shouldCollapse = content.length > MAX_PREVIEW_CHARS;

  // 生成预览内容：截取前 72 个字符 + 省略号
  const previewContent = shouldCollapse ? content.slice(0, MAX_PREVIEW_CHARS) + '...' : content;

  // 使用全局展开状态
  const displayContent = isThinkingExpanded ? content : previewContent;

  return (
    <Box width="100%" flexDirection="column" paddingX={2} marginTop={1}>
      {/* 标题行 */}
      <Box>
        <Text color={colors.textThinking} italic>
          Thinking
        </Text>
        {isStreaming && <Text color={colors.accent}> · streaming...</Text>}
        {shouldCollapse && !isStreaming && (
          <Text color={colors.textThinking}>
            {' '}
            · {isThinkingExpanded ? '(expanded)' : `(${content.length} chars)`}
          </Text>
        )}
      </Box>

      {/* 思考内容 - 使用 textThinking 颜色，斜体 */}
      <Box paddingLeft={2} flexDirection="column">
        <Text color={colors.textThinking} italic>
          {displayContent}
        </Text>
      </Box>

      {/* 展开/折叠提示 */}
      {shouldCollapse && !isStreaming && (
        <Box paddingLeft={2} marginTop={0}>
          <Text color={colors.textThinking}>
            [ctrl+o to {isThinkingExpanded ? 'collapse' : 'expand'}]
          </Text>
        </Box>
      )}
    </Box>
  );
}
