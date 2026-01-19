/**
 * TaskTool 执行器
 * 使用 AgentManager 创建和执行子代理
 */

import type { TaskParams, TaskResult } from './types.js';
import type { InternalToolContext } from '../types.js';
import { agentManager } from '../../agent/AgentManager.js';
import { Session } from '../../session/index.js';
import {
  ExecutionStreamManager,
  type SubAgentToolSummary,
  type SubAgentProgress,
} from '../../execution/index.js';
import { logger } from '../../../utils/logger.js';

/**
 * 执行 Task 工具
 */
export async function executeTask(
  params: TaskParams,
  context?: InternalToolContext
): Promise<TaskResult> {
  const { subagent_type, prompt, description } = params;

  logger.info('TaskTool executing', {
    description,
    subagentType: subagent_type,
    parentSessionId: context?.sessionId,
  });

  // 1. 从 AgentManager 创建子代理
  let subAgent;
  try {
    // 直接使用预设配置（模型从预设文件读取）
    subAgent = agentManager.createAgent(subagent_type);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Failed to create sub-agent', { error: errorMessage });
    throw error;
  }

  // 2. 创建或获取子会话
  let sessionId = params.session_id;
  if (!sessionId && context?.sessionId) {
    try {
      const subSession = await Session.getOrCreateSubSession({
        parentId: context.sessionId,
        agentName: subagent_type,
        title: description,
      });
      sessionId = subSession.id;
      logger.debug('Created sub-session', { sessionId, parentId: context.sessionId });
    } catch (error) {
      logger.warn('Failed to create sub-session, using parent session', { error });
      sessionId = context.sessionId;
    }
  }

  // 3. 维护子代理工具调用列表
  const toolSummary: SubAgentToolSummary[] = [];

  // 4. 创建子代理的 ExecutionStream
  const subExecStream = new ExecutionStreamManager();

  // 5. 订阅子代理事件，转发为 tool:progress
  const unsubscribe = subExecStream.on((event) => {
    if (!context?.executionStream || !context?.callId) return;

    if (event.type === 'tool:validating') {
      // 子工具开始
      const progress: SubAgentProgress = {
        type: 'tool_start',
        subToolCallId: event.toolCall.id,
        toolName: event.toolCall.toolName,
        paramsSummary: event.toolCall.paramsSummary,
        status: 'running',
      };

      toolSummary.push({
        id: event.toolCall.id,
        tool: event.toolCall.toolName,
        status: 'running',
      });

      context.executionStream.emitToolProgress(context.callId, progress);
    }

    if (event.type === 'tool:complete') {
      // 子工具完成
      const progress: SubAgentProgress = {
        type: 'tool_complete',
        subToolCallId: event.toolCall.id,
        toolName: event.toolCall.toolName,
        status: event.toolCall.status === 'success' ? 'completed' : 'error',
        resultSummary: event.toolCall.resultSummary,
        error: event.toolCall.error,
      };

      // 更新 summary
      const item = toolSummary.find((t) => t.id === event.toolCall.id);
      if (item) {
        item.status = progress.status;
        item.title = progress.resultSummary;
      }

      context.executionStream.emitToolProgress(context.callId, progress);
    }

    if (event.type === 'tool:error') {
      // 子工具错误
      const progress: SubAgentProgress = {
        type: 'tool_complete',
        subToolCallId: event.toolCallId,
        toolName: 'unknown',
        status: 'error',
        error: event.error,
      };

      context.executionStream.emitToolProgress(context.callId, progress);
    }
  });

  try {
    // 6. 初始化子代理
    await subAgent.init();

    // 7. 执行子代理（传入 subExecStream，Agent 内部会自动管理生命周期）
    const result = await subAgent.run(prompt, {
      sessionId: sessionId || context?.sessionId || 'unknown',
      approvalMode: context?.approvalMode,
      onConfirmRequired: context?.onConfirmRequired,
      executionStream: subExecStream,
    });

    logger.info('TaskTool completed', {
      agentName: subagent_type,
      success: result.success,
      toolCallCount: toolSummary.length,
    });

    // 8. 返回结果
    return {
      success: result.success,
      output: result.finalResponse || result.error || '',
      metadata: {
        agentName: subagent_type,
        sessionId: sessionId || context?.sessionId || 'unknown',
        summary: toolSummary,
      },
    };
  } finally {
    // 清理订阅
    unsubscribe();
  }
}
