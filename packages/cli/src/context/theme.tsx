import React, {
  createContext,
  useContext,
  useState,
  useMemo,
  useEffect,
  type ReactNode,
} from 'react';

// 主题模式
export type ThemeMode = 'dark' | 'light';

// 主题颜色定义
export interface ThemeColors {
  // 基础颜色
  primary: string;
  secondary: string;
  accent: string;
  error: string;
  warning: string;
  success: string;
  info: string;

  // 文本颜色
  text: string;
  textMuted: string;
  textInverse: string;

  // 背景颜色
  background: string;
  backgroundPanel: string;
  backgroundElement: string;

  // 边框颜色
  border: string;
  borderActive: string;
  borderSubtle: string;

  // Diff 颜色
  diffAdded: string;
  diffRemoved: string;
  diffContext: string;
  diffAddedBg: string;
  diffRemovedBg: string;

  // 语法高亮
  syntaxComment: string;
  syntaxKeyword: string;
  syntaxFunction: string;
  syntaxString: string;
  syntaxNumber: string;
  syntaxType: string;
  syntaxOperator: string;
}

// 主题数据
export interface Theme {
  name: string;
  mode: ThemeMode;
  colors: ThemeColors;
}

// 默认 Kanagawa Dark 主题颜色 (Reason 紫色系)
const kanagawaDark: ThemeColors = {
  // ===== 核心功能色 - 紫色系 (Reason 品牌色) =====
  primary: '#A78BFA', // 🟣 紫色主色调 - 用于 Agent 标识、主按钮、高亮边框
  secondary: '#C4B5FD', // 🟣 淡紫色 - 次要按钮、标签、图标
  accent: '#D8B4FE', // 🟣 亮紫色 - 强调元素、悬停状态、激活状态

  // ===== 状态色 - 通用标准 =====
  error: '#E82424', // 🔴 红色 - 错误消息、删除操作、失败状态
  warning: '#D7A657', // 🟡 黄色 - 警告消息、需要注意的内容
  success: '#98BB6C', // 🟢 绿色 - 成功消息、完成状态、添加操作
  info: '#76946A', // 🔵 青绿色 - 提示信息、帮助文本

  // ===== 文本颜色 =====
  text: '#DCD7BA', // 📝 主文本 - 亮米色，高可读性，用于正文
  textMuted: '#727169', // 🔇 次要文本 - 暗灰色，用于提示、注释、次要信息
  textInverse: '#1F1F28', // ⚪ 反色文本 - 深色背景上的亮色按钮内文字

  // ===== 背景颜色 - 深色主题 =====
  background: '#1F1F28', // 🌑 最深背景 - 页面主背景色
  backgroundPanel: '#2A2A37', // 🌓 面板背景 - 卡片、对话框背景
  backgroundElement: '#363646', // 🌔 元素背景 - 输入框、代码块、悬停状态

  // ===== 边框颜色 =====
  border: '#54546D', // ─ 默认边框 - 分割线、普通边框
  borderActive: '#A78BFA', // 🟣 激活边框 - 聚焦时的紫色边框
  borderSubtle: '#363646', // ─ 微妙边框 - 不明显的分割

  // ===== Diff 颜色 - 代码对比 =====
  diffAdded: '#98BB6C', // + 添加的行 - 绿色文本
  diffRemoved: '#E82424', // - 删除的行 - 红色文本
  diffContext: '#727169', // 上下文行 - 灰色文本
  diffAddedBg: '#2D4F2D', // + 添加的行背景 - 深绿色
  diffRemovedBg: '#4F2D2D', // - 删除的行背景 - 深红色

  // ===== 语法高亮 - 代码编辑器 =====
  syntaxComment: '#727169', // // 注释 - 灰色
  syntaxKeyword: '#A78BFA', // 🟣 关键字 - 紫色 (if, const, function 等)
  syntaxFunction: '#C4B5FD', // 🟣 函数名 - 淡紫色
  syntaxString: '#98BB6C', // 🟢 字符串 - 绿色
  syntaxNumber: '#D27E99', // 🔴 数字 - 玫红色
  syntaxType: '#7FB4CA', // 🔵 类型 - 天蓝色 (interface, type 等)
  syntaxOperator: '#C0A36E', // 🟡 运算符 - 金色 (+, -, *, / 等)
};

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
};

// 预定义主题列表
export const AVAILABLE_THEMES = [
  'kanagawa',
  'github',
  'solarized',
  'dracula',
  'nord',
  'catppuccin',
] as const;

export type ThemeName = (typeof AVAILABLE_THEMES)[number];

// Context 值类型
interface ThemeContextValue {
  theme: Theme;
  themeName: ThemeName;
  mode: ThemeMode;
  setThemeName: (name: ThemeName) => void;
  setMode: (mode: ThemeMode) => void;
  toggleMode: () => void;
  colors: ThemeColors;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

// 获取主题颜色
function getThemeColors(name: ThemeName, mode: ThemeMode): ThemeColors {
  // 目前只实现 Kanagawa，其他主题后续添加
  if (name === 'kanagawa') {
    return mode === 'dark' ? kanagawaDark : kanagawaLight;
  }
  // 默认返回 Kanagawa
  return mode === 'dark' ? kanagawaDark : kanagawaLight;
}

interface ThemeProviderProps {
  children: ReactNode;
  defaultTheme?: ThemeName;
  defaultMode?: ThemeMode;
}

export function ThemeProvider({
  children,
  defaultTheme = 'kanagawa',
  defaultMode = 'dark',
}: ThemeProviderProps) {
  const [themeName, setThemeName] = useState<ThemeName>(defaultTheme);
  const [mode, setMode] = useState<ThemeMode>(defaultMode);

  const colors = useMemo(() => getThemeColors(themeName, mode), [themeName, mode]);

  const theme = useMemo<Theme>(
    () => ({
      name: themeName,
      mode,
      colors,
    }),
    [themeName, mode, colors]
  );

  const toggleMode = () => {
    setMode((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

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
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return context;
}
