import React from 'react'
import { useDialog } from '../context/dialog.js'
import { useTheme, AVAILABLE_THEMES, type ThemeName } from '../context/theme.js'
import { DialogSelect, type SelectOption } from '../ui/dialog-select.js'

// 主题描述
const THEME_DESCRIPTIONS: Record<ThemeName, string> = {
  kanagawa: 'Inspired by the famous Kanagawa wave painting',
  github: 'Clean and modern GitHub-inspired colors',
  solarized: 'Precision colors for machines and people',
  dracula: 'Dark theme for vampires',
  nord: 'Arctic, north-bluish color palette',
  catppuccin: 'Soothing pastel theme',
}

/**
 * 主题选择对话框
 */
export function DialogTheme() {
  const { pop } = useDialog()
  const { themeName, setThemeName, mode } = useTheme()

  // 转换为选项
  const options: SelectOption<ThemeName>[] = AVAILABLE_THEMES.map((name) => ({
    id: name,
    label: name.charAt(0).toUpperCase() + name.slice(1),
    description: THEME_DESCRIPTIONS[name] + (name === themeName ? ' (current)' : ''),
    value: name,
  }))

  // 处理选择
  const handleSelect = (option: SelectOption<ThemeName>) => {
    setThemeName(option.value)
    pop()
  }

  // 处理取消
  const handleCancel = () => {
    pop()
  }

  return (
    <DialogSelect
      title={`Select Theme (${mode} mode)`}
      placeholder="Search themes..."
      options={options}
      onSelect={handleSelect}
      onCancel={handleCancel}
    />
  )
}

