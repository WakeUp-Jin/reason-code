import React, { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react'
import { Box, Text } from 'ink'
import { useTheme } from './theme.js'

// Toast 类型
export type ToastVariant = 'info' | 'success' | 'warning' | 'error'

export interface Toast {
  id: string
  message: string
  title?: string
  variant: ToastVariant
  duration: number
  createdAt: number
}

// Context 值类型
interface ToastContextValue {
  toasts: Toast[]
  show: (options: Omit<Toast, 'id' | 'createdAt'> | string) => string
  info: (message: string, title?: string) => string
  success: (message: string, title?: string) => string
  warning: (message: string, title?: string) => string
  error: (message: string, title?: string) => string
  dismiss: (id: string) => void
  clear: () => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

// 生成唯一 ID
function generateToastId(): string {
  return `toast-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
}

// Toast 组件
function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const { colors } = useTheme()

  useEffect(() => {
    const timer = setTimeout(() => {
      onDismiss()
    }, toast.duration)

    return () => clearTimeout(timer)
  }, [toast.duration, onDismiss])

  const variantColors: Record<ToastVariant, string> = {
    info: colors.info,
    success: colors.success,
    warning: colors.warning,
    error: colors.error,
  }

  const borderColor = variantColors[toast.variant]

  return (
    <Box
      borderStyle="round"
      borderColor={borderColor}
      paddingX={2}
      paddingY={0}
      marginBottom={1}
    >
      <Box flexDirection="column">
        {toast.title && (
          <Text bold color={borderColor}>
            {toast.title}
          </Text>
        )}
        <Text color={colors.text}>{toast.message}</Text>
      </Box>
    </Box>
  )
}

// Toast 容器组件
function ToastContainer({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: string) => void }) {
  if (toasts.length === 0) return null

  return (
    <Box
      position="absolute"
      flexDirection="column"
      marginTop={1}
      marginRight={2}
    >
      {toasts.map((toast) => (
        <ToastItem
          key={toast.id}
          toast={toast}
          onDismiss={() => onDismiss(toast.id)}
        />
      ))}
    </Box>
  )
}

interface ToastProviderProps {
  children: ReactNode
  maxToasts?: number
}

export function ToastProvider({ children, maxToasts = 5 }: ToastProviderProps) {
  const [toasts, setToasts] = useState<Toast[]>([])

  // 显示 Toast
  const show = useCallback((options: Omit<Toast, 'id' | 'createdAt'> | string): string => {
    const id = generateToastId()

    const toast: Toast = typeof options === 'string'
      ? {
          id,
          message: options,
          variant: 'info',
          duration: 3000,
          createdAt: Date.now(),
        }
      : {
          id,
          createdAt: Date.now(),
          ...options,
        }

    setToasts((prev) => {
      const newToasts = [...prev, toast]
      // 限制最大数量
      if (newToasts.length > maxToasts) {
        return newToasts.slice(-maxToasts)
      }
      return newToasts
    })

    return id
  }, [maxToasts])

  // 便捷方法
  const info = useCallback((message: string, title?: string): string => {
    return show({ message, title, variant: 'info', duration: 3000 })
  }, [show])

  const success = useCallback((message: string, title?: string): string => {
    return show({ message, title, variant: 'success', duration: 3000 })
  }, [show])

  const warning = useCallback((message: string, title?: string): string => {
    return show({ message, title, variant: 'warning', duration: 4000 })
  }, [show])

  const error = useCallback((message: string, title?: string): string => {
    return show({ message, title, variant: 'error', duration: 5000 })
  }, [show])

  // 关闭 Toast
  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  // 清空所有
  const clear = useCallback(() => {
    setToasts([])
  }, [])

  const value: ToastContextValue = {
    toasts,
    show,
    info,
    success,
    warning,
    error,
    dismiss,
    clear,
  }

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastContainer toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  )
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext)
  if (!context) {
    throw new Error('useToast must be used within ToastProvider')
  }
  return context
}

