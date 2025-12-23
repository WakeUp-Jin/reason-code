import React, { useState } from 'react'
import { Box, Text, useInput } from 'ink'
import TextInput from 'ink-text-input'
import { useTheme } from '../context/theme.js'
import { Dialog, DialogOverlay, DialogHints } from './dialog.js'

export interface DialogPromptProps {
  title?: string
  message?: string
  placeholder?: string
  defaultValue?: string
  onSubmit: (value: string) => void
  onCancel: () => void
  validate?: (value: string) => string | null // 返回错误消息或 null
}

/**
 * 输入对话框
 * 用于获取用户文本输入
 */
export function DialogPrompt({
  title = 'Input',
  message,
  placeholder = 'Enter value...',
  defaultValue = '',
  onSubmit,
  onCancel,
  validate,
}: DialogPromptProps) {
  const { colors } = useTheme()
  const [value, setValue] = useState(defaultValue)
  const [error, setError] = useState<string | null>(null)

  // 键盘输入处理
  useInput((input, key) => {
    // Escape 取消
    if (key.escape) {
      onCancel()
      return
    }

    // Enter 提交
    if (key.return) {
      // 验证输入
      if (validate) {
        const validationError = validate(value)
        if (validationError) {
          setError(validationError)
          return
        }
      }

      onSubmit(value)
      return
    }
  })

  // 处理输入变化
  const handleChange = (newValue: string) => {
    setValue(newValue)
    // 清除之前的错误
    if (error) {
      setError(null)
    }
  }

  return (
    <DialogOverlay>
      <Dialog
        title={title}
        footer={
          <DialogHints
            hints={[
              { key: 'Enter', label: 'Submit' },
              { key: 'Esc', label: 'Cancel' },
            ]}
          />
        }
      >
        {/* 消息 */}
        {message && (
          <Box marginBottom={1}>
            <Text color={colors.text}>{message}</Text>
          </Box>
        )}

        {/* 输入框 */}
        <Box
          borderStyle="round"
          borderColor={error ? colors.error : colors.border}
          paddingX={1}
        >
          <Text color={colors.primary}>❯ </Text>
          <TextInput
            value={value}
            onChange={handleChange}
            placeholder={placeholder}
          />
        </Box>

        {/* 错误消息 */}
        {error && (
          <Box marginTop={1}>
            <Text color={colors.error}>✗ {error}</Text>
          </Box>
        )}
      </Dialog>
    </DialogOverlay>
  )
}

