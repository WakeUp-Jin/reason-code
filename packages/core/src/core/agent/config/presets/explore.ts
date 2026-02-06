/**
 * Explore Agent 预设配置
 * 子代理 - 代码库探索专家（只读）
 */

import { ModelTier } from '../../../index.js';
import type { AgentConfig } from '../types.js';
import { explorePrompt } from '../../../promptManager/index.js';

export const exploreAgent: AgentConfig = {
  name: 'explore',
  role: 'subagent',
  description:
    'Specialized agent for deep codebase investigation and analysis. Finds relevant files, understands architecture, and provides actionable insights.',
  systemPrompt: explorePrompt,
  tools: {
    include: ['Glob', 'Grep', 'ReadFile', 'ListFiles', 'ReadManyFiles'],
  },
  modelTier: ModelTier.SECONDARY,
  execution: {
    maxLoops: 20,
    enableCompression: false,
  },
};
