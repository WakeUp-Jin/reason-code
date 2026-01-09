import React, { type ReactNode } from 'react';
import { Box, Text, useInput } from 'ink';
import { useTheme } from '../../context/theme.js';

export interface CommandPanelProps {
  command: string; // 执行的命令（如 "model"）
  panel: ReactNode; // 功能面板组件
  onClose: () => void;
}

/**
 * 功能面板容器组件
 * 显示功能面板，底部显示命令提示
 * 处理 Esc 关闭
 */
export function CommandPanel({ command, panel, onClose }: CommandPanelProps) {
  const { colors } = useTheme();

  // 键盘处理 - Esc 关闭面板
  useInput((input, key) => {
    if (key.escape) {
      onClose();
    }
  });

  return (
    <Box flexDirection="column" flexShrink={0}>
      {/* 功能面板区域 */}
      <Box flexDirection="column" flexGrow={1}>
        {panel}
      </Box>

      {/* 底部命令提示 */}
      <Box
        marginTop={1}
        paddingX={2}
        paddingY={1}
        borderStyle="single"
        borderTop={true}
        borderBottom={false}
        borderLeft={false}
        borderRight={false}
        borderColor={colors.border}
      >
        <Text color={colors.primary}>❯ </Text>
        <Text color={colors.text}>/{command}</Text>
        <Text color={colors.textMuted}> · Press Esc to cancel</Text>
      </Box>
    </Box>
  );
}
