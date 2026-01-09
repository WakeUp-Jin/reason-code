import React from 'react';
import { useTheme, AVAILABLE_THEMES, type ThemeName } from '../../context/theme.js';
import { PanelSelect, type SelectOption } from '../../ui/panel-select.js';

// 主题描述
const THEME_DESCRIPTIONS: Record<ThemeName, string> = {
  kanagawa: 'Inspired by the famous Kanagawa wave painting',
  github: 'Clean and modern GitHub-inspired colors',
  solarized: 'Precision colors for machines and people',
  dracula: 'Dark theme for vampires',
  nord: 'Arctic, north-bluish color palette',
  catppuccin: 'Soothing pastel theme',
};

export interface PanelThemeProps {
  onClose: () => void;
}

/**
 * 主题选择面板
 */
export function PanelTheme({ onClose }: PanelThemeProps) {
  const { themeName, setThemeName } = useTheme();

  // 转换为选项
  const options: SelectOption<ThemeName>[] = AVAILABLE_THEMES.map((name) => ({
    id: name,
    label: name.charAt(0).toUpperCase() + name.slice(1),
    description: THEME_DESCRIPTIONS[name] + (name === themeName ? ' (current)' : ''),
    value: name,
  }));

  // 处理选择
  const handleSelect = (option: SelectOption<ThemeName>) => {
    setThemeName(option.value);
    onClose();
  };

  // 处理取消
  const handleCancel = () => {
    onClose();
  };

  return (
    <PanelSelect
      title="Select Theme"
      placeholder="Search themes..."
      options={options}
      onSelect={handleSelect}
      onCancel={handleCancel}
    />
  );
}
