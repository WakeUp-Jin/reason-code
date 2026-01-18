/**
 * TaskTool 类型定义
 */

import type { SubAgentToolSummary } from '../../execution/types.js';

/**
 * TaskTool 参数
 */
export interface TaskParams {
  /** 任务描述（3-5 个词） */
  description: string;
  /** 详细任务说明 */
  prompt: string;
  /** 子代理类型 */
  subagent_type: string;
  /** 可选：继续之前的会话 */
  session_id?: string;
}

/**
 * TaskTool 结果
 */
export interface TaskResult {
  success: boolean;
  output: string;
  metadata: {
    agentName: string;
    sessionId: string;
    summary: SubAgentToolSummary[];
  };
}

/**
 * TaskTool 依赖
 */
export interface TaskToolDependencies {
  /** 获取或创建子会话的回调 */
  getOrCreateSubSession: (options: {
    sessionId?: string;
    parentId: string;
    agentName: string;
    title?: string;
  }) => { id: string };
  /** 默认模型配置 */
  defaultModel: { provider: string; model: string };
  /** API Key */
  apiKey?: string;
  /** Base URL */
  baseURL?: string;
}

