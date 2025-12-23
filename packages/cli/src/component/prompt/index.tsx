import React, { useState, useCallback } from 'react'
import { Box, Text, useInput, useStdout } from 'ink'
import TextInput from 'ink-text-input'
import { useTheme } from '../../context/theme.js'
import { useAppStore } from '../../context/store.js'
import { usePromptHistory } from './history.js'

export interface PromptProps {
  onSubmit: (value: string) => void
  onCancel?: () => void
  placeholder?: string
  disabled?: boolean
}

/**
 * 主输入框组件
 * 支持历史记录、快捷键，带左边框高亮
 */
export function Prompt({
  onSubmit,
  onCancel,
  placeholder = 'Type your message...',
  disabled = false,
}: PromptProps) {
  const { colors } = useTheme()
  const { stdout } = useStdout()
  const [value, setValue] = useState('')
  const [currentInput, setCurrentInput] = useState('')
  const { addToHistory, navigateUp, navigateDown, resetNavigation } = usePromptHistory()
  
  const currentAgent = useAppStore((state) => state.currentAgent)
  const currentModel = useAppStore((state) => state.currentModel)
  const models = useAppStore((state) => state.models)
  const currentModelInfo = models.find(m => m.id === currentModel)

  // 处理输入变化
  const handleChange = useCallback(
    (newValue: string) => {
      setValue(newValue)
      setCurrentInput(newValue)
      resetNavigation()
    },
    [resetNavigation]
  )

  // 处理提交
  const handleSubmit = useCallback(() => {
    const trimmedValue = value.trim()
    if (!trimmedValue) return

    addToHistory(trimmedValue)
    onSubmit(trimmedValue)
    setValue('')
    setCurrentInput('')
  }, [value, addToHistory, onSubmit])

  // 键盘输入处理
  useInput(
    (input, key) => {
      if (disabled) return

      // Enter 提交
      if (key.return) {
        handleSubmit()
        return
      }

      // Escape 取消
      if (key.escape && onCancel) {
        onCancel()
        return
      }

      // 上键：历史记录向上
      if (key.upArrow) {
        const historyValue = navigateUp()
        if (historyValue !== null) {
          setValue(historyValue)
        }
        return
      }

      // 下键：历史记录向下
      if (key.downArrow) {
        const historyValue = navigateDown()
        if (historyValue !== null) {
          setValue(historyValue)
        } else {
          // 回到当前输入
          setValue(currentInput)
        }
        return
      }
    },
    { isActive: !disabled }
  )

  // Agent 颜色
  const agentColor = colors.primary
  
  // 左侧文本
  const leftText = `${currentAgent} ${currentModelInfo?.name || currentModel} ${currentModelInfo?.provider || ''}`
  // 右侧文本
  const rightText = 'tab switch agent  ctrl+p commands'

  return (
    <Box flexDirection="column" paddingX={2} paddingBottom={1}>
      {/* 输入框区域 - 带左边框 */}
      <Box minHeight={3} paddingY={1}>
        <Text color={agentColor}>┃ </Text>
        <Box flexGrow={1} paddingLeft={1}>
          {disabled ? (
            <Text color={colors.textMuted}>{placeholder}</Text>
          ) : (
            <TextInput
              value={value}
              onChange={handleChange}
              placeholder={placeholder}
            />
          )}
        </Box>
      </Box>

      {/* 底部信息栏 - 简化为单行 Text */}
      <Text>
        <Text color={agentColor}>{currentAgent}</Text>
        <Text color={colors.text}> {currentModelInfo?.name || currentModel}</Text>
        <Text color={colors.textMuted}> {currentModelInfo?.provider}</Text>
        <Text>{'                    '}</Text>
        <Text color={colors.text} bold>tab</Text>
        <Text color={colors.textMuted}> switch agent  </Text>
        <Text color={colors.text} bold>ctrl+p</Text>
        <Text color={colors.textMuted}> commands</Text>
      </Text>
    </Box>
  )
}

// 导出历史记录 Hook
export { usePromptHistory } from './history.js'
