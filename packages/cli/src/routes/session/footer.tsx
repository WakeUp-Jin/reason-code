import React, { useMemo } from 'react'
import { Box, Spacer, Text, useInput } from 'ink'
import { useTheme } from '../../context/theme.js'
import { useAppStore } from '../../context/store.js'
import { useAgentStats } from '../../hooks/useAgentStats.js'
import { getCurrencySymbol } from '../../util/token.js'

export function Footer() {
  const { colors } = useTheme()

  // 从 Agent 内存获取统计数据
  const agentStats = useAgentStats()

  // 获取 Model 信息
  const currentModel = useAppStore((state) => state.currentModel)
  const models = useAppStore((state) => state.models)
  const currentModelInfo = models.find(m => m.id === currentModel)

  // 获取货币配置和 approvalMode
  const config = useAppStore((state) => state.config)
  const currency = config.currency
  const approvalMode = config.approvalMode
  const toggleApprovalMode = useAppStore((state) => state.toggleApprovalMode)
  const currencySymbol = getCurrencySymbol(currency)

  // 监听 shift+tab 切换 approvalMode
  useInput((input, key) => {
    if (key.shift && key.tab) {
      toggleApprovalMode()
    }
  })

  // 从 Agent 内存获取上下文信息
  // Token: 当前上下文大小（实时计算）
  // Cost: 累计费用
  const contextInfo = useMemo(() => {
    // 如果 Agent 还没有数据，使用默认值
    if (!agentStats.hasData) {
      return {
        tokens: 0,
        percentage: 0,
        cost: `${currencySymbol}0.0000`,
      }
    }

    return {
      tokens: agentStats.contextTokens,
      percentage: Math.round(agentStats.percentage),
      cost: `${currencySymbol}${agentStats.totalCost.toFixed(4)}`,
    }
  }, [agentStats, currencySymbol])

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

  return (
    <Box flexShrink={0}>
      {/* 左侧：ApprovalMode + Model */}
      <Box gap={1}>
        <Text color={approvalModeColor}>{approvalModeDisplay}</Text>
        <Text color={colors.textMuted}>|</Text>
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
