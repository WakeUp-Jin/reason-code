import React, { useMemo } from 'react'
import { Box, Spacer, Text } from 'ink'
import { useTheme } from '../../context/theme.js'
import { useCurrentMessages, useAppStore } from '../../context/store.js'

export function Footer() {
  const { colors } = useTheme()
  const messages = useCurrentMessages()

  // 获取 Agent 和 Model 信息
  const currentAgent = useAppStore((state) => state.currentAgent)
  const currentModel = useAppStore((state) => state.currentModel)
  const models = useAppStore((state) => state.models)
  const currentModelInfo = models.find(m => m.id === currentModel)

  // 计算 Context 信息（基于 metadata）
  const contextInfo = useMemo(() => {
    let totalInputTokens = 0
    let totalOutputTokens = 0
    let totalCost = 0

    // 从 metadata 中读取真实的 token 使用情况
    messages.forEach((msg) => {
      if (msg.metadata?.tokenUsage) {
        totalInputTokens += msg.metadata.tokenUsage.inputTokens
        totalOutputTokens += msg.metadata.tokenUsage.outputTokens
      }
      if (msg.metadata?.cost) {
        totalCost += msg.metadata.cost.totalCost
      }
    })

    const totalTokens = totalInputTokens + totalOutputTokens

    // 基于模型的 maxTokens 计算百分比
    const maxTokens = currentModelInfo?.maxTokens || 200_000
    const percentage = Math.min(100, Math.round((totalTokens / maxTokens) * 100))

    return {
      tokens: totalTokens,
      percentage,
      cost: `$${totalCost.toFixed(4)}`,
    }
  }, [messages, currentModelInfo])

  // Agent 颜色
  const agentColor = colors.primary

  return (
    <Box flexShrink={0}>
      <Box>
      <Text color={agentColor}>{currentAgent}</Text>
        <Text color={colors.text}> {currentModelInfo?.name || currentModel}</Text>
        <Text color={colors.textMuted}> {currentModelInfo?.provider}</Text>
      </Box>
      {/* 中间填充 */}
      {/* <Box flexGrow={1} /> */}

      <Spacer></Spacer>

      {/* 右侧：Context 数据 + Agent 信息 */}
      <Box gap={1}>
        <Text color={colors.textMuted}>
          {contextInfo.tokens.toLocaleString()} tokens
        </Text>
        <Text color={colors.textMuted}>|</Text>
        <Text color={colors.textMuted}>{contextInfo.percentage}%</Text>
        <Text color={colors.textMuted}>|</Text>
        <Text color={colors.textMuted}>{contextInfo.cost}</Text>

      </Box>
    </Box>
  )
}
