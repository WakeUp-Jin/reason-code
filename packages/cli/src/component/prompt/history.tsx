import { useState, useCallback } from 'react'

export interface UsePromptHistoryOptions {
  maxHistory?: number
}

export interface UsePromptHistoryReturn {
  history: string[]
  historyIndex: number
  addToHistory: (value: string) => void
  navigateUp: () => string | null
  navigateDown: () => string | null
  resetNavigation: () => void
  clearHistory: () => void
}

/**
 * Prompt 历史记录 Hook
 * 管理输入历史和上下键导航
 */
export function usePromptHistory(
  options: UsePromptHistoryOptions = {}
): UsePromptHistoryReturn {
  const { maxHistory = 100 } = options

  const [history, setHistory] = useState<string[]>([])
  const [historyIndex, setHistoryIndex] = useState(-1)

  // 添加到历史记录
  const addToHistory = useCallback(
    (value: string) => {
      if (!value.trim()) return

      setHistory((prev) => {
        // 避免重复添加相同的最后一条
        if (prev.length > 0 && prev[prev.length - 1] === value) {
          return prev
        }

        const newHistory = [...prev, value]

        // 限制历史记录数量
        if (newHistory.length > maxHistory) {
          return newHistory.slice(-maxHistory)
        }

        return newHistory
      })

      // 重置导航索引
      setHistoryIndex(-1)
    },
    [maxHistory]
  )

  // 向上导航（更早的历史）
  const navigateUp = useCallback((): string | null => {
    if (history.length === 0) return null

    const newIndex = historyIndex === -1 ? history.length - 1 : Math.max(0, historyIndex - 1)

    setHistoryIndex(newIndex)
    return history[newIndex] || null
  }, [history, historyIndex])

  // 向下导航（更新的历史）
  const navigateDown = useCallback((): string | null => {
    if (history.length === 0 || historyIndex === -1) return null

    const newIndex = historyIndex + 1

    if (newIndex >= history.length) {
      setHistoryIndex(-1)
      return null // 返回空，表示回到当前输入
    }

    setHistoryIndex(newIndex)
    return history[newIndex] || null
  }, [history, historyIndex])

  // 重置导航
  const resetNavigation = useCallback(() => {
    setHistoryIndex(-1)
  }, [])

  // 清空历史
  const clearHistory = useCallback(() => {
    setHistory([])
    setHistoryIndex(-1)
  }, [])

  return {
    history,
    historyIndex,
    addToHistory,
    navigateUp,
    navigateDown,
    resetNavigation,
    clearHistory,
  }
}

