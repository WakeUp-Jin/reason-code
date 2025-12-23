import React, { createContext, useContext, useState, useMemo, useEffect, type ReactNode } from 'react'

// 主题模式
export type ThemeMode = 'dark' | 'light'

// 主题颜色定义
export interface ThemeColors {
  // 基础颜色
  primary: string
  secondary: string
  accent: string
  error: string
  warning: string
  success: string
  info: string

  // 文本颜色
  text: string
  textMuted: string
  textInverse: string

  // 背景颜色
  background: string
  backgroundPanel: string
  backgroundElement: string

  // 边框颜色
  border: string
  borderActive: string
  borderSubtle: string

  // Diff 颜色
  diffAdded: string
  diffRemoved: string
  diffContext: string
  diffAddedBg: string
  diffRemovedBg: string

  // 语法高亮
  syntaxComment: string
  syntaxKeyword: string
  syntaxFunction: string
  syntaxString: string
  syntaxNumber: string
  syntaxType: string
  syntaxOperator: string
}

// 主题数据
export interface Theme {
  name: string
  mode: ThemeMode
  colors: ThemeColors
}

// 默认 Kanagawa 主题颜色
const kanagawaDark: ThemeColors = {
  primary: '#7E9CD8',
  secondary: '#957FB8',
  accent: '#D27E99',
  error: '#E82424',
  warning: '#D7A657',
  success: '#98BB6C',
  info: '#76946A',

  text: '#DCD7BA',
  textMuted: '#727169',
  textInverse: '#1F1F28',

  background: '#1F1F28',
  backgroundPanel: '#2A2A37',
  backgroundElement: '#363646',

  border: '#54546D',
  borderActive: '#D7A657',
  borderSubtle: '#363646',

  diffAdded: '#98BB6C',
  diffRemoved: '#E82424',
  diffContext: '#727169',
  diffAddedBg: '#2D4F2D',
  diffRemovedBg: '#4F2D2D',

  syntaxComment: '#727169',
  syntaxKeyword: '#957FB8',
  syntaxFunction: '#7E9CD8',
  syntaxString: '#98BB6C',
  syntaxNumber: '#D27E99',
  syntaxType: '#7FB4CA',
  syntaxOperator: '#C0A36E',
}

const kanagawaLight: ThemeColors = {
  primary: '#2D4F67',
  secondary: '#957FB8',
  accent: '#D27E99',
  error: '#E82424',
  warning: '#D7A657',
  success: '#76946A',
  info: '#76946A',

  text: '#54433A',
  textMuted: '#9E9389',
  textInverse: '#F2E9DE',

  background: '#F2E9DE',
  backgroundPanel: '#EAE4D7',
  backgroundElement: '#E3DCD2',

  border: '#D4CBBF',
  borderActive: '#D7A657',
  borderSubtle: '#DCD4C9',

  diffAdded: '#76946A',
  diffRemoved: '#E82424',
  diffContext: '#9E9389',
  diffAddedBg: '#D4E4D4',
  diffRemovedBg: '#E4D4D4',

  syntaxComment: '#9E9389',
  syntaxKeyword: '#957FB8',
  syntaxFunction: '#2D4F67',
  syntaxString: '#76946A',
  syntaxNumber: '#D27E99',
  syntaxType: '#4E8CA2',
  syntaxOperator: '#C0A36E',
}

// 预定义主题列表
export const AVAILABLE_THEMES = [
  'kanagawa',
  'github',
  'solarized',
  'dracula',
  'nord',
  'catppuccin',
] as const

export type ThemeName = (typeof AVAILABLE_THEMES)[number]

// Context 值类型
interface ThemeContextValue {
  theme: Theme
  themeName: ThemeName
  mode: ThemeMode
  setThemeName: (name: ThemeName) => void
  setMode: (mode: ThemeMode) => void
  toggleMode: () => void
  colors: ThemeColors
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

// 获取主题颜色
function getThemeColors(name: ThemeName, mode: ThemeMode): ThemeColors {
  // 目前只实现 Kanagawa，其他主题后续添加
  if (name === 'kanagawa') {
    return mode === 'dark' ? kanagawaDark : kanagawaLight
  }
  // 默认返回 Kanagawa
  return mode === 'dark' ? kanagawaDark : kanagawaLight
}

interface ThemeProviderProps {
  children: ReactNode
  defaultTheme?: ThemeName
  defaultMode?: ThemeMode
}

export function ThemeProvider({
  children,
  defaultTheme = 'kanagawa',
  defaultMode = 'dark',
}: ThemeProviderProps) {
  const [themeName, setThemeName] = useState<ThemeName>(defaultTheme)
  const [mode, setMode] = useState<ThemeMode>(defaultMode)

  const colors = useMemo(() => getThemeColors(themeName, mode), [themeName, mode])

  const theme = useMemo<Theme>(
    () => ({
      name: themeName,
      mode,
      colors,
    }),
    [themeName, mode, colors]
  )

  const toggleMode = () => {
    setMode((prev) => (prev === 'dark' ? 'light' : 'dark'))
  }

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      themeName,
      mode,
      setThemeName,
      setMode,
      toggleMode,
      colors,
    }),
    [theme, themeName, mode, colors]
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider')
  }
  return context
}

