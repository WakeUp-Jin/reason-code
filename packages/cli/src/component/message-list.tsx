import React from 'react'
import { Box, Text } from 'ink'
import { useTheme } from '../context/theme.js'
import { useCurrentMessages } from '../context/store.js'
import { MessageItem } from './message-item.js'

export interface MessageListProps {
  maxHeight?: number
}

/**
 * 消息列表组件
 * 显示当前会话的所有消息
 */
export function MessageList({ maxHeight }: MessageListProps) {
  const { colors } = useTheme()
  const messages = useCurrentMessages()

  if (messages.length === 0) {
    return (
      <Box
        flexGrow={1}
        alignItems="center"
        justifyContent="center"
        flexDirection="column"
      >
        <Text color={colors.textMuted}>No messages yet.</Text>
        <Text color={colors.textMuted}>
          Type a message below to start the conversation.
        </Text>
      </Box>
    )
  }

  return (
    <Box
      flexDirection="column"
      flexGrow={1}
      paddingX={2}
      paddingY={1}
      height={maxHeight}
      overflowY="hidden"
    >
      {messages.map((message, index) => (
        <MessageItem
          key={message.id}
          message={message}
          isLast={index === messages.length - 1}
        />
      ))}
    </Box>
  )
}

