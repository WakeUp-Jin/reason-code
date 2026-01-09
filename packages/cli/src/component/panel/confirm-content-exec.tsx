import React from 'react';
import { Box, Text } from 'ink';
import { useTheme } from '../../context/theme.js';

export interface ConfirmContentExecProps {
  /** 命令 */
  command?: string;
  /** 描述信息 */
  message?: string;
}

/**
 * Exec 工具确认内容组件
 * 无边框：显示命令（缩进高亮）+ 描述信息
 */
export function ConfirmContentExec({ command, message }: ConfirmContentExecProps) {
  const { colors } = useTheme();

  return (
    <Box flexDirection="column" marginTop={1} paddingX={1}>
      {/* 命令（缩进，高亮色） */}
      {command && (
        <Box marginLeft={2}>
          <Text color={colors.accent}>{command}</Text>
        </Box>
      )}

      {/* 描述信息（灰色） */}
      {message && (
        <Box marginLeft={2} marginTop={0}>
          <Text color={colors.textMuted}>{message}</Text>
        </Box>
      )}
    </Box>
  );
}

