/**
 * 工具循环执行器 - 辅助函数
 * 提供 executeToolLoop 所需的辅助函数和类型定义
 */

import { ILLMService, ToolLoopConfig, ToolLoopResult, LLMResponse } from '../types/index.js';
import { ContextManager } from '../../context/index.js';
import { ToolManager } from '../../tool/ToolManager.js';
import { ToolScheduler, ScheduleResult } from '../../tool/ToolScheduler.js';
import { ApprovalMode } from '../../tool/types.js';
import { Message } from '../../context/types.js';
import { eventBus } from '../../../evaluation/EventBus.js';
import { logger } from '../../../utils/logger.js';
import { contextLogger, llmLogger, loopLogger } from '../../../utils/logUtils.js';
import { ContextChecker, DEFAULT_THRESHOLDS } from '../../context/utils/ContextChecker.js';
import { HistoryCompressor } from '../../context/utils/HistoryCompressor.js';
import { ToolOutputSummarizer } from '../../context/utils/ToolOutputSummarizer.js';
import { TokenEstimator } from '../../context/utils/tokenEstimator.js';
import { ExecutionStreamManager } from '../../execution/index.js';

/** 默认 Token 限制 */
export const DEFAULT_MODEL_LIMIT = 64_000;

// ============================================================
// 类型定义
// ============================================================

/**
 * 循环上下文 - 封装所有循环所需的依赖和配置
 */
export interface LoopContext {
  maxLoops: number;
  agentName: string;
  executionStream?: ExecutionStreamManager;
  contextChecker: ContextChecker;
  historyCompressor: HistoryCompressor | null;
  toolScheduler: ToolScheduler;
  enableCompression: boolean;
}

// ============================================================
// 辅助函数
// ============================================================

/**
 * 创建循环上下文
 * 封装所有配置提取和依赖初始化逻辑
 */
export function createLoopContext(
  llmService: ILLMService,
  toolManager: ToolManager,
  config?: ToolLoopConfig
): LoopContext {
  // 提取配置（带默认值）
  const maxLoops = config?.maxLoops ?? 50;
  const agentName = config?.agentName ?? 'simple_agent';
  const executionStream = config?.executionStream;
  const modelLimit = config?.modelLimit ?? DEFAULT_MODEL_LIMIT;
  const enableCompression = config?.enableCompression ?? true;
  const enableToolSummarization = config?.enableToolSummarization ?? true;
  const approvalMode = config?.approvalMode ?? ApprovalMode.DEFAULT;
  const onConfirmRequired = config?.onConfirmRequired;

  // 初始化上下文检查器
  const contextChecker = new ContextChecker(modelLimit);

  // 初始化历史压缩器（条件创建）
  const historyCompressor = enableCompression ? new HistoryCompressor(llmService) : null;

  // 初始化工具输出总结器（条件创建）
  const toolOutputSummarizer = enableToolSummarization
    ? new ToolOutputSummarizer(llmService)
    : null;

  // 创建工具调度器
  // 注意：这里需要创建一个临时引用来处理 onConfirmRequired 的闭包
  let toolScheduler: ToolScheduler;

  toolScheduler = new ToolScheduler(toolManager, {
    approvalMode,
    executionStream,
    enableToolSummarization,
    toolOutputSummarizer: toolOutputSummarizer ?? undefined,
    onConfirmRequired: onConfirmRequired
      ? async (callId, details) => {
          // 从记录中获取工具名称
          const records = toolScheduler.getRecords();
          const record = records.find((r) => r.request.callId === callId);
          const toolName = record?.request.toolName ?? 'unknown';
          return onConfirmRequired(callId, toolName, details);
        }
      : undefined,
  });

  return {
    maxLoops,
    agentName,
    executionStream,
    contextChecker,
    historyCompressor,
    toolScheduler,
    enableCompression,
  };
}

/**
 * 处理上下文压缩
 * 当上下文使用率超过阈值时，压缩历史消息
 */
export async function handleContextCompression(
  contextManager: ContextManager,
  contextChecker: ContextChecker,
  historyCompressor: HistoryCompressor,
  messages: Message[],
  usagePercent: number
): Promise<void> {
  // 检查是否需要压缩
  if (!contextChecker.checkCompression(messages)) {
    return;
  }

  // 记录压缩触发（包含完整统计）
  const tokens = TokenEstimator.estimateMessages(messages);
  contextLogger.compressionTriggered(usagePercent, messages.length, tokens);

  // 获取历史上下文
  const history = contextManager.getHistory();
  const historyMessages = history.getAll();

  if (historyMessages.length === 0) {
    return;
  }

  // 执行压缩
  const compressionResult = await historyCompressor.compress(historyMessages);

  if (!compressionResult.compressed || !compressionResult.summary) {
    return;
  }

  // 创建摘要消息
  const summaryMessage: Message = {
    role: 'system',
    content: `[历史对话摘要]\n${compressionResult.summary}`,
  };

  // 保留最近的消息
  const preserveCount = Math.ceil(historyMessages.length * DEFAULT_THRESHOLDS.compressionPreserve);
  const recentMessages = history.getRecent(preserveCount);

  // 替换历史
  history.replace([summaryMessage, ...recentMessages]);

  // 记录压缩详情（包含压缩前后的完整消息列表）
  const afterMessages = [summaryMessage, ...recentMessages];
  const afterTokens = TokenEstimator.estimateMessages(afterMessages);
  contextLogger.compressionDetails(
    historyMessages,
    compressionResult.originalTokens,
    afterMessages,
    afterTokens
  );
}

/**
 * 检查 LLM 响应是否包含工具调用
 */
export function hasToolCalls(response: LLMResponse): boolean {
  return (
    response.finishReason === 'tool_calls' &&
    response.toolCalls !== undefined &&
    response.toolCalls.length > 0
  );
}

/**
 * 构建工具消息
 * 将工具执行结果转换为上下文消息
 */
export function buildToolMessage(result: ScheduleResult): Message {
  const content = result.success
    ? result.resultString!
    : JSON.stringify({
        status: result.status,
        message: result.error || '工具执行被取消或失败',
      });

  return {
    role: 'tool',
    tool_call_id: result.callId,
    name: result.toolName,
    content,
  };
}

/**
 * 处理工具调用
 * 执行所有工具调用并更新上下文
 */
export async function handleToolCalls(
  response: LLMResponse,
  contextManager: ContextManager,
  ctx: LoopContext
): Promise<void> {
  const { toolScheduler, executionStream, agentName } = ctx;
  const toolCalls = response.toolCalls!;

  // 1. 构建并添加 assistant 消息（包含工具调用）
  const assistantMessage: Message = {
    role: 'assistant',
    content: response.content || '',
    reasoning_content: response.reasoningContent || '',
    tool_calls: toolCalls,
  };
  contextManager.addToCurrentTurn(assistantMessage);

  // 2. 通知 CLI 层保存 assistant 消息（确保历史消息加载时序列合法）
  executionStream?.addAssistantMessage(response.content || '', toolCalls);

  // 3. 触发工具调用事件（用于评估系统）
  for (const toolCall of toolCalls) {
    eventBus.emit('tool:call', {
      agentName,
      toolName: toolCall.function.name,
    });
  }

  // 4. 批量执行所有工具调用
  const scheduleResults = await toolScheduler.scheduleBatchFromToolCalls(
    toolCalls,
    { abortSignal: undefined, cwd: process.cwd() },
    { thinkingContent: response.content?.trim() }
  );

  // 5. 构建 tool 消息并添加到上下文
  for (const result of scheduleResults) {
    const toolMessage = buildToolMessage(result);
    contextManager.addToCurrentTurn(toolMessage);
  }
}

/**
 * 构建最终成功结果
 */
export function buildSuccessResult(
  response: LLMResponse,
  contextManager: ContextManager,
  loopCount: number
): ToolLoopResult {
  // 添加最终的 assistant 消息到当前轮次
  const finalMessage: Message = {
    role: 'assistant',
    content: response.content,
  };
  contextManager.addToCurrentTurn(finalMessage);

  return {
    success: true,
    result: response.content,
    loopCount,
  };
}

/**
 * 构建错误结果
 */
export function buildErrorResult(error: unknown, loopCount: number): ToolLoopResult {
  const errorMessage = error instanceof Error ? error.message : String(error);
  loopLogger.error(loopCount, errorMessage);

  return {
    success: false,
    error: errorMessage,
    loopCount,
  };
}
