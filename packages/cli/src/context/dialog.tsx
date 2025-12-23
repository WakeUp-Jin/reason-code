import React, { createContext, useContext, useState, useCallback, type ReactNode } from 'react'

// Dialog 类型
export interface DialogItem {
  id: string
  component: ReactNode
}

// Context 值类型
interface DialogContextValue {
  stack: DialogItem[]
  push: (component: ReactNode) => string
  pop: () => void
  replace: (component: ReactNode) => string
  clear: () => void
  isOpen: boolean
  current: DialogItem | null
}

const DialogContext = createContext<DialogContextValue | null>(null)

// 生成唯一 ID
function generateDialogId(): string {
  return `dialog-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
}

interface DialogProviderProps {
  children: ReactNode
}

export function DialogProvider({ children }: DialogProviderProps) {
  const [stack, setStack] = useState<DialogItem[]>([])

  // 添加一个 Dialog 到堆栈
  const push = useCallback((component: ReactNode): string => {
    const id = generateDialogId()
    setStack((prev) => [...prev, { id, component }])
    return id
  }, [])

  // 移除最顶层的 Dialog
  const pop = useCallback(() => {
    setStack((prev) => prev.slice(0, -1))
  }, [])

  // 替换整个堆栈为单个 Dialog
  const replace = useCallback((component: ReactNode): string => {
    const id = generateDialogId()
    setStack([{ id, component }])
    return id
  }, [])

  // 清空所有 Dialog
  const clear = useCallback(() => {
    setStack([])
  }, [])

  const isOpen = stack.length > 0
  const current = stack.length > 0 ? stack[stack.length - 1] : null

  const value: DialogContextValue = {
    stack,
    push,
    pop,
    replace,
    clear,
    isOpen,
    current,
  }

  return (
    <DialogContext.Provider value={value}>
      {children}
      {/* Dialog 渲染层 */}
      {current && current.component}
    </DialogContext.Provider>
  )
}

export function useDialog(): DialogContextValue {
  const context = useContext(DialogContext)
  if (!context) {
    throw new Error('useDialog must be used within DialogProvider')
  }
  return context
}

