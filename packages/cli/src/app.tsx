import React, { useEffect } from 'react'
import { render, Box, Text } from 'ink'
import { ThemeProvider } from './context/theme.js'
import { StoreProvider } from './context/store.js'
import { DialogProvider } from './context/dialog.js'
import { ToastProvider } from './context/toast.js'
import { RouteProvider, useRoute } from './context/route.js'
import { Home } from './routes/home.js'
import { Session } from './routes/session/index.js'
import { useTerminalSize } from './util/useTerminalSize.js'
import fs from 'fs'
import path from 'path'

const LOG_FILE = path.join(process.cwd(), 'debug-sidebar.log')

function logToFile(message: string, data?: any) {
  const timestamp = new Date().toISOString()
  const logLine = `[${timestamp}] ${message} ${data ? JSON.stringify(data, null, 2) : ''}\n`
  fs.appendFileSync(LOG_FILE, logLine)
}

// 主应用组件
function App() {
  const route = useRoute()
  const { columns: width, rows: height } = useTerminalSize()  // 使用自定义 hook

  useEffect(() => {
    logToFile('🌐 App 组件渲染', { width, height })
  }, [width, height])

  return (
    <Box
      key={`app-${width}-${height}`}  // 强制在尺寸变化时重新挂载整个应用树
      flexDirection="column"
      width={width}
      height={height}
    >
      {route.current === 'home' ? <Home /> : <Session />}
    </Box>
  )
}

// 根组件，包含所有 Provider
function Root() {
  return (
    <ThemeProvider>
      <StoreProvider>
        <DialogProvider>
          <ToastProvider>
            <RouteProvider>
              <App />
            </RouteProvider>
          </ToastProvider>
        </DialogProvider>
      </StoreProvider>
    </ThemeProvider>
  )
}

// TUI 启动函数
export async function startTUI(): Promise<void> {
  return new Promise((resolve) => {
    const { waitUntilExit } = render(<Root />)
    waitUntilExit().then(resolve)
  })
}

export { Root, App }

