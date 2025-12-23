import React from 'react'
import { Box, Text } from 'ink'
import { useTheme } from '../context/theme.js'
import type { Message } from '../context/store.js'

export interface MessageItemProps {
  message: Message
  isLast?: boolean
}

/**
 * 单条消息渲染组件
 */
export function MessageItem({ message, isLast = false }: MessageItemProps) {
  const { colors } = useTheme()

  const isUser = message.role === 'user'
  const isStreaming = message.isStreaming

  // 角色颜色
  const roleColor = isUser ? colors.primary : colors.secondary

  // 角色图标
  const roleIcon = isUser ? '❯' : '🤖'

  // 角色标签
  const roleLabel = isUser ? 'You' : 'AI'

  // 时间格式化
  const time = new Date(message.timestamp)
  const timeStr = time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

  return (
    <Box flexDirection="column" marginBottom={isLast ? 0 : 1}>
      {/* 消息头部 */}
      <Box gap={2}>
        <Text color={roleColor} bold>
          {roleIcon} {roleLabel}
        </Text>
        <Text color={colors.textMuted} dimColor>
          {timeStr}
        </Text>
        {isStreaming && (
          <Text color={colors.warning}>●</Text>
        )}
      </Box>

      {/* 消息内容 */}
      <Box marginLeft={3} marginTop={0}>
        <Text color={colors.text} wrap="wrap">
          {message.content}
          {isStreaming && <Text color={colors.textMuted}>▌</Text>}
        </Text>
      </Box>
    </Box>
  )
}

