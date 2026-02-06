/**
 * Explanatory Agent 预设配置
 * 解释型模式 - 在完成任务的同时提供教育性洞察
 */

import type { AgentConfig } from '../types.js';
import { buildExplanatorySystemPrompt } from '../../../promptManager/index.js';

export const explanatoryAgent: AgentConfig = {
  name: 'explanatory',
  role: 'primary',
  description: '解释型模式 - 任务完成优先，穿插教育性洞察',
  // 使用解释型系统提示词构建器
  systemPromptBuilder: buildExplanatorySystemPrompt,
};
