/**
 * Agent 配置模块导出
 */

// 类型导出
export type { AgentConfig, AgentRole, AgentType } from './types.js';

// 预设导出
export {
  buildAgent,
  explanatoryAgent,
  exploreAgent,
  stewardAgent,
} from './presets/index.js';
