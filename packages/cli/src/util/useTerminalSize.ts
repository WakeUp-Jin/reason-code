import { useEffect, useState } from 'react'

/**
 * 监听终端尺寸变化的 Hook
 * 直接监听 process.stdout 的 resize 事件，不依赖 Ink 的 useStdout
 */
export function useTerminalSize(): { columns: number; rows: number } {
  const [size, setSize] = useState({
    columns: process.stdout.columns || 80,
    rows: process.stdout.rows || 24,
  })

  useEffect(() => {
    function updateSize() {
      setSize({
        columns: process.stdout.columns || 80,
        rows: process.stdout.rows || 24,
      })
    }

    process.stdout.on('resize', updateSize)
    return () => {
      process.stdout.off('resize', updateSize)
    }
  }, [])

  return size
}
