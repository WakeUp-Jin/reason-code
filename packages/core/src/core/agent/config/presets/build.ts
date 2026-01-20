/**
 * Build Agent 预设配置
 * 主代理 - 通用编程代理
 */

import type { AgentConfig } from '../types.js';

export const buildAgent: AgentConfig = {
  name: 'build',
  mode: 'primary',
  description: 'General-purpose coding agent',
  // 使用默认系统提示词和所有工具
};

