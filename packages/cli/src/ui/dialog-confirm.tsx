import React, { useState } from 'react'
import { Box, Text, useInput } from 'ink'
import { useTheme } from '../context/theme.js'
import { Dialog, DialogOverlay, DialogHints } from './dialog.js'

export interface DialogConfirmProps {
  title?: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  onConfirm: () => void
  onCancel: () => void
  destructive?: boolean
}

/**
 * 确认对话框
 * 用于确认危险操作或重要决定
 */
export function DialogConfirm({
  title = 'Confirm',
  message,
  confirmLabel = 'Yes',
  cancelLabel = 'No',
  onConfirm,
  onCancel,
  destructive = false,
}: DialogConfirmProps) {
  const { colors } = useTheme()
  const [selectedIndex, setSelectedIndex] = useState(destructive ? 1 : 0)

  // 键盘输入处理
  useInput((input, key) => {
    // Escape 取消
    if (key.escape) {
      onCancel()
      return
    }

    // Enter 确认选择
    if (key.return) {
      if (selectedIndex === 0) {
        onConfirm()
      } else {
        onCancel()
      }
      return
    }

    // 左右键切换
    if (key.leftArrow || key.rightArrow) {
      setSelectedIndex((prev) => (prev === 0 ? 1 : 0))
      return
    }

    // Tab 切换
    if (key.tab) {
      setSelectedIndex((prev) => (prev === 0 ? 1 : 0))
      return
    }

    // Y 键确认
    if (input.toLowerCase() === 'y') {
      onConfirm()
      return
    }

    // N 键取消
    if (input.toLowerCase() === 'n') {
      onCancel()
      return
    }
  })

  const confirmColor = destructive ? colors.error : colors.success
  const cancelColor = colors.textMuted

  return (
    <DialogOverlay>
      <Dialog
        title={title}
        footer={
          <DialogHints
            hints={[
              { key: 'Y', label: confirmLabel },
              { key: 'N', label: cancelLabel },
              { key: '←→', label: 'Switch' },
              { key: 'Enter', label: 'Confirm' },
            ]}
          />
        }
      >
        {/* 消息 */}
        <Box marginBottom={2}>
          <Text color={colors.text}>{message}</Text>
        </Box>

        {/* 按钮 */}
        <Box gap={4} justifyContent="center">
          {/* 确认按钮 */}
          <Box
            paddingX={3}
            paddingY={0}
            borderStyle={selectedIndex === 0 ? 'round' : 'single'}
            borderColor={selectedIndex === 0 ? confirmColor : colors.border}
          >
            <Text
              color={selectedIndex === 0 ? confirmColor : colors.textMuted}
              bold={selectedIndex === 0}
            >
              {confirmLabel}
            </Text>
          </Box>

          {/* 取消按钮 */}
          <Box
            paddingX={3}
            paddingY={0}
            borderStyle={selectedIndex === 1 ? 'round' : 'single'}
            borderColor={selectedIndex === 1 ? cancelColor : colors.border}
          >
            <Text
              color={selectedIndex === 1 ? colors.text : colors.textMuted}
              bold={selectedIndex === 1}
            >
              {cancelLabel}
            </Text>
          </Box>
        </Box>
      </Dialog>
    </DialogOverlay>
  )
}

