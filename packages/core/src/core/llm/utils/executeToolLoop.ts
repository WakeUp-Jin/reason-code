/**
 * 工具循环执行器
 * 简化版本的工具调用循环逻辑，供 Agent 使用
 * 集成上下文检查和压缩功能
 * 集成工具权限验证系统（通过 ToolScheduler）
 */

import { ILLMService, ToolLoopResult, ToolLoopConfig } from '../types/index.js';
import { ContextManager } from '../../context/index.js';
import { ToolManager } from '../../tool/ToolManager.js';
import { ToolScheduler } from '../../tool/ToolScheduler.js';
import { ApprovalMode } from '../../tool/types.js';
import { Message } from '../../context/types.js';
import { eventBus } from '../../../evaluation/EventBus.js';
import { logger } from '../../../utils/logger.js';
import { ContextChecker, DEFAULT_THRESHOLDS } from '../../context/utils/ContextChecker.js';
import { HistoryCompressor } from '../../context/utils/HistoryCompressor.js';
import { ToolOutputSummarizer } from '../../context/utils/ToolOutputSummarizer.js';

/** 默认 Token 限制 */
const DEFAULT_MODEL_LIMIT = 64_000;

/**
 * 执行工具循环
 *
 * 循环逻辑：
 * 1. 从 ContextManager 获取当前上下文
 * 2. 调用 LLM 完成
 * 3. 如果返回工具调用，执行工具并更新上下文
 * 4. 重复直到 LLM 返回最终结果或达到最大循环次数
 *
 * @param llmService - LLM 服务实例
 * @param contextManager - 上下文管理器
 * @param toolManager - 工具管理器
 * @param config - 可选配置
 * @returns 工具循环执行结果
 */
export async function executeToolLoop(
  llmService: ILLMService,
  contextManager: ContextManager,
  toolManager: ToolManager,
  config?: ToolLoopConfig
): Promise<ToolLoopResult> {
  const maxLoops = config?.maxLoops ?? 10;
  const agentName = config?.agentName ?? 'simple_agent';
  const executionStream = config?.executionStream;
  const modelLimit = config?.modelLimit ?? DEFAULT_MODEL_LIMIT;
  const enableCompression = config?.enableCompression ?? true;
  const enableToolSummarization = config?.enableToolSummarization ?? true;
  const approvalMode = config?.approvalMode ?? ApprovalMode.DEFAULT;
  const onConfirmRequired = config?.onConfirmRequired;
  let loopCount = 0;

  // 初始化上下文检查器（使用 CLI 传入的 modelLimit）
  const contextChecker = new ContextChecker(modelLimit);

  // 初始化历史压缩器和工具输出总结器（懒加载）
  let historyCompressor: HistoryCompressor | null = null;
  let toolOutputSummarizer: ToolOutputSummarizer | null = null;

  if (enableCompression) {
    historyCompressor = new HistoryCompressor(llmService);
  }
  if (enableToolSummarization) {
    toolOutputSummarizer = new ToolOutputSummarizer(llmService);
  }

  // 初始化工具调度器（集成 ExecutionStream 和工具输出总结）
  const toolScheduler = new ToolScheduler(toolManager, {
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

  logger.info(`Tool loop started`, {
    maxLoops,
    modelLimit,
    enableCompression,
    enableToolSummarization,
    approvalMode,
  });

  while (loopCount < maxLoops) {
    loopCount++;
    logger.debug(`Tool loop iteration`, { loopCount, maxLoops });

    // 更新执行流循环计数
    executionStream?.incrementLoopCount();

    try {
      // 1. 获取当前上下文
      const messages = contextManager.getContext();

      // 2. 上下文检查 - 95% 溢出检查
      const overflowCheck = contextChecker.checkOverflow(messages);
      if (!overflowCheck.passed) {
        logger.warn(`Context overflow detected`, {
          usagePercent: overflowCheck.usagePercent,
          currentTokens: overflowCheck.currentTokens,
        });

        return {
          success: false,
          error: overflowCheck.error || '上下文溢出，请开始新会话或压缩历史',
          loopCount,
        };
      }

      // 3. 上下文检查 - 70% 压缩检查
      if (enableCompression && historyCompressor && contextChecker.checkCompression(messages)) {
        logger.info(`Context compression triggered`, {
          usagePercent: overflowCheck.usagePercent,
        });

        // 获取历史上下文进行压缩
        const history = contextManager.getHistory();
        const historyMessages = history.getAll();

        if (historyMessages.length > 0) {
          const compressionResult = await historyCompressor.compress(historyMessages);

          if (compressionResult.compressed && compressionResult.summary) {
            // 创建摘要消息并替换历史
            const summaryMessage: Message = {
              role: 'system',
              content: `[历史对话摘要]\n${compressionResult.summary}`,
            };

            // 保留最近的消息
            const recentMessages = history.getRecent(
              Math.ceil(historyMessages.length * DEFAULT_THRESHOLDS.compressionPreserve)
            );

            // 替换历史
            history.replace([summaryMessage, ...recentMessages]);

            logger.info(`History compressed`, {
              originalTokens: compressionResult.originalTokens,
              compressedTokens: compressionResult.compressedTokens,
              reduction: `${((1 - compressionResult.compressedTokens / compressionResult.originalTokens) * 100).toFixed(1)}%`,
            });
          }
        }
      }

      // 4. 获取格式化的工具定义
      const tools = toolManager.getFormattedTools();

      // 开始思考
      executionStream?.startThinking();

      // 5. 调用 LLM
      const response = await llmService.complete(messages, tools);

      // 完成思考 - 传递推理模型的 reasoningContent（如果有）
      executionStream?.completeThinking(response.reasoningContent);

      // 更新 Token 统计
      if (response.usage) {
        executionStream?.updateStats({
          inputTokens: response.usage.promptTokens,
          outputTokens: response.usage.completionTokens,
        });

        // 更新上下文检查器的 Token 计数（使用实际值）
        contextChecker.updateTokenCount(response.usage.promptTokens);
      }
      logger.info(`LLM的完整输出：`, response);

      // 6. 判断是否有工具调用
      if (
        response.finishReason === 'tool_calls' &&
        response.toolCalls &&
        response.toolCalls.length > 0
      ) {
        logger.info(`Tool calls detected`, { count: response.toolCalls.length });

        // 记录 LLM 的思考内容（如果有）
        if (response.content) {
          logger.debug(`LLM thinking`, { content: response.content.slice(0, 100) });
        }

        // 7. 构建 assistant 消息（包含工具调用）
        const assistantMessage: Message = {
          role: 'assistant',
          content: response.content || '',
          tool_calls: response.toolCalls,
        };

        // 8. 添加到当前轮次
        contextManager.addToCurrentTurn(assistantMessage);

        // 9. 通知 CLI 层保存 assistant 消息（包含 tool_calls）
        // 确保历史消息加载时序列合法
        executionStream?.addAssistantMessage(response.content || '', response.toolCalls);

        // 10. 触发工具调用事件（用于评估系统）
        for (const toolCall of response.toolCalls) {
          eventBus.emit('tool:call', {
            agentName,
            toolName: toolCall.function.name,
          });
        }

        // 11. 批量执行所有工具调用
        // ToolScheduler 内部处理：参数解析、权限验证、执行、输出总结、UI 通知
        const scheduleResults = await toolScheduler.scheduleBatchFromToolCalls(
          response.toolCalls,
          { abortSignal: undefined, cwd: process.cwd() },
          { thinkingContent: response.content?.trim() }
        );

        // 12. 构建 tool 消息并添加到上下文
        for (const result of scheduleResults) {
          const toolMessage: Message = {
            role: 'tool',
            tool_call_id: result.callId,
            name: result.toolName,
            content: result.success
              ? result.resultString!
              : JSON.stringify({
                  status: result.status,
                  message: result.error || '工具执行被取消或失败',
                }),
          };
          contextManager.addToCurrentTurn(toolMessage);

          // 记录日志
          if (result.success) {
            logger.debug(`Tool result`, {
              toolName: result.toolName,
              resultPreview: result.resultString?.slice(0, 200),
            });
          } else {
            logger.warn(`Tool ${result.toolName} was not executed`, {
              status: result.status,
              error: result.error,
            });
          }
        }

        // 继续循环
        continue;
      }

      // 12. 没有工具调用，返回最终结果
      logger.info(`Tool loop completed`, { loopCount });
      logger.debug(`Final result`, { contentPreview: response.content?.slice(0, 200) });

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
    } catch (error) {
      logger.error(`LLM call failed`, { loopCount, error });

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        loopCount,
      };
    }
  }

  // 超过最大循环次数
  logger.warn(`Max loop count exceeded`, { maxLoops });
  return {
    success: false,
    error: `超过最大循环次数 (${maxLoops})`,
    loopCount,
  };
}
