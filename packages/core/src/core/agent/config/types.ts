/**
 * Agent 配置类型定义
 * 用于定义主代理和子代理的配置
 */

/** 代理模式 */
export type AgentMode = 'primary' | 'subagent' | 'all';

/** 代理配置 */
export interface AgentConfig {
  /** 唯一标识 */
  name: string;

  /** 模式 */
  mode: AgentMode;

  /** 描述（用于 Task 工具说明） */
  description: string;

  /** 自定义系统提示词 */
  systemPrompt?: string;

  /** 工具配置 */
  tools?: {
    /** 白名单：只允许这些工具（优先级最高） */
    include?: string[];
    /** 黑名单：排除这些工具 */
    exclude?: string[];
    /** 细粒度控制：false = 禁用（向后兼容） */
    [toolName: string]: boolean | string[] | undefined;
  };

  /** 模型配置（可选，覆盖默认） */
  model?: {
    provider: string;
    model: string;
  };

  /** 执行配置 */
  execution?: {
    maxLoops?: number;
    enableCompression?: boolean;
  };

  /** 是否隐藏（不在 UI 显示） */
  hidden?: boolean;
}

