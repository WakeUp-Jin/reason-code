import React, { useState, useMemo, useEffect } from 'react'
import { Box, Text, useInput, useApp, useStdout } from 'ink'
import { useTheme } from '../../context/theme.js'
import { useRoute } from '../../context/route.js'
import { useCurrentMessages, useCurrentSession, useStore, useAppStore } from '../../context/store.js'
import { Header } from './header.js'
import { Footer } from './footer.js'
import { Sidebar } from './sidebar.js'
import { Prompt } from '../../component/prompt/index.js'
import fs from 'fs'
import path from 'path'

// 宽度阈值
const WIDE_THRESHOLD = 120
const TALL_THRESHOLD = 40

// 日志文件路径
const LOG_FILE = path.join(process.cwd(), 'debug-sidebar.log')

// 写日志到文件
function logToFile(message: string, data?: any) {
  const timestamp = new Date().toISOString()
  const logLine = `[${timestamp}] ${message} ${data ? JSON.stringify(data, null, 2) : ''}\n`
  fs.appendFileSync(LOG_FILE, logLine)
}

// 侧边栏状态类型
type SidebarState = 'show' | 'hide' | 'auto'

// 单条用户消息组件 - 带左边框
function UserMessage({ content }: { content: string }) {
  const { colors } = useTheme()
  const username = 'You'
  
  return (
    <Box marginTop={1} paddingY={1}>
      <Text color={colors.primary}>┃ </Text>
      <Box flexDirection="column" paddingLeft={1}>
        <Text color={colors.text}>{content}</Text>
        <Text color={colors.textMuted}>{username}</Text>
      </Box>
    </Box>
  )
}

// 单条 AI 消息组件 - 无前缀
function AssistantMessage({ content }: { content: string }) {
  const { colors } = useTheme()
  const currentModel = useAppStore((state) => state.currentModel)
  const currentAgent = useAppStore((state) => state.currentAgent)
  
  return (
    <Box flexDirection="column" marginTop={1} paddingLeft={3} paddingY={1}>
      <Text color={colors.text}>{content}</Text>
      <Box marginTop={1}>
        <Text color={colors.secondary}>▣ </Text>
        <Text color={colors.text}>{currentAgent}</Text>
        <Text color={colors.textMuted}> · {currentModel}</Text>
      </Box>
    </Box>
  )
}

// 消息区域
function MessageArea() {
  const { colors } = useTheme()
  const messages = useCurrentMessages()

  if (messages.length === 0) {
    return (
      <Box
        flexGrow={1}
        alignItems="center"
        justifyContent="center"
        flexDirection="column"
      >
        <Text color={colors.textMuted}>No messages yet.</Text>
        <Text color={colors.textMuted}>Type a message below to start the conversation.</Text>
      </Box>
    )
  }

  return (
    <Box flexGrow={1} flexDirection="column" paddingX={2} paddingY={1}>
      {messages.map((message) => (
        message.role === 'user' 
          ? <UserMessage key={message.id} content={message.content} />
          : <AssistantMessage key={message.id} content={message.content} />
      ))}
    </Box>
  )
}

// 输入区域 - 使用 Prompt 组件
function InputArea() {
  const addMessage = useStore((state) => state.addMessage)
  const session = useCurrentSession()

  const handleSubmit = (value: string) => {
    if (!session) return
    
    // 添加用户消息
    addMessage(session.id, {
      role: 'user',
      content: value,
      sessionId: session.id,
    })
    
    // TODO: 这里可以触发 AI 响应
    // 暂时添加一个模拟的 AI 响应
    setTimeout(() => {
      addMessage(session.id, {
        role: 'assistant',
        content: `You said: "${value}"\n\nThis is a mock response. AI integration coming soon!`,
        sessionId: session.id,
      })
    }, 500)
  }

  return (
    <Box flexShrink={0}>
      <Prompt
        onSubmit={handleSubmit}
        placeholder="Type your message..."
      />
    </Box>
  )
}

export function Session() {
  const { colors } = useTheme()
  const { goHome } = useRoute()
  const { exit } = useApp()
  const { stdout } = useStdout()
  const session = useCurrentSession()
  
  // 侧边栏状态
  const [sidebarState, setSidebarState] = useState<SidebarState>('auto')
  
  // 获取终端尺寸
  const width = stdout?.columns || 80
  const height = stdout?.rows || 24
  
  // 计算响应式状态
  const wide = width > WIDE_THRESHOLD
  const tall = height > TALL_THRESHOLD
  
  // 侧边栏可见性
  const sidebarVisible = useMemo(() => {
    if (sidebarState === 'show') return true
    if (sidebarState === 'hide') return false
    // auto 模式：宽屏时显示
    return wide
  }, [sidebarState, wide])
  
  // Overlay 模式（窄屏强制显示时）
  const sidebarOverlay = sidebarVisible && !wide

  // 添加日志：监控 Session 组件重新渲染
  useEffect(() => {
    logToFile('📱 Session 重新渲染', {
      width,
      height,
      wide,
      sidebarVisible,
      sidebarOverlay,
    })
  }, [width, height, wide, sidebarVisible, sidebarOverlay])

  // 键盘输入处理
  useInput((input, key) => {
    // Ctrl+C 退出
    if (key.ctrl && input === 'c') {
      exit()
      return
    }

    // Ctrl+B 切换侧边栏
    if (key.ctrl && input === 'b') {
      setSidebarState((prev) => {
        if (prev === 'auto') return sidebarVisible ? 'hide' : 'show'
        if (prev === 'show') return 'hide'
        return 'show'
      })
      return
    }

    // Esc 返回首页（如果侧边栏 overlay 打开，先关闭它）
    if (key.escape) {
      if (sidebarOverlay) {
        setSidebarState('hide')
        return
      }
      goHome()
      return
    }
  })

  // 如果没有当前会话，显示错误
  if (!session) {
    return (
      <Box flexDirection="column" alignItems="center" justifyContent="center">
        <Text color={colors.error}>No session selected</Text>
        <Text color={colors.textMuted}>Press Esc to go back home</Text>
      </Box>
    )
  }

  return (
    <Box flexDirection="row" width="100%" height="100%">
      {/* 主内容区 */}
      <Box
        flexDirection="column"
        flexGrow={1}
        paddingTop={1}
        paddingBottom={1}
        paddingLeft={2}
        paddingRight={2}
      >
        {/* 只在侧边栏不可见或 overlay 模式时显示 Header */}
        {(!sidebarVisible || sidebarOverlay) && <Header />}

        {/* 消息区域 */}
        <MessageArea />

        {/* 输入区域 */}
        <InputArea />

        {/* 只在高屏且（侧边栏不可见或 overlay 模式）时显示 Footer */}
        {tall && (!sidebarVisible || sidebarOverlay) && <Footer />}
      </Box>

      {/* 侧边栏 - 非 overlay 模式（并排显示） */}
      {sidebarVisible && !sidebarOverlay && (
        <Sidebar sessionId={session.id} />
      )}

      {/* 侧边栏 - overlay 模式（浮动显示）- 按 Esc 关闭 */}
      {sidebarOverlay && (
        <Box
          position="absolute"
          width={width}
          height={height}
          flexDirection="row"
          justifyContent="flex-end"
        >
          {/* 侧边栏本身 */}
          <Sidebar sessionId={session.id} />
        </Box>
      )}
    </Box>
  )
}
