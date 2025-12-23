import React, { type ReactNode } from 'react'
import { Box, Text, useStdout } from 'ink'
import { useTheme } from '../context/theme.js'

export interface DialogProps {
  title?: string
  children: ReactNode
  width?: number | string
  height?: number | string
  footer?: ReactNode
}

/**
 * 对话框基础容器组件
 * 提供标题、边框、内容区域和底部区域
 */
export function Dialog({
  title,
  children,
  width,
  height,
  footer,
}: DialogProps) {
  const { colors } = useTheme()
  const { stdout } = useStdout()

  // 默认宽度为终端宽度的 80%
  const defaultWidth = Math.floor((stdout?.columns || 80) * 0.8)
  const dialogWidth = width ?? defaultWidth

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={colors.border}
      width={dialogWidth}
      height={height}
    >
      {/* 标题栏 */}
      {title && (
        <Box
          paddingX={2}
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
        {children}
      </Box>

      {/* 底部区域 */}
      {footer && (
        <Box
          paddingX={2}
          borderStyle="single"
          borderTop
          borderLeft={false}
          borderRight={false}
          borderBottom={false}
          borderColor={colors.borderSubtle}
        >
          {footer}
        </Box>
      )}
    </Box>
  )
}

/**
 * 对话框覆盖层
 * 用于在屏幕中央显示对话框
 */
export interface DialogOverlayProps {
  children: ReactNode
}

export function DialogOverlay({ children }: DialogOverlayProps) {
  const { stdout } = useStdout()
  const { colors } = useTheme()

  return (
    <Box
      position="absolute"
      width={stdout?.columns || 80}
      height={stdout?.rows || 24}
      alignItems="center"
      justifyContent="center"
      flexDirection="column"
    >
      {children}
    </Box>
  )
}

/**
 * 对话框快捷键提示
 */
export interface DialogHintsProps {
  hints: Array<{ key: string; label: string }>
}

export function DialogHints({ hints }: DialogHintsProps) {
  const { colors } = useTheme()

  return (
    <Box gap={3} paddingY={1}>
      {hints.map((hint, index) => (
        <Text key={index}>
          <Text color={colors.primary} bold>
            {hint.key}
          </Text>
          <Text color={colors.textMuted}> {hint.label}</Text>
        </Text>
      ))}
    </Box>
  )
}

