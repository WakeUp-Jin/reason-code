/**
 * @reason-cli/core - Core exports
 *
 * 核心模块统一导出
 */

// Agent 系统
export * from './agent/index.js';

// LLM 服务
export * from './llm/index.js';

// 工具系统
export * from './tool/index.js';

// Context 管理
export { ContextManager } from './context/ContextManager.js';
export {
  ContextType,
  type Message,
  type MessageRole,
  type ToolCall,
  type ContextCheckResult,
  type CompressionResult,
  type ToolOutputProcessResult,
} from './context/types.js';

// 上下文模块
export {
  BaseContext,
  SystemPromptContext,
  HistoryContext,
  CurrentTurnContext,
} from './context/index.js';

// 上下文工具
export { TokenEstimator, ToolOutputSummarizer } from './context/index.js';
export type { CompressionConfig, TokenUsage } from './context/index.js';

// Prompt 管理
export * from './promptManager/index.js';

// 执行流
export * from './execution/index.js';

// 日志系统
export { logger } from '../utils/logger.js';
export type { LoggerConfig, LogLevel } from '../utils/logger.js';
