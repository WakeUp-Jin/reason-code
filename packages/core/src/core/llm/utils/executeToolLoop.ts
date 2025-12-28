/**
 * 工具循环执行器
 * 简化版本的工具调用循环逻辑，供 Agent 使用
 */

import { ILLMService, ToolLoopResult, ToolLoopConfig } from '../types/index.js';
import { ContextManager } from '../../context/index.js';
import { ToolManager } from '../../tool/ToolManager.js';
import { ContextType, Message } from '../../context/types.js';
import { eventBus } from '../../../evaluation/EventBus.js';
import { deepParseArgs, sleep } from './helpers.js';
import { generateSummary, generateParamsSummary } from '../../execution/index.js';
import { logger } from '../../../utils/logger.js';

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
  let loopCount = 0;

  logger.info(`Tool loop started`, { maxLoops });

  while (loopCount < maxLoops) {
    loopCount++;
    logger.debug(`Tool loop iteration`, { loopCount, maxLoops });

    // 更新执行流循环计数
    executionStream?.incrementLoopCount();

    try {
      // 1. 获取当前上下文
      const messages = contextManager.getContext();

      // 2. 获取格式化的工具定义
      const tools = toolManager.getFormattedTools();

      // 开始思考
      executionStream?.startThinking();

      // 3. 调用 LLM
      const response = await llmService.complete(messages, tools);

      // 完成思考 - 传递推理模型的 reasoningContent（如果有）
      executionStream?.completeThinking(response.reasoningContent);

      // 更新 Token 统计
      if (response.usage) {
        executionStream?.updateStats({
          inputTokens: response.usage.promptTokens,
          outputTokens: response.usage.completionTokens,
        });
      }
      logger.info(`LLM的完整输出：`, response);

      // 4. 判断是否有工具调用
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

        // 5. 构建 assistant 消息（包含工具调用）
        const assistantMessage: Message = {
          role: 'assistant',
          content: response.content || '',
          tool_calls: response.toolCalls,
        };

        // 6. 添加到 TOOL_MESSAGE_SEQUENCE
        contextManager.add(assistantMessage, ContextType.TOOL_MESSAGE_SEQUENCE);

        // 7. 执行所有工具调用
        // 只在第一个工具调用时传递 thinkingContent（LLM 的思考内容）
        const thinkingContent = response.content?.trim() || undefined;
        let isFirstToolCall = true;

        for (const toolCall of response.toolCalls) {
          const toolName = toolCall.function.name;

          try {
            // 解析参数
            const rawArgs = toolCall.function.arguments
              ? JSON.parse(toolCall.function.arguments)
              : {};
            const args = deepParseArgs(rawArgs);

            logger.info(`Executing tool`, { toolName });

            // 触发工具调用事件（用于评估系统）
            eventBus.emit('tool:call', {
              agentName,
              toolName,
            });

            // 启动执行流工具调用 - 第一个工具调用携带 thinkingContent
            const toolCallRecord = executionStream?.startToolCall({
              id: toolCall.id,
              toolName,
              toolCategory: 'builtin',
              params: args,
              paramsSummary: generateParamsSummary(toolName, args),
              thinkingContent: isFirstToolCall ? thinkingContent : undefined,
            });
            isFirstToolCall = false;

            // 执行工具
            const result = await toolManager.execute(toolName, args);
            const resultString = JSON.stringify(result);

            logger.debug(`Tool result`, { toolName, resultPreview: resultString.slice(0, 200) });

            // 完成执行流工具调用
            if (toolCallRecord) {
              executionStream?.completeToolCall(
                toolCall.id,
                result,
                generateSummary(toolName, args, result)
              );
            }

            // 8. 构建 tool 消息
            const toolMessage: Message = {
              role: 'tool',
              tool_call_id: toolCall.id,
              name: toolName,
              content: resultString,
            };

            // 9. 添加到 TOOL_MESSAGE_SEQUENCE
            contextManager.add(toolMessage, ContextType.TOOL_MESSAGE_SEQUENCE);

            // 等待一下避免请求过快
            await sleep(500);
          } catch (error) {
            logger.error(`Tool execution failed`, { toolName, error });

            // 执行流工具调用错误
            executionStream?.errorToolCall(
              toolCall.id,
              error instanceof Error ? error.message : String(error)
            );

            // 将错误信息作为工具结果返回
            const errorMessage: Message = {
              role: 'tool',
              tool_call_id: toolCall.id,
              name: toolName,
              content: JSON.stringify({
                error: error instanceof Error ? error.message : String(error),
              }),
            };

            contextManager.add(errorMessage, ContextType.TOOL_MESSAGE_SEQUENCE);
          }
        }

        // 继续循环
        continue;
      }

      // 10. 没有工具调用，返回最终结果
      logger.info(`Tool loop completed`, { loopCount });
      logger.debug(`Final result`, { contentPreview: response.content?.slice(0, 200) });

      // 添加最终的 assistant 消息
      const finalMessage: Message = {
        role: 'assistant',
        content: response.content,
      };
      contextManager.add(finalMessage, ContextType.TOOL_MESSAGE_SEQUENCE);

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
