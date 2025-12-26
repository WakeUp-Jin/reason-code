/**
 * Agent 模块统一导出
 */

// Agent（CLI 使用）
export { Agent } from './Agent.js';
export type { AgentConfig, AgentResult } from './Agent.js';

// SimpleAgent（内部使用）
export { SimpleAgent } from './SimpleAgent.js';
export type {
  AgentResult as SimpleAgentResult,
  AgentConfig as SimpleAgentConfig,
} from './SimpleAgent.js';

// MultiAgent 系统
export { MainAgent, SubAgent, createMultiAgentSystem } from './MultiAgent.js';
export type { MainAgentResult, SubAgentResult } from './MultiAgent.js';
