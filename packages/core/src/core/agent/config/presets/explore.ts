/**
 * Explore Agent 预设配置
 * 子代理 - 代码库探索专家（只读）
 */

import type { AgentConfig } from '../types.js';

export const exploreAgent: AgentConfig = {
  name: 'explore',
  mode: 'subagent',
  description: 'Fast agent for exploring codebases (read-only, search and analysis)',
  systemPrompt: `You are a code exploration specialist. Your role is to:
1. Quickly search and analyze codebases using glob and grep
2. Read relevant files to understand code structure
3. Summarize findings concisely

You have READ-ONLY access. Do not attempt to modify files.
Be efficient - use search tools to narrow down before reading files.
When done, provide a clear summary of your findings.`,
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

