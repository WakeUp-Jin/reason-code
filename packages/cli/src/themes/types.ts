// 主题 JSON 文件格式定义

/**
 * 原始颜色定义（defs）
 * 这些是主题的基础色板
 */
export interface ThemeDefs {
  // 基础色板
  black: string;
  white: string;
  gray: string;
  red: string;
  green: string;
  yellow: string;
  blue: string;
  purple: string;
  cyan: string;
  orange: string;

  // 扩展色板（可选）
  [key: string]: string;
}

/**
 * 语义化颜色映射（theme）
 * 使用 $引用 或直接颜色值
 */
export interface ThemeSemantic {
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
  textThinking: string; // 思考模式专用文本颜色（斜体灰色）

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

  // 消息颜色
  messageUser: string;
  messageAssistant: string;
  messageSystem: string;

  // 状态颜色
  statusPending: string;
  statusRunning: string;
  statusSuccess: string;
  statusError: string;

  // Logo 颜色
  logo: string;
  logoAccent: string;
}

/**
 * 完整主题 JSON 结构
 */
export interface ThemeJSON {
  name: string;
  displayName: string;
  author?: string;
  version?: string;
  dark: {
    defs: ThemeDefs;
    theme: ThemeSemantic;
  };
  light: {
    defs: ThemeDefs;
    theme: ThemeSemantic;
  };
}

/**
 * 解析后的主题颜色（所有引用已解析）
 */
export interface ResolvedTheme {
  name: string;
  displayName: string;
  mode: 'dark' | 'light';
  colors: ThemeSemantic;
}
