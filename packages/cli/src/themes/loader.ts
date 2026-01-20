/**
 * 主题加载器
 * 
 * 支持新的主题格式（palette + colors）和旧格式（dark/light + defs/theme）
 * 新格式使用 ANSI 颜色名称实现终端自适应
 */

import type { 
  ThemeJSON, 
  ThemePalette, 
  SemanticColors, 
  ResolvedTheme,
  LegacyThemeJSON,
  ThemeDefs,
  ThemeSemantic
} from './types.js'
import { isAnsiColorName } from './color-utils.js'
import { logger } from '../util/logger.js'

// 内置主题（新格式）
import kanagawa from './kanagawa.json' with { type: 'json' }

// 内置主题（旧格式，待迁移）
import github from './github.json' with { type: 'json' }
import dracula from './dracula.json' with { type: 'json' }
import nord from './nord.json' with { type: 'json' }
import solarized from './solarized.json' with { type: 'json' }
import catppuccin from './catppuccin.json' with { type: 'json' }

// 新格式主题
const NEW_FORMAT_THEMES: Record<string, ThemeJSON> = {
  kanagawa: kanagawa as unknown as ThemeJSON,
}

// 旧格式主题（兼容）
const LEGACY_THEMES: Record<string, LegacyThemeJSON> = {
  github: github as LegacyThemeJSON,
  dracula: dracula as LegacyThemeJSON,
  nord: nord as LegacyThemeJSON,
  solarized: solarized as LegacyThemeJSON,
  catppuccin: catppuccin as LegacyThemeJSON,
}

/**
 * 检查是否是新格式主题
 */
function isNewFormatTheme(theme: unknown): theme is ThemeJSON {
  return typeof theme === 'object' && theme !== null && 'palette' in theme && 'colors' in theme
}

/**
 * 解析颜色引用
 * 将 "$colorName" 格式的引用解析为实际颜色值
 * ANSI 颜色名称保持不变
 */
function resolveColorRef(value: string, palette: ThemePalette): string {
  // 如果是 ANSI 颜色名称，直接返回
  if (isAnsiColorName(value)) {
    return value
  }
  
  // 如果是 $引用，解析为 palette 中的值
  if (value.startsWith('$')) {
    const refName = value.slice(1)
    if (refName in palette) {
      return palette[refName]
    }
    logger.warn(`Theme color reference not found: ${value}`)
    return value
  }
  
  // 其他情况（HEX 颜色等）直接返回
  return value
}

/**
 * 递归解析对象中的所有颜色引用
 */
function resolveColorsDeep<T>(obj: T, palette: ThemePalette): T {
  if (typeof obj === 'string') {
    return resolveColorRef(obj, palette) as T
  }
  
  if (typeof obj === 'object' && obj !== null) {
    const result: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(obj)) {
      result[key] = resolveColorsDeep(value, palette)
    }
    return result as T
  }
  
  return obj
}

/**
 * 加载新格式主题
 */
function loadNewFormatTheme(themeJSON: ThemeJSON): ResolvedTheme {
  const resolvedColors = resolveColorsDeep(themeJSON.colors, themeJSON.palette)
  
  return {
    name: themeJSON.name,
    displayName: themeJSON.displayName,
    palette: themeJSON.palette,
    colors: resolvedColors,
  }
}

/**
 * 将旧格式主题转换为新格式
 */
function convertLegacyTheme(legacy: LegacyThemeJSON, mode: 'dark' | 'light'): ResolvedTheme {
  const modeData = mode === 'dark' ? legacy.dark : legacy.light
  const defs = modeData.defs
  const theme = modeData.theme
  
  // 解析旧格式的颜色引用
  const resolvedTheme: Record<string, string> = {}
  for (const [key, value] of Object.entries(theme)) {
    if (value.startsWith('$')) {
      const refName = value.slice(1)
      resolvedTheme[key] = defs[refName] || value
    } else {
      resolvedTheme[key] = value
    }
  }
  
  // 转换为新格式
  const palette: ThemePalette = {
    purple: defs.purple || '#957FB8',
    blue: defs.blue || '#7E9CD8',
    codeBlue: '#736FF3',
    cyan: defs.cyan || '#7FB4CA',
    green: defs.green || '#98BB6C',
    yellow: defs.yellow || '#DCA561',
    orange: defs.orange || '#FFA066',
    red: defs.red || '#E82424',
    gray: defs.gray || '#727169',
    darkGray: defs.darkGray || defs.black || '#363646',
    lightGray: defs.lightGray || '#54546D',
  }
  
  const colors: SemanticColors = {
    text: {
      primary: 'white',
      secondary: 'gray',
      thinking: 'gray',
      inverse: 'black',
    },
    markdown: {
      heading: '#19A34A',
      inlineCode: palette.codeBlue,
      filePath: palette.codeBlue,
    },
    background: {
      primary: 'black',
      panel: resolvedTheme.backgroundPanel || palette.darkGray,
      element: resolvedTheme.backgroundElement || palette.darkGray,
      userMessage: '#2D2B3A',
    },
    border: {
      default: 'gray',
      active: resolvedTheme.borderActive || palette.yellow,
      subtle: resolvedTheme.borderSubtle || palette.darkGray,
    },
    brand: {
      primary: resolvedTheme.primary || palette.purple,
      secondary: resolvedTheme.secondary || palette.blue,
      accent: resolvedTheme.accent || palette.orange,
    },
    status: {
      error: resolvedTheme.error || palette.red,
      warning: resolvedTheme.warning || palette.yellow,
      success: resolvedTheme.success || palette.green,
      info: resolvedTheme.info || palette.cyan,
      pending: 'gray',
      running: resolvedTheme.statusRunning || palette.yellow,
    },
    syntax: {
      keyword: resolvedTheme.syntaxKeyword || palette.purple,
      function: resolvedTheme.syntaxFunction || palette.blue,
      string: resolvedTheme.syntaxString || palette.green,
      number: resolvedTheme.syntaxNumber || palette.orange,
      comment: 'gray',
      type: resolvedTheme.syntaxType || palette.cyan,
      operator: resolvedTheme.syntaxOperator || palette.yellow,
    },
    diff: {
      added: resolvedTheme.diffAdded || palette.green,
      removed: resolvedTheme.diffRemoved || palette.red,
      context: 'gray',
      addedBg: resolvedTheme.diffAddedBg || '#2D4F2D',
      removedBg: resolvedTheme.diffRemovedBg || '#4F2D2D',
    },
    message: {
      user: resolvedTheme.messageUser || palette.blue,
      assistant: resolvedTheme.messageAssistant || palette.purple,
      system: 'gray',
    },
    logo: {
      primary: resolvedTheme.logo || palette.purple,
      accent: resolvedTheme.logoAccent || palette.blue,
    },
  }
  
  return {
    name: legacy.name,
    displayName: legacy.displayName,
    palette,
    colors,
  }
}

/**
 * 加载并解析主题
 * @param name 主题名称
 * @param mode 模式（仅对旧格式主题有效，新格式主题自动适配）
 */
export function loadTheme(name: string, mode: 'dark' | 'light' = 'dark'): ResolvedTheme | null {
  // 首先检查新格式主题
  if (name in NEW_FORMAT_THEMES) {
    return loadNewFormatTheme(NEW_FORMAT_THEMES[name])
  }
  
  // 然后检查旧格式主题
  if (name in LEGACY_THEMES) {
    return convertLegacyTheme(LEGACY_THEMES[name], mode)
  }
  
  logger.warn(`Theme not found: ${name}`)
  return null
}

/**
 * 获取所有可用主题名称
 */
export function getAvailableThemes(): string[] {
  return [...Object.keys(NEW_FORMAT_THEMES), ...Object.keys(LEGACY_THEMES)]
}

/**
 * 获取主题显示信息
 */
export function getThemeInfo(name: string): { name: string; displayName: string } | null {
  if (name in NEW_FORMAT_THEMES) {
    const theme = NEW_FORMAT_THEMES[name]
    return { name: theme.name, displayName: theme.displayName }
  }
  
  if (name in LEGACY_THEMES) {
    const theme = LEGACY_THEMES[name]
    return { name: theme.name, displayName: theme.displayName }
  }
  
  return null
}

/**
 * 获取所有主题的显示信息
 */
export function getAllThemeInfos(): Array<{ name: string; displayName: string }> {
  const newThemes = Object.values(NEW_FORMAT_THEMES).map((theme) => ({
    name: theme.name,
    displayName: theme.displayName,
  }))
  
  const legacyThemes = Object.values(LEGACY_THEMES).map((theme) => ({
    name: theme.name,
    displayName: theme.displayName,
  }))
  
  return [...newThemes, ...legacyThemes]
}

// 导出主题集合（用于调试）
export { NEW_FORMAT_THEMES, LEGACY_THEMES }

// 兼容旧的导出名称
export const BUILTIN_THEMES = { ...NEW_FORMAT_THEMES, ...LEGACY_THEMES }
