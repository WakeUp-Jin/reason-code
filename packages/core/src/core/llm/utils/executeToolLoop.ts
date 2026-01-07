/**
 * 工具循环执行器
 * 简化版本的工具调用循环逻辑，供 Agent 使用
 * 集成上下文检查和压缩功能
 * 集成工具权限验证系统（通过 ToolScheduler）
 */

import { ILLMService, ToolLoopResult, ToolLoopConfig } from '../types/index.js';
import { ContextManager } from '../../context/index.js';
import { ToolManager } from '../../tool/ToolManager.js';
import { logger } from '../../../utils/logger.js';
import { loopLogger, contextLogger } from '../../../utils/logUtils.js';

import {
  createLoopContext,
  handleContextCompression,
  hasToolCalls,
  handleToolCalls,
  buildSuccessResult,
  buildErrorResult,
} from './executeToolLoopUtils.js';

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
  // 1. 初始化循环上下文
  const ctx = createLoopContext(llmService, toolManager, config);
  let loopCount = 0;

  // 记录循环开始
  loopLogger.start(ctx.maxLoops, ctx.enableCompression);

  // 2. 主循环
  while (loopCount < ctx.maxLoops) {
    loopCount++;
    loopLogger.iteration(loopCount, ctx.maxLoops);
    ctx.executionStream?.incrementLoopCount();

    try {
      // 3. 获取当前上下文
      const messages = contextManager.getContext();

      // 4. 溢出检查（95% 阈值）
      const overflowCheck = ctx.contextChecker.checkOverflow(messages);
      if (!overflowCheck.passed) {
        contextLogger.overflow(
          overflowCheck.currentTokens,
          ctx.contextChecker.getModelLimit(),
          overflowCheck.usagePercent
        );
        return {
          success: false,
          error: overflowCheck.error || '上下文溢出，请开始新会话或压缩历史',
          loopCount,
        };
      }

      // 5. 压缩检查（70% 阈值）
      if (ctx.enableCompression && ctx.historyCompressor) {
        await handleContextCompression(
          contextManager,
          ctx.contextChecker,
          ctx.historyCompressor,
          messages,
          overflowCheck.usagePercent
        );
      }

      // 6. 获取工具定义并调用 LLM
      const tools = toolManager.getFormattedTools();
      ctx.executionStream?.startThinking();

      const response = await llmService.complete(messages, tools);

      // 7. 完成思考并更新统计
      if (response.reasoningContent) {
        ctx.executionStream?.completeThinking(response.reasoningContent);
      }
      if (response.usage) {
        ctx.executionStream?.updateStats({
          inputTokens: response.usage.promptTokens,
          outputTokens: response.usage.completionTokens,
        });
        ctx.contextChecker.updateTokenCount(response.usage.promptTokens);
      }

      // 8. 处理响应
      if (hasToolCalls(response)) {
        await handleToolCalls(response, contextManager, ctx);
        continue;
      }

      // 9. 没有工具调用，返回最终结果
      const totalTokens = ctx.contextChecker.getLastPromptTokens();
      loopLogger.complete(loopCount, totalTokens);
      return buildSuccessResult(response, contextManager, loopCount);
    } catch (error) {
      return buildErrorResult(error, loopCount);
    }
  }

  // 10. 超过最大循环次数
  const totalTokens = ctx.contextChecker.getLastPromptTokens();
  loopLogger.complete(loopCount, totalTokens);
  logger.warn(`Max loop count exceeded`, { maxLoops: ctx.maxLoops });
  return {
    success: false,
    error: `超过最大循环次数 (${ctx.maxLoops})`,
    loopCount,
  };
}
