import React from 'react'
import { Box, Text } from 'ink'
import { useTheme } from '../../context/theme.js'
import { useCurrentSession } from '../../context/store.js'

export function Header() {
  const { colors } = useTheme()
  const session = useCurrentSession()

  return (
    <Box flexDirection="row" flexShrink={0} paddingY={1}>
      {/* 左边框 */}
      <Text color={colors.border}>┃ </Text>
      <Text color={colors.text}>
        <Text bold># </Text>
        <Text bold>{session?.title || 'New Session'}</Text>
      </Text>
    </Box>
  )
}
