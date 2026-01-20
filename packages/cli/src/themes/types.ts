/**
 * 主题类型定义
 * 
 * 设计理念：
 * 1. 终端自适应颜色：使用 ANSI 颜色名称，让终端根据自身主题决定实际颜色
 * 2. 主题固定颜色：使用 HEX 颜色值，保持品牌一致性
 */

import type { AnsiColorName } from './color-utils.js'

// 重新导出 AnsiColorName 类型
export type { AnsiColorName } from './color-utils.js'

// 颜色值类型：可以是 ANSI 名称或 HEX 值
export type ColorValue = AnsiColorName | string

/**
 * 基础色板（固定 HEX 颜色）
 * 这些是主题的品牌色，在任何终端都保持一致
 */
export interface ThemePalette {
  // 品牌色
  purple: string    // Claude Code 紫色
  blue: string      // 蓝色
  cyan: string      // 青色
  green: string     // 绿色
  yellow: string    // 黄色
  orange: string    // 橙色
  red: string       // 红色
  
  // 灰度色（用于背景等）
  gray: string      // 灰色
  darkGray: string  // 深灰
  lightGray: string // 浅灰
  
  // 扩展色板（可选）
  [key: string]: string
}

/**
 * 语义化颜色
 * 分为两类：
 * - 终端自适应：使用 ANSI 颜色名称（如 'white', 'gray'）
 * - 主题固定：使用 HEX 颜色值或 $palette 引用
 */
export interface SemanticColors {
  // ========== 文本颜色 ==========
  text: {
    primary: ColorValue      // 主文本 - 'white'（终端自适应）
    secondary: ColorValue    // 次要文本 - 'gray'（终端自适应）
    thinking: ColorValue     // 思考文本 - 'gray'（终端自适应）
    inverse: ColorValue      // 反色文本 - 用于深色背景上的文字
  }

  // ========== Markdown 颜色 ==========
  markdown: {
    heading: string          // 标题颜色（固定）
    inlineCode: string       // 行内代码颜色（固定）
    filePath: string         // 文件路径颜色（固定）
  }
  
  // ========== 背景颜色 ==========
  background: {
    primary: ColorValue      // 主背景 - 'black'（终端自适应）
    panel: string            // 面板背景 - HEX（输入框等）
    element: string          // 元素背景 - HEX
    userMessage: string      // 用户消息背景 - HEX（淡紫色）
  }
  
  // ========== 边框颜色 ==========
  border: {
    default: ColorValue      // 默认边框 - 'gray'（终端自适应）
    active: string           // 激活边框 - HEX
    subtle: string           // 微妙边框 - HEX
  }
  
  // ========== 品牌颜色（固定） ==========
  brand: {
    primary: string          // 主品牌色 - 紫色（AI/品牌）
    secondary: string        // 次品牌色 - 蓝色（用户）
    accent: string           // 强调色 - 橙色
  }
  
  // ========== 状态颜色 ==========
  status: {
    error: string            // 错误 - 红色
    warning: string          // 警告 - 黄色
    success: string          // 成功 - 绿色
    info: string             // 信息 - 青色
    pending: ColorValue      // 等待 - 'gray'（终端自适应）
    running: string          // 运行中 - 黄色
  }
  
  // ========== 语法高亮（固定） ==========
  syntax: {
    keyword: string          // 关键字 - 紫色
    function: string         // 函数 - 蓝色
    string: string           // 字符串 - 绿色
    number: string           // 数字 - 橙色
    comment: ColorValue      // 注释 - 'gray'（终端自适应）
    type: string             // 类型 - 青色
    operator: string         // 运算符 - 黄色
  }
  
  // ========== Diff 颜色 ==========
  diff: {
    added: string            // 添加 - 绿色
    removed: string          // 删除 - 红色
    context: ColorValue      // 上下文 - 'gray'（终端自适应）
    addedBg: string          // 添加背景 - 深绿
    removedBg: string        // 删除背景 - 深红
  }
  
  // ========== 消息颜色 ==========
  message: {
    user: string             // 用户消息 - 蓝色
    assistant: string        // AI 消息 - 紫色
    system: ColorValue       // 系统消息 - 'gray'（终端自适应）
  }
  
  // ========== Logo 颜色（固定） ==========
  logo: {
    primary: string          // Logo 主色
    accent: string           // Logo 强调色
  }
}

/**
 * 完整主题 JSON 结构（新格式）
 */
export interface ThemeJSON {
  name: string
  displayName: string
  author?: string
  version?: string
  
  // 基础色板
  palette: ThemePalette
  
  // 语义化颜色
  colors: SemanticColors
}

/**
 * 解析后的主题（所有 $引用 已解析）
 */
export interface ResolvedTheme {
  name: string
  displayName: string
  palette: ThemePalette
  colors: SemanticColors
}

// ========== 兼容旧格式的类型（用于迁移期） ==========

/**
 * @deprecated 使用 ThemePalette 代替
 */
export interface ThemeDefs {
  black: string
  white: string
  gray: string
  red: string
  green: string
  yellow: string
  blue: string
  purple: string
  cyan: string
  orange: string
  [key: string]: string
}

/**
 * @deprecated 使用 SemanticColors 代替
 */
export interface ThemeSemantic {
  primary: string
  secondary: string
  accent: string
  error: string
  warning: string
  success: string
  info: string
  text: string
  textMuted: string
  textInverse: string
  textThinking: string
  background: string
  backgroundPanel: string
  backgroundElement: string
  border: string
  borderActive: string
  borderSubtle: string
  diffAdded: string
  diffRemoved: string
  diffContext: string
  diffAddedBg: string
  diffRemovedBg: string
  syntaxComment: string
  syntaxKeyword: string
  syntaxFunction: string
  syntaxString: string
  syntaxNumber: string
  syntaxType: string
  syntaxOperator: string
  messageUser: string
  messageAssistant: string
  messageSystem: string
  statusPending: string
  statusRunning: string
  statusSuccess: string
  statusError: string
  logo: string
  logoAccent: string
}

/**
 * @deprecated 使用 ThemeJSON 代替
 */
export interface LegacyThemeJSON {
  name: string
  displayName: string
  author?: string
  version?: string
  dark: {
    defs: ThemeDefs
    theme: ThemeSemantic
  }
  light: {
    defs: ThemeDefs
    theme: ThemeSemantic
  }
}
