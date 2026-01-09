import React from 'react';
import { Box, Text } from 'ink';
import { useTheme } from '../../context/theme.js';
import { commandRegistry } from '../command/command-registry.js';

export interface PanelHelpProps {
  onClose: () => void;
}

/**
 * 帮助面板 - 显示所有可用命令
 */
export function PanelHelp({ onClose }: PanelHelpProps) {
  const { colors } = useTheme();
  const commands = commandRegistry.getAll();

  // 按分类分组命令
  const categories = commands.reduce(
    (acc, cmd) => {
      if (!acc[cmd.category]) {
        acc[cmd.category] = [];
      }
      acc[cmd.category].push(cmd);
      return acc;
    },
    {} as Record<string, typeof commands>
  );

  return (
    <Box flexDirection="column" width="100%">
      {/* 顶部标题栏 */}
      <Box
        paddingX={2}
        paddingY={1}
        borderStyle="single"
        borderBottom
        borderLeft={false}
        borderRight={false}
        borderTop={false}
        borderColor={colors.borderSubtle}
      >
        <Text color={colors.primary} bold>
          Available Commands
        </Text>
      </Box>

      {/* 内容区域 */}
      <Box flexDirection="column" flexGrow={1} paddingX={2} paddingY={1}>
        <Box>
          <Text color={colors.textMuted}>Type / followed by a command name to execute</Text>
        </Box>

        {Object.entries(categories).map(([category, cmds]) => (
          <Box key={category} flexDirection="column" marginTop={1}>
            <Text bold color={colors.primary}>
              {category}
            </Text>
            {cmds.map((cmd) => (
              <Box key={cmd.id} marginLeft={2}>
                <Text color={colors.accent}>/{cmd.name}</Text>
                <Text color={colors.textMuted}> - {cmd.description}</Text>
              </Box>
            ))}
          </Box>
        ))}
      </Box>

      {/* 底部提示栏 */}
      <Box
        paddingX={2}
        paddingY={1}
        borderStyle="single"
        borderTop
        borderLeft={false}
        borderRight={false}
        borderBottom={false}
        borderColor={colors.borderSubtle}
      >
        <Box>
          <Text>
            <Text color={colors.primary} bold>
              Esc
            </Text>
            <Text color={colors.textMuted}> Close</Text>
          </Text>
        </Box>
      </Box>
    </Box>
  );
}
