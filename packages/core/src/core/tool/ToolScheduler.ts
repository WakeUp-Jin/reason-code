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
import { ToolManager } from './ToolManager.js';
import { logger } from '../../utils/logger.js';
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
  private allowlist: Set<string> = new Set();
  private toolCallRecords: Map<string, SchedulerToolCallRecord> = new Map();
  private onConfirmRequired?: (callId: string, details: ConfirmDetails) => Promise<ConfirmOutcome>;
  private executionStream?: ExecutionStreamManager;
  private enableToolSummarization: boolean;
  private toolOutputSummarizer?: ToolOutputSummarizer;

  constructor(toolManager: ToolManager, config?: ToolSchedulerConfig) {
    this.toolManager = toolManager;
    this.approvalMode = config?.approvalMode ?? ApprovalMode.DEFAULT;
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
   * 添加到 allowlist
   */
  addToAllowlist(key: string): void {
    this.allowlist.add(key);
    logger.debug(`Added to allowlist: ${key}`);
  }

  /**
   * 检查是否在 allowlist 中
   */
  isInAllowlist(key: string): boolean {
    return this.allowlist.has(key);
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
        logger.error(`Tool ${toolName} args parse failed`, { error: errorMessage });
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

      // 3. 检查是否需要确认
      const needsConfirm = await this.checkConfirmation(tool, args, context);

      if (needsConfirm) {
        // 检查 allowlist
        const allowlistKey = this.getAllowlistKey(toolName, args);
        if (this.isInAllowlist(allowlistKey)) {
          logger.debug(`Tool ${toolName} is in allowlist, skipping confirmation`);
        } else {
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

            // 如果用户选择"总是允许"，添加到 allowlist
            if (outcome === 'always') {
              this.addToAllowlist(allowlistKey);
            }

            // 调用确认回调
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
      }

      // 4. 调度执行
      this.updateStatus(callId, 'scheduled');

      // 5. 开始执行 → 通知 ExecutionStream
      this.updateStatus(callId, 'executing');
      // ✅ 新代码：使用 updateToExecuting 替代 startToolCall
      this.executionStream?.updateToExecuting(callId, args);

      // 6. 执行工具
      const result = await this.toolManager.execute(toolName, args, context);
      let resultString = JSON.stringify(result);

      // 7. 工具输出总结（可选）
      if (this.enableToolSummarization && this.toolOutputSummarizer) {
        try {
          const summaryResult = await this.toolOutputSummarizer.process(resultString, toolName);
          if (summaryResult.summarized || summaryResult.truncated) {
            logger.info(`Tool output processed`, {
              toolName,
              originalTokens: summaryResult.originalTokens,
              processedTokens: summaryResult.processedTokens,
              summarized: summaryResult.summarized,
              truncated: summaryResult.truncated,
            });
            resultString = summaryResult.output;
          }
        } catch (e) {
          logger.warn(`Tool output summarization failed`, { toolName, error: e });
          // 总结失败不影响结果，继续使用原始 resultString
        }
      }

      // 8. 完成 → 通知 ExecutionStream
      this.executionStream?.completeToolCall(
        callId,
        resultString,
        generateSummary(toolName, args, result)
      );

      // 9. 返回成功结果
      return this.setSuccess(callId, toolName, result, resultString);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Tool ${toolName} execution failed`, { error: errorMessage });

      // 通知 ExecutionStream 错误
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

    // 调用工具的 shouldConfirmExecute 方法
    return tool.shouldConfirmExecute(args, this.approvalMode, context);
  }

  /**
   * 生成 allowlist key
   */
  private getAllowlistKey(toolName: string, args: any): string {
    // 对于文件操作，使用文件路径作为 key
    if (args.filePath) {
      return `${toolName}:${args.filePath}`;
    }
    // 对于命令执行，使用命令作为 key
    if (args.command) {
      return `${toolName}:${args.command}`;
    }
    // 默认只使用工具名
    return toolName;
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

    logger.error(`Tool call ${callId} failed: ${error}`);

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

    logger.info(`Tool call ${callId} cancelled: ${reason}`);

    return {
      callId,
      toolName,
      success: false,
      error: reason,
      status: 'cancelled',
    };
  }
}
