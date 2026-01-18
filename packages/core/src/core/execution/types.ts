/**
 * 执行流类型定义
 * 用于 Agent 执行过程中的状态管理和事件通信
 */

/**
 * 执行流状态
 */
export enum ExecutionState {
  Idle = 'idle', // 空闲
  Thinking = 'thinking', // 思考中（等待 LLM 响应）
  ToolExecuting = 'tool_executing', // 工具执行中
  Streaming = 'streaming', // 流式输出中
  WaitingConfirm = 'waiting_confirm', // 等待用户确认
  Completed = 'completed', // 完成
  Error = 'error', // 错误
  Cancelled = 'cancelled', // 已取消
}

/**
 * 工具调用状态
 */
export enum ToolCallStatus {
  Pending = 'pending', // 等待执行
  Executing = 'executing', // 执行中
  Success = 'success', // 成功
  Error = 'error', // 失败
  Cancelled = 'cancelled', // 已取消
}

/**
 * 工具调用记录
 */
export interface ToolCallRecord {
  id: string; // 调用 ID
  toolName: string; // 工具名称
  toolCategory: string; // 工具分类

  // 参数信息
  params: Record<string, any>; // 完整参数
  paramsSummary: string; // 参数摘要（用于显示）

  // 执行信息
  status: ToolCallStatus;
  startTime: number; // 开始时间
  endTime?: number; // 结束时间
  duration?: number; // 执行耗时(ms)

  // 结果信息
  result?: any; // 完整结果
  resultSummary?: string; // 结果摘要（用于显示）
  error?: string; // 错误信息

  // 实时输出（用于长时间运行的工具）
  liveOutput?: string;

  // 工具调用前的思考内容（LLM 在调用工具前的 content）
  thinkingContent?: string;

  // 使用的策略（如 ripgrep、git-grep、javascript 等）
  strategy?: string;
}

/**
 * 思考内容（推理模型）
 */
export interface ThinkingContent {
  content: string; // 思考内容
  isComplete: boolean; // 是否完成
}

/**
 * 执行统计
 */
export interface ExecutionStats {
  startTime: number; // 开始时间
  elapsedTime: number; // 已用时间(秒)

  // Token 统计
  inputTokens: number; // 输入 token（prompt_tokens）
  outputTokens: number; // 输出 token（completion_tokens）
  totalTokens: number; // 总 token
  cacheHitTokens?: number; // 缓存命中 token（DeepSeek）
  cacheMissTokens?: number; // 缓存未命中 token（DeepSeek）
  reasoningTokens?: number; // 推理 token（已包含在 outputTokens 中）

  // 工具统计
  toolCallCount: number; // 工具调用次数
  loopCount: number; // 循环次数
}

/**
 * 执行流快照（完整状态）
 */
export interface ExecutionSnapshot {
  state: ExecutionState; // 当前状态
  statusPhrase: string; // 状态短语

  stats: ExecutionStats; // 执行统计

  // 工具调用
  currentToolCall?: ToolCallRecord; // 当前正在执行的工具
  toolCallHistory: ToolCallRecord[]; // 工具调用历史

  // 思考内容
  thinking?: ThinkingContent; // 推理模型的思考

  // 输出内容
  streamingContent: string; // 流式输出内容

  // 错误信息
  error?: string;
}

/**
 * 工具结果摘要生成器
 */
export type ToolResultSummaryGenerator = (
  toolName: string,
  params: Record<string, any>,
  result: any
) => string;

/**
 * 摘要生成器注册表
 */
export type SummaryGeneratorRegistry = Record<string, ToolResultSummaryGenerator>;

// ==================== 子代理相关类型 ====================

/**
 * 子代理工具进度类型
 */
export type SubAgentProgressType = 'tool_start' | 'tool_complete' | 'thinking';

/**
 * 子代理工具进度信息
 */
export interface SubAgentProgress {
  type: SubAgentProgressType;
  /** 子工具调用 ID */
  subToolCallId: string;
  /** 工具名称 */
  toolName: string;
  /** 参数摘要 */
  paramsSummary?: string;
  /** 状态 */
  status: 'running' | 'completed' | 'error';
  /** 结果摘要（完成时） */
  resultSummary?: string;
  /** 错误信息 */
  error?: string;
}

/**
 * 子代理工具摘要（用于显示）
 */
export interface SubAgentToolSummary {
  id: string;
  tool: string;
  status: 'running' | 'completed' | 'error';
  title?: string;
}
