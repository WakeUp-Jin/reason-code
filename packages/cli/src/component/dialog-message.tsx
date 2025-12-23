import React from 'react'
import { Box, Text, useInput } from 'ink'
import { useTheme } from '../context/theme.js'
import { useDialog } from '../context/dialog.js'
import { Dialog, DialogOverlay, DialogHints } from '../ui/dialog.js'
import type { Message } from '../context/store.js'

export interface DialogMessageProps {
  message: Message
}

/**
 * 消息详情对话框
 * 显示完整的消息内容
 */
export function DialogMessage({ message }: DialogMessageProps) {
  const { colors } = useTheme()
  const { pop } = useDialog()

  const isUser = message.role === 'user'
  const roleColor = isUser ? colors.primary : colors.secondary
  const roleIcon = isUser ? '❯' : '🤖'
  const roleLabel = isUser ? 'You' : 'AI'

  // 时间格式化
  const time = new Date(message.timestamp)
  const dateStr = time.toLocaleDateString()
  const timeStr = time.toLocaleTimeString()

  // 键盘输入处理
  useInput((input, key) => {
    if (key.escape || key.return) {
      pop()
    }
  })

  return (
    <DialogOverlay>
      <Dialog
        title="Message Details"
        footer={
          <DialogHints
            hints={[
              { key: 'Esc', label: 'Close' },
              { key: 'Enter', label: 'Close' },
            ]}
          />
        }
      >
        {/* 消息元信息 */}
        <Box flexDirection="column" marginBottom={2}>
          <Box gap={2}>
            <Text color={roleColor} bold>
              {roleIcon} {roleLabel}
            </Text>
          </Box>
          <Box gap={2} marginTop={1}>
            <Text color={colors.textMuted}>Time:</Text>
            <Text color={colors.text}>{dateStr} {timeStr}</Text>
          </Box>
          <Box gap={2}>
            <Text color={colors.textMuted}>ID:</Text>
            <Text color={colors.text}>{message.id}</Text>
          </Box>
        </Box>

        {/* 分隔线 */}
        <Box marginY={1}>
          <Text color={colors.borderSubtle}>{'─'.repeat(50)}</Text>
        </Box>

        {/* 消息内容 */}
        <Box>
          <Text color={colors.text} wrap="wrap">
            {message.content}
          </Text>
        </Box>
      </Dialog>
    </DialogOverlay>
  )
}

