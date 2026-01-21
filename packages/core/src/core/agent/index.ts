/**
 * Agent 模块统一导出
 */

// Agent（CLI 和评估系统使用）
export { Agent } from './Agent.js';
export type {
  AgentResult,
  AgentRunOptions,
  AgentInitOptions,
  HistoryLoadOptions,
  SessionCheckpoint,
  CompressionCompleteEvent,
  SystemPromptContext,
} from './Agent.js';

// Agent 配置系统
export type { AgentConfig, AgentMode } from './config/index.js';
export { buildAgent, exploreAgent } from './config/index.js';

// Agent 管理器
export { AgentManager, agentManager } from './AgentManager.js';
export type { SharedRuntime } from './AgentManager.js';

// 执行引擎
export { ExecutionEngine } from './execution/index.js';

