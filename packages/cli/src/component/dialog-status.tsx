import React from 'react'
import { Box, Text, useInput } from 'ink'
import { useTheme } from '../context/theme.js'
import { useDialog } from '../context/dialog.js'
import { useAppStore, useSessions } from '../context/store.js'
import { Dialog, DialogOverlay, DialogHints } from '../ui/dialog.js'

/**
 * 系统状态对话框
 * 显示系统信息和统计
 */
export function DialogStatus() {
  const { colors, themeName, mode } = useTheme()
  const { pop } = useDialog()
  const sessions = useSessions()
  const currentModel = useAppStore((state) => state.currentModel)
  const currentAgent = useAppStore((state) => state.currentAgent)

  // 键盘输入处理
  useInput((input, key) => {
    if (key.escape || key.return) {
      pop()
    }
  })

  // 状态项组件
  const StatusItem = ({ label, value }: { label: string; value: string | number }) => (
    <Box>
      <Box width={20}>
        <Text color={colors.textMuted}>{label}:</Text>
      </Box>
      <Text color={colors.text}>{value}</Text>
    </Box>
  )

  return (
    <DialogOverlay>
      <Dialog
        title="System Status"
        footer={
          <DialogHints
            hints={[
              { key: 'Esc', label: 'Close' },
              { key: 'Enter', label: 'Close' },
            ]}
          />
        }
      >
        <Box flexDirection="column" gap={1}>
          {/* 应用信息 */}
          <Box flexDirection="column">
            <Text color={colors.primary} bold>
              Application
            </Text>
            <Box marginLeft={2} flexDirection="column">
              <StatusItem label="Name" value="Reason CLI" />
              <StatusItem label="Version" value="0.0.1" />
              <StatusItem label="Runtime" value={`Bun ${process.version}`} />
            </Box>
          </Box>

          {/* 主题信息 */}
          <Box flexDirection="column" marginTop={1}>
            <Text color={colors.primary} bold>
              Theme
            </Text>
            <Box marginLeft={2} flexDirection="column">
              <StatusItem label="Current Theme" value={themeName} />
              <StatusItem label="Mode" value={mode} />
            </Box>
          </Box>

          {/* 会话信息 */}
          <Box flexDirection="column" marginTop={1}>
            <Text color={colors.primary} bold>
              Sessions
            </Text>
            <Box marginLeft={2} flexDirection="column">
              <StatusItem label="Total Sessions" value={sessions.length} />
            </Box>
          </Box>

          {/* AI 信息 */}
          <Box flexDirection="column" marginTop={1}>
            <Text color={colors.primary} bold>
              AI Configuration
            </Text>
            <Box marginLeft={2} flexDirection="column">
              <StatusItem label="Current Model" value={currentModel} />
              <StatusItem label="Current Agent" value={currentAgent} />
            </Box>
          </Box>
        </Box>
      </Dialog>
    </DialogOverlay>
  )
}

