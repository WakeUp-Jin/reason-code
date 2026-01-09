import React from 'react';
import { Box, Text } from 'ink';
import { useTheme } from '../../context/theme.js';
import { useCurrentSession } from '../../context/store.js';

// ASCII Logo
const LOGO = `
██████╗ ███████╗ █████╗ ███████╗ ██████╗ ███╗   ██╗
██╔══██╗██╔════╝██╔══██╗██╔════╝██╔═══██╗████╗  ██║
██████╔╝█████╗  ███████║███████╗██║   ██║██╔██╗ ██║
██╔══██╗██╔══╝  ██╔══██║╚════██║██║   ██║██║╚██╗██║
██║  ██║███████╗██║  ██║███████║╚██████╔╝██║ ╚████║
╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝╚══════╝ ╚═════╝ ╚═╝  ╚═══╝`;

export function Header() {
  const { colors } = useTheme();
  const session = useCurrentSession();

  return (
    <Box flexDirection="column" flexShrink={0}>
      {/* ASCII Logo */}
      <Box flexDirection="column" alignItems="center" marginBottom={1}>
        <Text color={colors.primary}>{LOGO}</Text>
        <Text color={colors.textMuted}>AI Agent CLI powered by Reason</Text>
      </Box>

      {/* Session 标题 */}
      {/* <Box flexDirection="row" borderStyle="round" borderColor={colors.border}>
        <Text color={colors.border}>┃ </Text>
        <Text color={colors.text}>
          <Text bold># </Text>
          <Text bold>{session?.title || 'New Session'}</Text>
        </Text>
      </Box> */}
    </Box>
  );
}
