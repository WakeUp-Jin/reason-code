import React from 'react';
import { Box, Text } from 'ink';
import { useTheme } from '../../context/theme.js';
import type { Message } from '../../context/store.js';

export interface ToolMessageProps {
  message: Message;
}

/**
 * 工具消息组件
 * 显示工具执行状态：executing（黄色）、success（绿色）、error（红色）
 * 如果有 thinkingContent，在工具信息上方显示灰色斜体文本
 */
export function ToolMessage({ message }: ToolMessageProps) {
  const { colors } = useTheme();
  const { toolCall } = message;

  if (!toolCall) {
    return null;
  }

  // 状态配置
  const statusConfig = {
    executing: {
      color: colors.warning,
      icon: '○',
      text: 'executing...',
    },
    success: {
      color: colors.success,
      icon: '●',
      text: toolCall.resultSummary || 'completed',
    },
    error: {
      color: colors.error,
      icon: '●',
      text: toolCall.error || 'failed',
    },
  };

  const config = statusConfig[toolCall.status] || statusConfig.executing;

  // 格式化耗时
  const formatDuration = (ms: number | undefined): string => {
    if (!ms) return '';
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  const durationText = formatDuration(toolCall.duration);

  return (
    <Box width="100%" flexDirection="column" paddingX={2} marginTop={1}>
      {/* 工具调用前的思考内容（灰色斜体） */}
      {toolCall.thinkingContent && (
        <Box>
          <Text color={colors.text}>{toolCall.thinkingContent}</Text>
        </Box>
      )}

      {/* 工具名称和参数摘要 */}
      <Box>
        <Text color={config.color}>{config.icon} </Text>
        <Text color={colors.text} bold>
          {toolCall.toolName}
        </Text>
        {toolCall.paramsSummary && (
          <Text color={colors.textMuted}> ({toolCall.paramsSummary})</Text>
        )}
        {durationText && <Text color={colors.textMuted}> · {durationText}</Text>}
      </Box>

      {/* 执行状态/结果 */}
      <Box paddingLeft={2}>
        <Text color={colors.textMuted}>└ </Text>
        <Text color={config.color}>{config.text}</Text>
      </Box>
    </Box>
  );
}
