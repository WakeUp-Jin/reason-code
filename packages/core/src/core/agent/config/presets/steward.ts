/**
 * Steward Agent 预设配置
 * 管家模式 - 智能助手，可监控主 Agent 状态并回答各类问题
 */

import type { AgentConfig } from '../types.js';
import { stewardPrompt } from '../../../promptManager/index.js';
import { ModelTier } from '../../../index.js';

export const stewardAgent: AgentConfig = {
  name: 'steward',
  role: 'primary',
  description: '管家模式 - 智能助手，可监控主 Agent 状态并回答各类问题',
  systemPrompt: stewardPrompt,
  tools: {
    // 最小工具集：只需读取能力（不含 Grep，速度更快）
    include: ['ReadFile', 'ListFiles', 'ReadManyFiles'],
  },
  modelTier: ModelTier.SECONDARY,
  // modelTier 不配置，默认使用 PRIMARY（从配置文件 model.primary 读取）
  execution: {
    maxLoops: 20, // 限制循环，快速响应
    enableCompression: false,
  },
};
