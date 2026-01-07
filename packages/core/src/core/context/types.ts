/**
 * 上下文管理系统的核心类型定义
 * 简化为 3 种核心上下文类型
 */

/**
 * 上下文类型枚举（简化为 3 种）
 */
export enum ContextType {
  /** 系统提示词上下文 */
  SYSTEM_PROMPT = 'system_prompt',
  /** 会话历史上下文 */
  HISTORY = 'history',
  /** 当前运行记录上下文 */
  CURRENT_TURN = 'current_turn',
}

/**
 * 消息角色
 */
export type MessageRole = 'user' | 'assistant' | 'system' | 'tool';

/**
 * 工具调用结构
 */
export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

/**
 * 标准消息结构（与 LLM API 对齐）
 */
export interface Message {
  role: MessageRole;
  content: string;
  reasoning_content?: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
}

/**
 * 上下文检查结果
 */
export interface ContextCheckResult {
  /** 是否通过检查 */
  passed: boolean;
  /** 当前 token 数 */
  currentTokens: number;
  /** 模型限制 */
  modelLimit: number;
  /** 使用百分比 */
  usagePercent: number;
  /** 错误信息 */
  error?: string;
}

/**
 * 压缩结果
 */
export interface CompressionResult {
  /** 是否执行了压缩 */
  compressed: boolean;
  /** 原始消息数 */
  originalCount: number;
  /** 压缩后消息数 */
  compressedCount: number;
  /** 原始 token 数 */
  originalTokens: number;
  /** 压缩后 token 数 */
  compressedTokens: number;
  /** 摘要内容 */
  summary?: string;
}

/**
 * 工具输出处理结果
 */
export interface ToolOutputProcessResult {
  /** 处理后的输出 */
  output: string;
  /** 是否被总结 */
  summarized: boolean;
  /** 是否被截断 */
  truncated: boolean;
  /** 原始 token 数 */
  originalTokens: number;
  /** 处理后 token 数 */
  processedTokens: number;
}
