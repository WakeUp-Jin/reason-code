import React, { useEffect } from 'react'
import { Box, Text } from 'ink'
import { useTheme } from '../context/theme.js'

export type ToastVariant = 'info' | 'success' | 'warning' | 'error'

export interface ToastProps {
  message: string
  title?: string
  variant?: ToastVariant
  duration?: number
  onDismiss?: () => void
}

/**
 * Toast 通知组件
 * 用于显示临时消息
 */
export function Toast({
  message,
  title,
  variant = 'info',
  duration = 3000,
  onDismiss,
}: ToastProps) {
  const { colors } = useTheme()

  // 自动消失
  useEffect(() => {
    if (duration > 0 && onDismiss) {
      const timer = setTimeout(() => {
        onDismiss()
      }, duration)

      return () => clearTimeout(timer)
    }
  }, [duration, onDismiss])

  // 变体颜色
  const variantColors: Record<ToastVariant, string> = {
    info: colors.info,
    success: colors.success,
    warning: colors.warning,
    error: colors.error,
  }

  // 变体图标
  const variantIcons: Record<ToastVariant, string> = {
    info: 'ℹ',
    success: '✓',
    warning: '⚠',
    error: '✗',
  }

  const borderColor = variantColors[variant]
  const icon = variantIcons[variant]

  return (
    <Box
      borderStyle="round"
      borderColor={borderColor}
      paddingX={2}
      paddingY={0}
    >
      <Box flexDirection="column">
        <Box gap={1}>
          <Text color={borderColor}>{icon}</Text>
          {title && (
            <Text color={borderColor} bold>
              {title}
            </Text>
          )}
        </Box>
        <Text color={colors.text}>{message}</Text>
      </Box>
    </Box>
  )
}

/**
 * Toast 容器
 * 用于在屏幕角落显示多个 Toast
 */
export interface ToastContainerProps {
  toasts: Array<{
    id: string
    message: string
    title?: string
    variant?: ToastVariant
  }>
  onDismiss: (id: string) => void
  position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left'
}

export function ToastContainer({
  toasts,
  onDismiss,
  position = 'top-right',
}: ToastContainerProps) {
  if (toasts.length === 0) return null

  return (
    <Box
      position="absolute"
      flexDirection="column"
      marginTop={position.startsWith('top') ? 1 : undefined}
      marginBottom={position.startsWith('bottom') ? 1 : undefined}
      marginRight={position.endsWith('right') ? 2 : undefined}
      marginLeft={position.endsWith('left') ? 2 : undefined}
    >
      {toasts.map((toast) => (
        <Box key={toast.id} marginBottom={1}>
          <Toast
            message={toast.message}
            title={toast.title}
            variant={toast.variant}
            onDismiss={() => onDismiss(toast.id)}
          />
        </Box>
      ))}
    </Box>
  )
}

