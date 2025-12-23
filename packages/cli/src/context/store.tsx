import React, { createContext, useContext, type ReactNode } from 'react'
import { create } from 'zustand'

// Session 类型
export interface Session {
  id: string
  title: string
  createdAt: number
  updatedAt: number
}

// Message 类型
export interface Message {
  id: string
  sessionId: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
  isStreaming?: boolean
}

// Agent 类型
export interface AgentInfo {
  id: string
  name: string
  description: string
}

// Model 类型
export interface ModelInfo {
  id: string
  name: string
  provider: string
}

// 配置类型
export interface Config {
  theme: string
  mode: 'dark' | 'light'
  currentAgent: string
  currentModel: string
}

// Store 状态类型
interface AppState {
  // Session 相关
  sessions: Session[]
  currentSessionId: string | null

  // Message 相关
  messages: Record<string, Message[]>

  // Agent 相关
  agents: AgentInfo[]
  currentAgent: string

  // Model 相关
  models: ModelInfo[]
  currentModel: string

  // 配置
  config: Config

  // Session Actions
  createSession: (title?: string) => Session
  deleteSession: (id: string) => void
  renameSession: (id: string, title: string) => void
  switchSession: (id: string) => void

  // Message Actions
  addMessage: (sessionId: string, message: Omit<Message, 'id' | 'timestamp'>) => Message
  updateMessage: (sessionId: string, messageId: string, updates: Partial<Message>) => void
  appendMessageContent: (sessionId: string, messageId: string, delta: string) => void

  // Agent/Model Actions
  setCurrentAgent: (agentId: string) => void
  setCurrentModel: (modelId: string) => void

  // Config Actions
  updateConfig: (updates: Partial<Config>) => void
}

// 生成唯一 ID
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
}

// 创建 Zustand Store
export const useAppStore = create<AppState>((set, get) => ({
  // 初始状态
  sessions: [],
  currentSessionId: null,
  messages: {},
  agents: [
    { id: 'default', name: 'Default Agent', description: 'General purpose AI assistant' },
    { id: 'coder', name: 'Coder', description: 'Specialized in coding tasks' },
  ],
  currentAgent: 'default',
  models: [
    { id: 'claude-sonnet-4', name: 'Claude Sonnet 4', provider: 'Anthropic' },
    { id: 'gpt-4o', name: 'GPT-4o', provider: 'OpenAI' },
    { id: 'gemini-pro', name: 'Gemini Pro', provider: 'Google' },
  ],
  currentModel: 'claude-sonnet-4',
  config: {
    theme: 'kanagawa',
    mode: 'dark',
    currentAgent: 'default',
    currentModel: 'claude-sonnet-4',
  },

  // Session Actions
  createSession: (title) => {
    const session: Session = {
      id: generateId(),
      title: title || `Session ${get().sessions.length + 1}`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }

    set((state) => ({
      sessions: [...state.sessions, session],
      currentSessionId: session.id,
      messages: { ...state.messages, [session.id]: [] },
    }))

    return session
  },

  deleteSession: (id) => {
    set((state) => {
      const { [id]: _, ...remainingMessages } = state.messages
      const newSessions = state.sessions.filter((s) => s.id !== id)
      return {
        sessions: newSessions,
        messages: remainingMessages,
        currentSessionId: state.currentSessionId === id
          ? (newSessions[0]?.id || null)
          : state.currentSessionId,
      }
    })
  },

  renameSession: (id, title) => {
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === id ? { ...s, title, updatedAt: Date.now() } : s
      ),
    }))
  },

  switchSession: (id) => {
    set({ currentSessionId: id })
  },

  // Message Actions
  addMessage: (sessionId, messageData) => {
    const message: Message = {
      id: generateId(),
      sessionId,
      timestamp: Date.now(),
      ...messageData,
    }

    set((state) => ({
      messages: {
        ...state.messages,
        [sessionId]: [...(state.messages[sessionId] || []), message],
      },
      sessions: state.sessions.map((s) =>
        s.id === sessionId ? { ...s, updatedAt: Date.now() } : s
      ),
    }))

    return message
  },

  updateMessage: (sessionId, messageId, updates) => {
    set((state) => ({
      messages: {
        ...state.messages,
        [sessionId]: (state.messages[sessionId] || []).map((m) =>
          m.id === messageId ? { ...m, ...updates } : m
        ),
      },
    }))
  },

  appendMessageContent: (sessionId, messageId, delta) => {
    set((state) => ({
      messages: {
        ...state.messages,
        [sessionId]: (state.messages[sessionId] || []).map((m) =>
          m.id === messageId ? { ...m, content: m.content + delta } : m
        ),
      },
    }))
  },

  // Agent/Model Actions
  setCurrentAgent: (agentId) => {
    set({ currentAgent: agentId })
  },

  setCurrentModel: (modelId) => {
    set({ currentModel: modelId })
  },

  // Config Actions
  updateConfig: (updates) => {
    set((state) => ({
      config: { ...state.config, ...updates },
    }))
  },
}))

// Context（用于 Provider 模式，虽然 Zustand 不需要，但保持一致性）
const StoreContext = createContext<typeof useAppStore | null>(null)

interface StoreProviderProps {
  children: ReactNode
}

export function StoreProvider({ children }: StoreProviderProps) {
  return (
    <StoreContext.Provider value={useAppStore}>
      {children}
    </StoreContext.Provider>
  )
}

// 导出 Hook
export function useStore<T>(selector: (state: AppState) => T): T {
  return useAppStore(selector)
}

// 便捷 Hooks
export function useCurrentSession(): Session | null {
  return useAppStore((state) => {
    const id = state.currentSessionId
    return id ? state.sessions.find((s) => s.id === id) || null : null
  })
}

export function useCurrentMessages(): Message[] {
  return useAppStore((state) => {
    const id = state.currentSessionId
    return id ? state.messages[id] || [] : []
  })
}

export function useSessions(): Session[] {
  return useAppStore((state) => state.sessions)
}

