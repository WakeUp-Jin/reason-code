/**
 * Agent 配置类型定义
 * 用于定义主代理和子代理的配置
 */

import { ModelTier } from '../../../config/types.js';
import type { SystemPromptContext } from '../../promptManager/index.js';

/** 代理角色（定义代理在系统中的定位） */
export type AgentRole = 'primary' | 'subagent' | 'all';

/** 代理类型（前端传入的模式标识） */
export type AgentType = 'build' | 'steward' | 'explore';

/** 系统提示词构建器函数类型 */
export type SystemPromptBuilder = (context: SystemPromptContext) => string;

/** 代理配置 */
export interface AgentConfig {
  /** 唯一标识（即 AgentType） */
  name: AgentType;

  /** 角色定位 */
  role: AgentRole;

  /** 描述（用于 Task 工具说明） */
  description: string;

  /** 自定义系统提示词（静态字符串） */
  systemPrompt?: string;

  /** 系统提示词构建器（动态构建，需要 promptContext） */
  systemPromptBuilder?: SystemPromptBuilder;

  /** 工具配置 */
  tools?: {
    /** 白名单：只允许这些工具（优先级最高） */
    include?: string[];
    /** 黑名单：排除这些工具 */
    exclude?: string[];
    /** 细粒度控制：false = 禁用（向后兼容） */
    [toolName: string]: boolean | string[] | undefined;
  };

  /** 模型层级配置（可选，默认 PRIMARY） */
  modelTier?: ModelTier;

  /** 执行配置 */
  execution?: {
    maxLoops?: number;
    enableCompression?: boolean;
  };

  /** 是否隐藏（不在 UI 显示） */
  hidden?: boolean;
}
