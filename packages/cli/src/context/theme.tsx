/**
 * 主题 Context
 * 
 * 设计理念：
 * - 使用 ANSI 颜色名称实现终端自适应（text, textMuted 等）
 * - 使用 HEX 颜色保持品牌一致性（primary, error 等）
 * - 不再区分 dark/light 模式，由终端自动适配
 */

import React, {
  createContext,
  useContext,
  useState,
  useMemo,
  type ReactNode,
} from 'react'
import { loadTheme } from '../themes/loader.js'
import type { SemanticColors, ThemePalette } from '../themes/types.js'

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

// 主题数据
export interface Theme {
  name: string
  displayName: string
  palette: ThemePalette
  colors: SemanticColors
}

// 兼容旧的 ThemeColors 接口（扁平化访问）
export interface ThemeColors {
  // 品牌色
  primary: string
  secondary: string
  accent: string
  
  // 状态色
  error: string
  warning: string
  success: string
  info: string
  
  // 文本颜色
  text: string
  textMuted: string
  textInverse: string
  textThinking: string

  // Markdown 颜色
  markdownHeading: string
  markdownInlineCode: string
  markdownFilePath: string
  
  // 背景颜色
  background: string
  backgroundPanel: string
  backgroundElement: string
  backgroundUserMessage: string
  
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

/**
 * 将新的 SemanticColors 转换为扁平的 ThemeColors
 * 用于兼容现有组件
 */
function flattenColors(colors: SemanticColors): ThemeColors {
  return {
    // 品牌色
    primary: colors.brand.primary,
    secondary: colors.brand.secondary,
    accent: colors.brand.accent,
    
    // 状态色
    error: colors.status.error,
    warning: colors.status.warning,
    success: colors.status.success,
    info: colors.status.info,
    
    // 文本颜色
    text: colors.text.primary,
    textMuted: colors.text.secondary,
    textInverse: colors.text.inverse,
    textThinking: colors.text.thinking,

    // Markdown 颜色
    markdownHeading: colors.markdown.heading,
    markdownInlineCode: colors.markdown.inlineCode,
    markdownFilePath: colors.markdown.filePath,
    
    // 背景颜色
    background: colors.background.primary,
    backgroundPanel: colors.background.panel,
    backgroundElement: colors.background.element,
    backgroundUserMessage: colors.background.userMessage,
    
    // 边框颜色
    border: colors.border.default,
    borderActive: colors.border.active,
    borderSubtle: colors.border.subtle,
    
    // Diff 颜色
    diffAdded: colors.diff.added,
    diffRemoved: colors.diff.removed,
    diffContext: colors.diff.context,
    diffAddedBg: colors.diff.addedBg,
    diffRemovedBg: colors.diff.removedBg,
    
    // 语法高亮
    syntaxComment: colors.syntax.comment,
    syntaxKeyword: colors.syntax.keyword,
    syntaxFunction: colors.syntax.function,
    syntaxString: colors.syntax.string,
    syntaxNumber: colors.syntax.number,
    syntaxType: colors.syntax.type,
    syntaxOperator: colors.syntax.operator,
  }
}

// Context 值类型
interface ThemeContextValue {
  theme: Theme
  themeName: ThemeName
  setThemeName: (name: ThemeName) => void
  
  // 新的语义化颜色访问
  semanticColors: SemanticColors
  palette: ThemePalette
  
  // 兼容旧的扁平颜色访问
  colors: ThemeColors
  
  // @deprecated 不再需要 mode，终端自动适配
  mode: 'dark'
  setMode: (mode: 'dark' | 'light') => void
  toggleMode: () => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

// 默认主题（当加载失败时使用）
const DEFAULT_PALETTE: ThemePalette = {
  purple: '#957FB8',
  blue: '#7E9CD8',
  codeBlue: '#736FF3',
  cyan: '#7FB4CA',
  green: '#98BB6C',
  yellow: '#DCA561',
  orange: '#FFA066',
  red: '#E82424',
  gray: '#727169',
  darkGray: '#363646',
  lightGray: '#54546D',
}

const DEFAULT_COLORS: SemanticColors = {
  text: {
    primary: 'white',
    secondary: 'gray',
    thinking: 'gray',
    inverse: 'black',
  },
  markdown: {
    heading: '#19A34A',
    inlineCode: '#736FF3',
    filePath: '#736FF3',
  },
  background: {
    primary: 'black',
    panel: '#2A2A37',
    element: '#363646',
    userMessage: '#2D2B3A',
  },
  border: {
    default: 'gray',
    active: '#DCA561',
    subtle: '#363646',
  },
  brand: {
    primary: '#957FB8',
    secondary: '#7E9CD8',
    accent: '#FFA066',
  },
  status: {
    error: '#E82424',
    warning: '#DCA561',
    success: '#98BB6C',
    info: '#7FB4CA',
    pending: 'gray',
    running: '#DCA561',
  },
  syntax: {
    keyword: '#957FB8',
    function: '#7E9CD8',
    string: '#98BB6C',
    number: '#FFA066',
    comment: 'gray',
    type: '#7FB4CA',
    operator: '#DCA561',
  },
  diff: {
    added: '#98BB6C',
    removed: '#E82424',
    context: 'gray',
    addedBg: '#2D4F2D',
    removedBg: '#4F2D2D',
  },
  message: {
    user: '#7E9CD8',
    assistant: '#957FB8',
    system: 'gray',
  },
  logo: {
    primary: '#957FB8',
    accent: '#7E9CD8',
  },
}

interface ThemeProviderProps {
  children: ReactNode
  defaultTheme?: ThemeName
}

export function ThemeProvider({
  children,
  defaultTheme = 'kanagawa',
}: ThemeProviderProps) {
  const [themeName, setThemeName] = useState<ThemeName>(defaultTheme)
  
  // 加载主题
  const resolvedTheme = useMemo(() => {
    const loaded = loadTheme(themeName)
    if (loaded) {
      return loaded
    }
    // 回退到默认主题
    return {
      name: 'kanagawa',
      displayName: 'Kanagawa',
      palette: DEFAULT_PALETTE,
      colors: DEFAULT_COLORS,
    }
  }, [themeName])
  
  // 构建 Theme 对象
  const theme = useMemo<Theme>(() => ({
    name: resolvedTheme.name,
    displayName: resolvedTheme.displayName,
    palette: resolvedTheme.palette,
    colors: resolvedTheme.colors,
  }), [resolvedTheme])
  
  // 扁平化颜色（兼容旧组件）
  const flatColors = useMemo(() => flattenColors(resolvedTheme.colors), [resolvedTheme.colors])
  
  // Context 值
  const value = useMemo<ThemeContextValue>(() => ({
    theme,
    themeName,
    setThemeName,
    semanticColors: resolvedTheme.colors,
    palette: resolvedTheme.palette,
    colors: flatColors,
    // 兼容旧 API（不再有实际作用）
    mode: 'dark' as const,
    setMode: () => {},
    toggleMode: () => {},
  }), [theme, themeName, resolvedTheme, flatColors])
  
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider')
  }
  return context
}

// 导出类型
export type { SemanticColors, ThemePalette }
