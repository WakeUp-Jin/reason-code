/**
 * Explore Agent 预设配置
 * 子代理 - 代码库探索专家（只读）
 */

import type { AgentConfig } from '../types.js';
import { exploreSystem } from './expoloreSystem.js';

export const exploreAgent: AgentConfig = {
  name: 'explore',
  mode: 'subagent',
  description: 'Specialized agent for deep codebase investigation and analysis. Finds relevant files, understands architecture, and provides actionable insights.',
  systemPrompt: exploreSystem,
  tools: {
    include: ['Glob', 'Grep', 'ReadFile', 'ListFiles', 'ReadManyFiles'],
  },
  model: { 
    provider: 'deepseek',
    model: 'deepseek-chat',
  },
  execution: {
    maxLoops: 20,
    enableCompression: false,
  },
};

