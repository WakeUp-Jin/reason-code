import React, { useMemo } from 'react'
import { Box, Spacer, Text, useInput } from 'ink'
import { useTheme } from '../../context/theme.js'
import { useCurrentMessages, useAppStore } from '../../context/store.js'
import { useExecutionStats } from '../../hooks/useExecutionStats.js'
import { getCurrencySymbol } from '../../util/token.js'

export function Footer() {
  const { colors } = useTheme()
  const messages = useCurrentMessages()
  const realtimeStats = useExecutionStats()

  // 获取 Agent 和 Model 信息
  const currentAgent = useAppStore((state) => state.currentAgent)
  const currentModel = useAppStore((state) => state.currentModel)
  const models = useAppStore((state) => state.models)
  const currentModelInfo = models.find(m => m.id === currentModel)

  // 获取货币配置和 approvalMode
  const config = useAppStore((state) => state.config)
  const currency = config.currency
  const exchangeRate = config.exchangeRate
  const approvalMode = config.approvalMode
  const toggleApprovalMode = useAppStore((state) => state.toggleApprovalMode)
  const currencySymbol = getCurrencySymbol(currency)

  // 监听 shift+tab 切换 approvalMode
  useInput((input, key) => {
    if (key.shift && key.tab) {
      toggleApprovalMode()
    }
  })

  // 计算 Context 信息（历史 + 实时叠加）
  const contextInfo = useMemo(() => {
    const maxTokens = currentModelInfo?.maxTokens || 64_000
    const pricing = currentModelInfo?.pricing

    // ===== 第一层：历史数据（已完成的 assistant 消息）=====
    let historicalTokens = 0
    let historicalCost = 0

    messages.forEach((msg) => {
      if (msg.role === 'assistant' && msg.metadata?.tokenUsage) {
        historicalTokens += msg.metadata.tokenUsage.totalTokens
      }
      if (msg.role === 'assistant' && msg.metadata?.cost) {
        historicalCost += msg.metadata.cost.totalCost
      }
    })

    // ===== 第二层：实时数据（正在进行的对话）=====
    const realtimeTokens = realtimeStats.totalTokens

    // 计算实时费用（模型定价是人民币）
    let realtimeCost = 0
    if (realtimeTokens > 0 && pricing) {
      const costCNY =
        (realtimeStats.inputTokens / 1_000_000) * pricing.input +
        (realtimeStats.outputTokens / 1_000_000) * pricing.output

      // 如果用户选择美元，转换为美元
      realtimeCost = currency === 'USD' ? costCNY / exchangeRate : costCNY
    }

    // ===== 第三层：总计（叠加）=====
    const totalTokens = historicalTokens + realtimeTokens
    const totalCost = historicalCost + realtimeCost
    const percentage = Math.min(100, Math.round((totalTokens / maxTokens) * 100))

    return {
      tokens: totalTokens,
      percentage,
      cost: `${currencySymbol}${totalCost.toFixed(4)}`,
    }
  }, [messages, realtimeStats, currentModelInfo, currency, exchangeRate, currencySymbol])

  // 格式化 approvalMode 显示
  const approvalModeDisplay = useMemo(() => {
    switch (approvalMode) {
      case 'default':
        return 'default'
      case 'auto_edit':
        return 'accept edits on'
      case 'yolo':
        return 'plan mode on'
      default:
        return 'default'
    }
  }, [approvalMode])

  // ApprovalMode 显示颜色（根据模式不同使用不同颜色）
  const approvalModeColor = useMemo(() => {
    switch (approvalMode) {
      case 'default':
        return colors.textMuted
      case 'auto_edit':
        return colors.info
      case 'yolo':
        return colors.warning
      default:
        return colors.textMuted
    }
  }, [approvalMode, colors])

  // Agent 颜色
  const agentColor = colors.primary

  return (
    <Box flexShrink={0}>
      {/* 左侧：ApprovalMode + Agent + Model */}
      <Box gap={1}>
        <Text color={approvalModeColor}>{approvalModeDisplay}</Text>
        <Text color={colors.textMuted}>|</Text>
        <Text color={agentColor}>{currentAgent}</Text>
        <Text color={colors.text}>{currentModelInfo?.name || currentModel}</Text>
        <Text color={colors.textMuted}>{currentModelInfo?.provider}</Text>
      </Box>

      {/* 中间填充 */}
      <Spacer />

      {/* 右侧：Context 数据 */}
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
