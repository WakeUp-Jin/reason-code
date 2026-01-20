/**
 * TaskTool 定义
 * 动态生成工具定义，基于 AgentManager 中注册的子代理
 */

import type { InternalTool, ToolParameterSchema } from '../types.js';
import { agentManager } from '../../agent/AgentManager.js';
import { executeTask } from './executors.js';

/**
 * 动态生成工具描述
 */
function generateDescription(): string {
  const subAgents = agentManager.listSubAgents();
  const agentList = subAgents.map((a) => `- ${a.name}: ${a.description}`).join('\n');

  return `Launch a specialized sub-agent to handle complex tasks autonomously.

Available agents:
${agentList}

Usage notes:
1. Sub-agents run in isolated sessions with their own context
2. Each invocation creates a new session unless session_id is provided
3. Provide detailed task descriptions for best results
4. The agent's output is returned to you - summarize key findings for the user
5. Sub-agents cannot call other sub-agents (no nesting)`;
}

/**
 * 动态生成参数 schema
 */
function generateParameters(): ToolParameterSchema {
  const subAgents = agentManager.listSubAgents();
  const agentNames = subAgents.map((a) => a.name);

  return {
    type: 'object',
    properties: {
      description: {
        type: 'string',
        description: 'A short (3-5 words) description of the task',
      },
      prompt: {
        type: 'string',
        description: 'Detailed instructions for the sub-agent to perform',
      },
      subagent_type: {
        type: 'string',
        enum: agentNames.length > 0 ? agentNames : ['explore'],
        description: 'The type of specialized agent to use',
      },
      session_id: {
        type: 'string',
        description: 'Optional: existing session ID to continue a previous sub-agent session',
      },
    },
    required: ['description', 'prompt', 'subagent_type'],
  };
}

/**
 * TaskTool 定义
 * 使用 getter 实现动态描述和参数
 */
export const TaskTool: InternalTool = {
  name: 'Task',
  category: 'agent',
  internal: false, // 显示给用户
  version: '1.0.0',
  get description() {
    return generateDescription();
  },
  get parameters() {
    return generateParameters();
  },
  handler: executeTask,
    // 只读工具，不需要权限确认
    isReadOnly: () => true,

    // 只读工具不需要确认
    shouldConfirmExecute: async () => false,
};

