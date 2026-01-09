/**
 * 思考展示组件
 * 显示推理模型的思考过程，可展开/收起
 */

import React from 'react';
import { Box, Text } from 'ink';
import { useTheme } from '../../context/theme.js';
import type { ThinkingContent } from '@reason-cli/core';

interface ThinkingDisplayProps {
  thinking: ThinkingContent;
  isVisible: boolean;
  maxLines?: number;
}

export function ThinkingDisplay({
  thinking,
  isVisible,
  maxLines = 10
}: ThinkingDisplayProps) {
  const { colors } = useTheme();

  if (!isVisible || !thinking.content) {
    return null;
  }

  const lines = thinking.content.split('\n');
  const shouldTruncate = lines.length > maxLines;
  const displayLines = shouldTruncate ? lines.slice(0, maxLines) : lines;

  return (
    <Box flexDirection="column" paddingLeft={1}>
      {/* 标题行 */}
      <Box flexDirection="row" gap={1}>
        <Text color={colors.secondary}>▼</Text>
        <Text color={colors.secondary} bold>Thinking</Text>
        {!thinking.isComplete && (
          <Text color={colors.textMuted}>...</Text>
        )}
      </Box>

      {/* 内容区域 */}
      <Box
        flexDirection="column"
        paddingLeft={1}
        borderStyle="single"
        borderColor={colors.borderSubtle}
        borderLeft={true}
        borderRight={false}
        borderTop={false}
        borderBottom={false}
      >
        {displayLines.map((line, i) => (
          <Text key={i} color={colors.textMuted} wrap="wrap">
            {line}
          </Text>
        ))}

        {/* 截断提示 */}
        {shouldTruncate && (
          <Text color={colors.info}>
            ... ({lines.length - maxLines} more lines)
          </Text>
        )}
      </Box>

      {/* 底部分隔线 */}
      <Box paddingLeft={1}>
        <Text color={colors.borderSubtle}>
          └────────────────────────────────────────────────
        </Text>
      </Box>
    </Box>
  );
}
