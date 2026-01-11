/**
 * Agent 模块统一导出
 */

// Agent（CLI 和评估系统使用）
export { Agent } from './Agent.js';
export type {
  AgentConfig,
  AgentResult,
  AgentRunOptions,
  AgentInitOptions,
  HistoryLoadOptions,
  SessionCheckpoint,
  CompressionCompleteEvent,
  SystemPromptContext,
} from './Agent.js';
