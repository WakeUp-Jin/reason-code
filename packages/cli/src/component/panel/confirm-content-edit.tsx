import React from 'react';
import { Box, Text } from 'ink';
import { useTheme } from '../../context/theme.js';

export interface ConfirmContentEditProps {
  /** 内容预览 */
  contentPreview?: string;
}

/**
 * Edit 工具确认内容组件
 * 上下虚线包裹：只显示内容预览
 */
export function ConfirmContentEdit({ contentPreview }: ConfirmContentEditProps) {
  const { colors } = useTheme();

  if (!contentPreview) {
    return null;
  }

  // 生成虚线
  const dashedLine = '─ '.repeat(30);

  return (
    <Box flexDirection="column" marginTop={1}>
      {/* 上虚线 */}
      <Box>
        <Text color={colors.borderSubtle}>{dashedLine}</Text>
      </Box>

      {/* 内容预览 */}
      <Box flexDirection="column" paddingX={1} paddingY={0}>
        {contentPreview.split('\n').map((line, index) => (
          <Text key={index} color={colors.text}>
            {line}
          </Text>
        ))}
      </Box>

      {/* 下虚线 */}
      <Box>
        <Text color={colors.borderSubtle}>{dashedLine}</Text>
      </Box>
    </Box>
  );
}
