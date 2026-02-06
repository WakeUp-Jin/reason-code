/**
 * Build Agent 预设配置
 * 主代理 - 通用编程代理
 */

import type { AgentConfig } from '../types.js';
import { buildSystemPrompt } from '../../../promptManager/index.js';

export const buildAgent: AgentConfig = {
  name: 'build',
  role: 'primary',
  description: 'General-purpose coding agent - 通用编程代理',
  // 显式指定使用 buildSystemPrompt 构建器
  systemPromptBuilder: buildSystemPrompt,
  // modelTier 不配置，默认使用 PRIMARY
};

