/**
 * 配置类型定义
 */

/** 模型层级 */
export enum ModelTier {
  /** 主模型：用于主 Agent 推理、复杂任务 */
  PRIMARY = 'primary',
  /** 次模型：用于工具输出总结、历史压缩 */
  SECONDARY = 'secondary',
  /** 低模型：用于简单分类、格式化、提取 */
  TERTIARY = 'tertiary',
}

/** 单个层级的模型配置 */
export interface ModelTierConfig {
  /** 供应商：deepseek, anthropic, openai, openrouter 等 */
  provider: string;
  /** 模型名称 */
  model: string;
}

/** Provider 配置 */
export interface ProviderConfig {
  /** API 密钥 */
  apiKey: string;
  /** API 基础 URL */
  baseUrl?: string;
  /** 超时时间（毫秒） */
  timeout?: number;
  /** 可切换的模型列表（用于前端 /model 命令展示） */
  options: string[];
}

/** 完整的模型配置（解析后，包含 Provider 信息） */
export interface ResolvedModelConfig {
  /** 供应商 */
  provider: string;
  /** 模型名称 */
  model: string;
  /** API 密钥 */
  apiKey: string;
  /** API 基础 URL */
  baseUrl?: string;
  /** 超时时间（毫秒） */
  timeout?: number;
}

/** 模型配置 */
export interface ModelConfig {
  /** 主模型配置 */
  primary: ModelTierConfig;
  /** 次模型配置 */
  secondary: ModelTierConfig;
  /** 低模型配置 */
  tertiary: ModelTierConfig;
}

/** Agent 配置 */
export interface AgentAppConfig {
  /** 当前使用的 Agent */
  current: string;
}

/** UI 配置 */
export interface UIConfig {
  /** 主题名称 */
  theme: string;
  /** 亮色/暗色模式 */
  mode: 'dark' | 'light';
  /** 货币类型 */
  currency: 'CNY' | 'USD';
  /** 汇率（USD to CNY） */
  exchangeRate: number;
  /** 工具批准模式 */
  approvalMode: 'default' | 'auto_edit' | 'yolo';
}

/** Session 配置 */
export interface SessionConfig {
  /** 上次打开的会话 ID */
  lastSessionId?: string;
  /** 是否启用自动保存 */
  autoSave: boolean;
  /** 防抖延迟（毫秒） */
  saveDebounce: number;
}

/** 完整配置文件结构 */
export interface AppConfig {
  /** 模型配置 */
  model: ModelConfig;
  /** Provider 配置 */
  providers: Record<string, ProviderConfig>;
  /** Agent 配置 */
  agent: AgentAppConfig;
  /** UI 配置 */
  ui: UIConfig;
  /** Session 配置 */
  session: SessionConfig;
}

/** 深度部分类型（用于 updateConfig） */
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};
