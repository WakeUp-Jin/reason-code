import React, { useEffect } from 'react'
import { Box, Text } from 'ink'
import { useTheme } from '../../context/theme.js'
import { useCurrentSession, useCurrentMessages } from '../../context/store.js'
import { useTerminalSize } from '../../util/useTerminalSize.js'
import fs from 'fs'
import path from 'path'

const VERSION = '0.0.1'
const SIDEBAR_WIDTH = 38

// 日志文件路径
const LOG_FILE = path.join(process.cwd(), 'debug-sidebar.log')

// 写日志到文件
function logToFile(message: string, data?: any) {
  const timestamp = new Date().toISOString()
  const logLine = `[${timestamp}] ${message} ${data ? JSON.stringify(data, null, 2) : ''}\n`
  fs.appendFileSync(LOG_FILE, logLine)
}

interface SidebarProps {
  sessionId: string
}

export function Sidebar({ sessionId }: SidebarProps) {
  const { colors } = useTheme()
  const session = useCurrentSession()
  const messages = useCurrentMessages()
  const cwd = process.cwd()

  // 使用统一的终端尺寸 hook
  const { columns: terminalWidth, rows: terminalHeight } = useTerminalSize()

  // 添加日志：监控重新渲染
  useEffect(() => {
    logToFile('🔄 Sidebar 重新渲染', {
      width: terminalWidth,
      height: terminalHeight,
      sidebarWidth: SIDEBAR_WIDTH,
    })
  }, [terminalWidth, terminalHeight])

  // 计算可用宽度（用于 Ink 的 wrap 属性）
  // SIDEBAR_WIDTH = 38（总宽度，包括边框和 padding）
  // 左边框 = 1 字符（borderStyle="single"）
  // paddingX = 2（左右各 1）
  // 实际文本可用宽度 = 38 - 1（左边框）- 2（左 padding）- 1（右 padding）= 34
  // 但为了保险，再减 2
  const availableWidth = SIDEBAR_WIDTH - 6  // 38 - 6 = 32

  // 计算 context 信息（模拟数据）
  const contextInfo = {
    tokens: messages.reduce((acc, m) => acc + m.content.length, 0),
    percentage: Math.min(100, Math.round(messages.length * 5)),
    cost: `$${(messages.length * 0.001).toFixed(3)}`,
  }

  return (
    <Box
      flexDirection="column"
      width={SIDEBAR_WIDTH}
      height="100%"
      flexShrink={0}
      borderStyle="single"
      borderColor={colors.border}
      borderTop={false}
      borderBottom={false}
      borderRight={false}
      paddingX={2}
      paddingY={1}
    >
      {/* 会话标题 - 使用内层 Box 指定宽度 */}
      <Box width={availableWidth}>
        <Text color={colors.text} bold wrap="wrap">
          {session?.title || 'New Session'}哈哈哈哈哈哈哈哈哈哈
        </Text>
      </Box>
      
      <Box height={1} />

      {/* Context 信息 */}
      <Text color={colors.text} bold>Context</Text>
      <Text color={colors.textMuted}>{contextInfo.tokens.toLocaleString()} tokens</Text>
      <Text color={colors.textMuted}>{contextInfo.percentage}% used</Text>
      <Text color={colors.textMuted}>{contextInfo.cost} spent</Text>
      
      <Box height={1} />

      {/* LSP 信息 */}
      <Text color={colors.text} bold>LSP</Text>
      <Text color={colors.textMuted}>LSPs will activate</Text>
      <Text color={colors.textMuted}>as files are read</Text>
      
      <Box flexGrow={1} />

      {/* 底部固定区域 - 使用内层 Box 指定宽度 */}
      <Box width={availableWidth}>
        <Text color={colors.textMuted} wrap="wrap">
          {cwd}
        </Text>
      </Box>
      
      <Box height={1} />
      
      <Box>
        <Text color={colors.success}>• </Text>
        <Text color={colors.text} bold>Reason</Text>
        <Text color={colors.primary} bold>CLI</Text>
        <Text color={colors.textMuted}> {VERSION}</Text>
      </Box>
    </Box>
  )
}
