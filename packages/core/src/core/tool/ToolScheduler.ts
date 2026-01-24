/**
 * 工具调度类
 * 负责管理工具调用的权限验证、状态机和执行调度
 * 集成 ExecutionStreamManager 自动通知 UI 层
 */

import {
  InternalTool,
  InternalToolContext,
  ApprovalMode,
  ConfirmDetails,
  ConfirmOutcome,
  SchedulerToolCallStatus,
  SchedulerToolCallRequest,
  SchedulerToolCallRecord,
} from './types.js';
import { Allowlist } from './Allowlist.js';
import { ToolManager } from './ToolManager.js';
import { logger } from '../../utils/logger.js';
import { toolLogger } from '../../utils/logUtils.js';
import { ExecutionStreamManager } from '../execution/ExecutionStreamManager.js';
import { ToolOutputSummarizer } from '../context/utils/ToolOutputSummarizer.js';
import { generateSummary, generateParamsSummary } from '../execution/summaryGenerators.js';
import { deepParseArgs, sleep } from '../llm/utils/helpers.js';

/**
 * 工具调度配置
 */
export interface ToolSchedulerConfig {
  /** 初始批准模式 */
  approvalMode?: ApprovalMode;
  /** 确认回调（UI 层提供） */
  onConfirmRequired?: (callId: string, details: ConfirmDetails) => Promise<ConfirmOutcome>;
  /** 执行流管理器（用于自动通知 UI） */
  executionStream?: ExecutionStreamManager;
  /** 是否启用工具输出总结 */
  enableToolSummarization?: boolean;
  /** 工具输出总结器 */
  toolOutputSummarizer?: ToolOutputSummarizer;
}

/**
 * 工具调度结果
 */
export interface ScheduleResult {
  /** 调用 ID */
  callId: string;
  /** 工具名称 */
  toolName: string;
  /** 是否成功 */
  success: boolean;
  /** 执行结果（原始对象） */
  result?: any;
  /** 处理后的结果字符串（可能已总结或截断） */
  resultString?: string;
  /** 错误信息 */
  error?: string;
  /** 状态 */
  status: SchedulerToolCallStatus;
}

/**
 * 工具调度类
 * 管理工具调用的整个生命周期
 * 自动集成 ExecutionStreamManager 进行 UI 通知
 */
export class ToolScheduler {
  private toolManager: ToolManager;
  private approvalMode: ApprovalMode;
  private allowlist: Allowlist;
  private toolCallRecords: Map<string, SchedulerToolCallRecord> = new Map();
  private onConfirmRequired?: (callId: string, details: ConfirmDetails) => Promise<ConfirmOutcome>;
  private executionStream?: ExecutionStreamManager;
  private enableToolSummarization: boolean;
  private toolOutputSummarizer?: ToolOutputSummarizer;

  constructor(toolManager: ToolManager, config?: ToolSchedulerConfig) {
    this.toolManager = toolManager;
    this.approvalMode = config?.approvalMode ?? ApprovalMode.DEFAULT;
    this.allowlist = new Allowlist();
    this.onConfirmRequired = config?.onConfirmRequired;
    this.executionStream = config?.executionStream;
    this.enableToolSummarization = config?.enableToolSummarization ?? false;
    this.toolOutputSummarizer = config?.toolOutputSummarizer;
  }

  /**
   * 设置批准模式
   */
  setApprovalMode(mode: ApprovalMode): void {
    this.approvalMode = mode;
    logger.info(`Approval mode changed to: ${mode}`);
  }

  /**
   * 获取当前批准模式
   */
  getApprovalMode(): ApprovalMode {
    return this.approvalMode;
  }

  /**
   * 清空 allowlist
   */
  clearAllowlist(): void {
    this.allowlist.clear();
    logger.info('Allowlist cleared');
  }

  /**
   * 获取 allowlist 实例（供外部访问）
   */
  getAllowlist(): Allowlist {
    return this.allowlist;
  }

  /**
   * 调度单个工具调用
   * 这是主要的调度入口
   * 自动处理：参数解析、权限验证、执行、输出总结、UI 通知
   */
  async schedule(
    request: SchedulerToolCallRequest,
    context?: InternalToolContext
  ): Promise<ScheduleResult> {
    const { callId, toolName, rawArgs, thinkingContent, toolCategory, paramsSummary } = request;

    // 1. 参数解析（支持 rawArgs 或已解析的 args）
    let args = request.args;
    if (rawArgs && !args) {
      try {
        args = deepParseArgs(JSON.parse(rawArgs));
      } catch (e) {
        const errorMessage = `参数解析失败: ${e instanceof Error ? e.message : String(e)}`;
        toolLogger.error(toolName, callId, errorMessage);
        this.executionStream?.errorToolCall(callId, errorMessage);
        return this.setError(callId, toolName, errorMessage);
      }
    }

    // 确保 args 存在
    if (!args) {
      args = {};
    }

    // 创建调用记录（更新 request 中的 args）
    const normalizedRequest = { ...request, args };
    const record: SchedulerToolCallRecord = {
      request: normalizedRequest,
      status: 'validating',
      startTime: Date.now(),
    };
    this.toolCallRecords.set(callId, record);

    // ✅ 新增：通知 ExecutionStream 开始验证
    this.executionStream?.startValidating(
      callId,
      toolName,
      toolCategory ?? 'builtin',
      paramsSummary ?? generateParamsSummary(toolName, args),
      thinkingContent
    );

    try {
      // 2. 获取工具定义
      const tool = this.toolManager.getTool(toolName);
      if (!tool) {
        const errorMessage = `Tool '${toolName}' not found`;
        this.executionStream?.errorToolCall(callId, errorMessage);
        return this.setError(callId, toolName, errorMessage);
      }

      // 3. 检查是否需要确认（allowlist 检查由工具内部的 shouldConfirmExecute 处理）
      const needsConfirm = await this.checkConfirmation(tool, args, context);

      if (needsConfirm) {
        // 需要用户确认
        this.updateStatus(callId, 'awaiting_approval', needsConfirm);

        // 通知 ExecutionStream 等待确认
        this.executionStream?.awaitingApproval(callId, toolName, needsConfirm);

        // 如果有确认回调，等待用户响应
        if (this.onConfirmRequired) {
          const outcome = await this.onConfirmRequired(callId, needsConfirm);

          if (outcome === 'cancel') {
            // 通知 ExecutionStream 取消
            this.executionStream?.cancelToolCall(callId, 'User cancelled');
            return this.setCancelled(callId, toolName, 'User cancelled');
          }

          // 调用确认回调（工具在这里自己处理 allowlist 更新）
          if (needsConfirm.onConfirm) {
            await needsConfirm.onConfirm(outcome);
          }
        } else {
          // 没有确认回调，在 DEFAULT 模式下拒绝执行
          if (this.approvalMode === ApprovalMode.DEFAULT) {
            const reason = 'Confirmation required but no confirm handler provided';
            this.executionStream?.cancelToolCall(callId, reason);
            return this.setCancelled(callId, toolName, reason);
          }
        }
      }

      // 4. 调度执行
      this.updateStatus(callId, 'scheduled');

      // 5. 开始执行 → 通知 ExecutionStream
      this.updateStatus(callId, 'executing');
      this.executionStream?.updateToExecuting(callId, args);

      // 记录工具开始执行
      toolLogger.execute(toolName, callId, args);

      // 6. 执行工具（注入 callId 和 executionStream 供子代理使用）
      const startTime = Date.now();
      const enrichedContext: InternalToolContext = {
        ...context,
        callId,
        executionStream: this.executionStream,
      };
      const result = await this.toolManager.execute(toolName, args, enrichedContext);

      const resultString = JSON.stringify(result);

      // 记录原始输出（DEBUG 级别完整记录）
      toolLogger.rawOutput(toolName, callId, resultString.slice(0, 5000) + '...');

      // 7. 工具输出总结（可选）
      let processedOutput = resultString;
      if (this.enableToolSummarization && this.toolOutputSummarizer) {
        logger.info(`Tool output summarization enabled for tool: ${toolName}`, { args });
        try {
          const summaryResult = await this.toolOutputSummarizer.process(
            resultString,
            toolName,
            args
          );
          if (summaryResult.summarized || summaryResult.truncated) {
            // 记录压缩详情（WARN 级别，包含完整的压缩前后数据）
            toolLogger.compressed(
              toolName,
              callId,
              resultString.slice(0, 1000) + '...', // 完整原始输出
              summaryResult.originalTokens,
              summaryResult.output, // 完整压缩输出
              summaryResult.processedTokens
            );
            processedOutput = summaryResult.output;
          } else {
            // 未压缩（低于阈值）
            toolLogger.noCompression(toolName, callId, summaryResult.originalTokens);
          }
        } catch (e) {
          logger.warn(`Tool output summarization failed`, { toolName, error: e });
        }
      }

      // 8. 完成 → 通知 ExecutionStream
      const duration = Date.now() - startTime;
      toolLogger.complete(toolName, callId, duration);

      // 统一使用 generateSummary 处理所有情况（成功/失败/警告）
      // 工具执行失败只是工具层面的失败，不是 Agent 整体错误
      // LLM 可以从 result 中看到 success: false 和 error 信息
      const summary = generateSummary(toolName, args, result);

      // 检查是否是统一结果接口格式且失败
      const isToolResultFormat = result && typeof result === 'object' && 'success' in result;
      const isToolFailed = isToolResultFormat && result.success === false;

      if (isToolFailed) {
        // 工具执行失败（但工具自己捕获了错误，返回了 success: false）
        // 仍然通过 completeToolCall 通知，但记录为失败
        toolLogger.error(toolName, callId, result.error || 'Unknown error', args);
      }

      // 从工具结果中提取策略信息（如 ripgrep、git-grep、javascript 等）
      const strategy = result?.data?.strategy;
      this.executionStream?.completeToolCall(callId, processedOutput, summary, strategy);

      // 9. 返回结果
      // 对于统一结果接口格式，根据 success 字段决定返回成功还是失败
      if (isToolFailed) {
        return this.setError(callId, toolName, result.error || 'Tool execution failed');
      }
      return this.setSuccess(callId, toolName, result, processedOutput);
    } catch (error) {
      // 兜底：捕获未预期的异常（如工具未使用统一结果接口时抛出的错误）
      const errorMessage = error instanceof Error ? error.message : String(error);

      // 记录工具执行失败（包含参数帮助调试）
      toolLogger.error(toolName, callId, errorMessage, args);

      // 通知 ExecutionStream 错误（这是真正的异常，不是工具返回的失败）
      this.executionStream?.errorToolCall(callId, errorMessage);

      return this.setError(callId, toolName, errorMessage);
    }
  }

  /**
   * 批量调度多个工具调用（使用 SchedulerToolCallRequest）
   */
  async scheduleBatch(
    requests: SchedulerToolCallRequest[],
    context?: InternalToolContext
  ): Promise<ScheduleResult[]> {
    // 串行执行，确保状态正确
    const results: ScheduleResult[] = [];
    for (const request of requests) {
      const result = await this.schedule(request, context);
      results.push(result);
      // 等待避免请求过快
      await sleep(500);
    }
    return results;
  }

  /**
   * 批量调度原始 LLM 工具调用
   * 直接接受 LLM 返回的 toolCalls 数组，内部处理参数解析和循环
   *
   * 自动判断是否可以并行执行：
   * - 如果所有工具都是只读的，则并行执行
   * - 否则串行执行
   *
   * @param toolCalls - LLM 返回的工具调用数组
   * @param context - 工具执行上下文
   * @param options - 可选配置（thinkingContent 只传递给第一个工具调用）
   */
  async scheduleBatchFromToolCalls(
    toolCalls: Array<{
      id: string;
      function: { name: string; arguments: string };
    }>,
    context?: InternalToolContext,
    options?: { thinkingContent?: string }
  ): Promise<ScheduleResult[]> {
    // 判断是否可以并行执行
    const canParallel = this.canExecuteInParallel(toolCalls);

    if (canParallel && toolCalls.length > 1) {
      // 并行执行（只读工具）
      logger.info('Executing tools in parallel', {
        count: toolCalls.length,
        tools: toolCalls.map((tc) => tc.function.name),
      });

      let isFirstToolCall = true;
      const promises = toolCalls.map((toolCall) => {
        const thinkingContent = isFirstToolCall ? options?.thinkingContent : undefined;
        isFirstToolCall = false;

        return this.schedule(
          {
            callId: toolCall.id,
            toolName: toolCall.function.name,
            rawArgs: toolCall.function.arguments,
            thinkingContent,
          },
          context
        );
      });

      return Promise.all(promises);
    } else {
      // 串行执行（写操作或有依赖）
      if (toolCalls.length > 1) {
        logger.info('Executing tools serially', {
          count: toolCalls.length,
          tools: toolCalls.map((tc) => tc.function.name),
        });
      }

      const results: ScheduleResult[] = [];
      let isFirstToolCall = true;

      for (const toolCall of toolCalls) {
        const result = await this.schedule(
          {
            callId: toolCall.id,
            toolName: toolCall.function.name,
            rawArgs: toolCall.function.arguments,
            thinkingContent: isFirstToolCall ? options?.thinkingContent : undefined,
          },
          context
        );
        isFirstToolCall = false;
        results.push(result);

        // 等待避免请求过快
        await sleep(500);
      }

      return results;
    }
  }

  /**
   * 判断工具调用是否可以并行执行
   * 只有全部是只读工具时才并行
   */
  private canExecuteInParallel(toolCalls: Array<{ function: { name: string } }>): boolean {
    return toolCalls.every((toolCall) => {
      const tool = this.toolManager.getTool(toolCall.function.name);

      if (!tool) {
        // 工具不存在，保守处理：串行
        return false;
      }

      // 检查工具是否是只读的
      const isReadOnly = tool.isReadOnly?.() ?? false;

      logger.debug('Tool parallel check', {
        toolName: toolCall.function.name,
        isReadOnly,
      });

      return isReadOnly;
    });
  }

  /**
   * 获取所有工具调用记录
   */
  getRecords(): SchedulerToolCallRecord[] {
    return Array.from(this.toolCallRecords.values());
  }

  /**
   * 清空所有记录
   */
  clearRecords(): void {
    this.toolCallRecords.clear();
  }

  // ============================================================
  // 私有方法
  // ============================================================

  /**
   * 检查工具是否需要确认
   * allowlist 会传递给工具的 shouldConfirmExecute 方法，由工具自己决定如何使用
   */
  private async checkConfirmation(
    tool: InternalTool,
    args: any,
    context?: InternalToolContext
  ): Promise<ConfirmDetails | false> {
    // 如果工具没有定义 shouldConfirmExecute，检查 isReadOnly
    if (!tool.shouldConfirmExecute) {
      // 只读工具不需要确认
      if (tool.isReadOnly && tool.isReadOnly()) {
        return false;
      }
      // 非只读工具在 DEFAULT 模式下需要确认
      if (this.approvalMode === ApprovalMode.DEFAULT) {
        return {
          type: 'info',
          panelTitle: `Tool: ${tool.name}`,
          message: '此工具需要用户确认',
        };
      }
      return false;
    }

    // 调用工具的 shouldConfirmExecute 方法，传递 allowlist
    return tool.shouldConfirmExecute(args, this.approvalMode, context, this.allowlist);
  }

  /**
   * 更新状态
   */
  private updateStatus(
    callId: string,
    status: SchedulerToolCallStatus,
    confirmDetails?: ConfirmDetails
  ): void {
    const record = this.toolCallRecords.get(callId);
    if (record) {
      record.status = status;
      if (confirmDetails) {
        record.confirmDetails = confirmDetails;
      }
    }
  }

  /**
   * 设置成功状态
   */
  private setSuccess(
    callId: string,
    toolName: string,
    result: any,
    resultString?: string
  ): ScheduleResult {
    const record = this.toolCallRecords.get(callId);
    if (record) {
      record.status = 'success';
      record.result = result;
      record.durationMs = Date.now() - (record.startTime || Date.now());
    }

    return {
      callId,
      toolName,
      success: true,
      result,
      resultString: resultString ?? JSON.stringify(result),
      status: 'success',
    };
  }

  /**
   * 设置错误状态
   */
  private setError(callId: string, toolName: string, error: string): ScheduleResult {
    const record = this.toolCallRecords.get(callId);
    if (record) {
      record.status = 'error';
      record.error = error;
      record.durationMs = Date.now() - (record.startTime || Date.now());
    }

    return {
      callId,
      toolName,
      success: false,
      error,
      status: 'error',
    };
  }

  /**
   * 设置取消状态
   */
  private setCancelled(callId: string, toolName: string, reason: string): ScheduleResult {
    const record = this.toolCallRecords.get(callId);
    if (record) {
      record.status = 'cancelled';
      record.error = reason;
      record.durationMs = Date.now() - (record.startTime || Date.now());
    }

    return {
      callId,
      toolName,
      success: false,
      error: reason,
      status: 'cancelled',
    };
  }
}
