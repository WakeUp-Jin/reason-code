import type { ThemeJSON, ThemeDefs, ThemeSemantic, ResolvedTheme } from './types.js'
import { logger } from '../util/logger.js'

// 内置主题
import kanagawa from './kanagawa.json' with { type: 'json' }
import github from './github.json' with { type: 'json' }
import dracula from './dracula.json' with { type: 'json' }
import nord from './nord.json' with { type: 'json' }
import solarized from './solarized.json' with { type: 'json' }
import catppuccin from './catppuccin.json' with { type: 'json' }

// 所有内置主题
const BUILTIN_THEMES: Record<string, ThemeJSON> = {
  kanagawa: kanagawa as ThemeJSON,
  github: github as ThemeJSON,
  dracula: dracula as ThemeJSON,
  nord: nord as ThemeJSON,
  solarized: solarized as ThemeJSON,
  catppuccin: catppuccin as ThemeJSON,
}

/**
 * 解析颜色引用
 * 将 "$colorName" 格式的引用解析为实际颜色值
 */
function resolveColorRef(value: string, defs: ThemeDefs): string {
  if (value.startsWith('$')) {
    const refName = value.slice(1)
    if (refName in defs) {
      return defs[refName]
    }
    logger.warn(`Theme color reference not found: ${value}`)
    return value
  }
  return value
}

/**
 * 解析主题语义颜色
 * 将所有引用替换为实际颜色值
 */
function resolveThemeColors(theme: ThemeSemantic, defs: ThemeDefs): ThemeSemantic {
  const resolved: Record<string, string> = {}

  for (const [key, value] of Object.entries(theme)) {
    resolved[key] = resolveColorRef(value, defs)
  }

  return resolved as ThemeSemantic
}

/**
 * 加载并解析主题
 */
export function loadTheme(name: string, mode: 'dark' | 'light'): ResolvedTheme | null {
  const themeJSON = BUILTIN_THEMES[name]

  if (!themeJSON) {
    logger.warn(`Theme not found: ${name}`)
    return null
  }

  const modeData = mode === 'dark' ? themeJSON.dark : themeJSON.light
  const resolvedColors = resolveThemeColors(modeData.theme, modeData.defs)

  return {
    name: themeJSON.name,
    displayName: themeJSON.displayName,
    mode,
    colors: resolvedColors,
  }
}

/**
 * 获取所有可用主题名称
 */
export function getAvailableThemes(): string[] {
  return Object.keys(BUILTIN_THEMES)
}

/**
 * 获取主题显示信息
 */
export function getThemeInfo(name: string): { name: string; displayName: string } | null {
  const theme = BUILTIN_THEMES[name]
  if (!theme) return null

  return {
    name: theme.name,
    displayName: theme.displayName,
  }
}

/**
 * 获取所有主题的显示信息
 */
export function getAllThemeInfos(): Array<{ name: string; displayName: string }> {
  return Object.values(BUILTIN_THEMES).map((theme) => ({
    name: theme.name,
    displayName: theme.displayName,
  }))
}

export { BUILTIN_THEMES }

