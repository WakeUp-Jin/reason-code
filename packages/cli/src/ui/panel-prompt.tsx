import React, { useState } from 'react'
import { Box, Text, useInput } from 'ink'
import TextInput from 'ink-text-input'
import { useTheme } from '../context/theme.js'

export interface PanelPromptProps {
  title?: string
  message?: string
  placeholder?: string
  defaultValue?: string
  onSubmit: (value: string) => void
  onCancel: () => void
  validate?: (value: string) => string | null // 返回错误消息或 null
}

/**
 * 面板式输入组件
 * 用于获取用户文本输入
 */
export function PanelPrompt({
  title = 'Input',
  message,
  placeholder = 'Enter value...',
  defaultValue = '',
  onSubmit,
  onCancel,
  validate,
}: PanelPromptProps) {
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
    <Box flexDirection="column" width="100%">
      {/* 顶部标题栏 */}
      {title && (
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
            {title}
          </Text>
        </Box>
      )}

      {/* 内容区域 */}
      <Box flexDirection="column" flexGrow={1} paddingX={2} paddingY={1}>
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
        <Box gap={3}>
          <Text>
            <Text color={colors.primary} bold>
              Enter
            </Text>
            <Text color={colors.textMuted}> Submit</Text>
          </Text>
          <Text>
            <Text color={colors.primary} bold>
              Esc
            </Text>
            <Text color={colors.textMuted}> Cancel</Text>
          </Text>
        </Box>
      </Box>
    </Box>
  )
}
