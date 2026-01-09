import React, { createContext, useContext, useState, useCallback, type ReactNode } from 'react'

// 路由类型
export type RouteName = 'home' | 'session'

export interface RouteState {
  current: RouteName
  sessionId?: string
  params?: Record<string, unknown>
}

// Context 值类型
interface RouteContextValue {
  current: RouteName
  sessionId?: string
  params?: Record<string, unknown>
  navigate: (route: RouteName, options?: { sessionId?: string; params?: Record<string, unknown> }) => void
  goHome: () => void
  goToSession: (sessionId: string) => void
}

const RouteContext = createContext<RouteContextValue | null>(null)

interface RouteProviderProps {
  children: ReactNode
  initialRoute?: RouteName
}

export function RouteProvider({ children, initialRoute = 'home' }: RouteProviderProps) {
  const [state, setState] = useState<RouteState>({
    current: initialRoute,
  })

  // 导航到指定路由
  const navigate = useCallback((
    route: RouteName,
    options?: { sessionId?: string; params?: Record<string, unknown> }
  ) => {
    setState({
      current: route,
      sessionId: options?.sessionId,
      params: options?.params,
    })
  }, [])

  // 便捷方法：回到首页
  const goHome = useCallback(() => {
    navigate('home')
  }, [navigate])

  // 便捷方法：进入会话
  const goToSession = useCallback((sessionId: string) => {
    navigate('session', { sessionId })
  }, [navigate])

  const value: RouteContextValue = {
    current: state.current,
    sessionId: state.sessionId,
    params: state.params,
    navigate,
    goHome,
    goToSession,
  }

  return (
    <RouteContext.Provider value={value}>
      {children}
    </RouteContext.Provider>
  )
}

export function useRoute(): RouteContextValue {
  const context = useContext(RouteContext)
  if (!context) {
    throw new Error('useRoute must be used within RouteProvider')
  }
  return context
}

