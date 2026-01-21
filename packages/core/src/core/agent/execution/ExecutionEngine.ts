/**
 * Agent 执行引擎
 *
 * 职责：
 * - 管理 LLM 调用循环
 * - 协调工具调度
 * - 处理上下文压缩
 * - 溢出检测和中断控制
 *
 * 使用方式：
 * ```typescript
 * const engine = new ExecutionEngine(llmService, contextManager, toolManager, config);
 * const result = await engine.execute();
 * ```
 */

import { ILLMService, ToolLoopResult, ToolLoopConfig, LLMResponse } from '../../llm/types/index.js';
import { ContextManager, ToolOutputSummarizer } from '../../context/index.js';
import { ToolManager } from '../../tool/ToolManager.js';
import { ToolScheduler, ScheduleResult } from '../../tool/ToolScheduler.js';
import { ApprovalMode, ConfirmDetails, ConfirmOutcome } from '../../tool/types.js';
import { Message } from '../../context/types.js';
import { logger } from '../../../utils/logger.js';
import { loopLogger, contextLogger } from '../../../utils/logUtils.js';
import { eventBus } from '../../../evaluation/EventBus.js';
import { ExecutionStreamManager } from '../../execution/index.js';
import { StatsManager } from '../../stats/index.js';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';

/** 默认 Token 限制 */
const DEFAULT_MODEL_LIMIT = 64_000;

/** LLM 请求日志文件路径 */
const LLM_REQUEST_LOG_FILE = join(process.cwd(), 'logs', 'llm-last-request.json');

/**
 * 保存最新的 LLM 请求参数到文件
 * 每次调用会覆盖之前的内容
 */
function saveLLMRequest(messages: Message[], tools: any[]): void {
  try {
    const logDir = dirname(LLM_REQUEST_LOG_FILE);
    if (!existsSync(logDir)) {
      mkdirSync(logDir, { recursive: true });
    }

    const requestData = {
      timestamp: new Date().toISOString(),
      messagesCount: messages.length,
      toolsCount: tools.length,
      messages,
      tools,
    };

    writeFileSync(LLM_REQUEST_LOG_FILE, JSON.stringify(requestData, null, 2), 'utf-8');
    logger.debug('LLM request saved to log file', { path: LLM_REQUEST_LOG_FILE });
  } catch (error) {
    // 日志保存失败不影响主流程
    logger.warn('Failed to save LLM request log', { error });
  }
}

/**
 * 检查 LLM 响应是否包含工具调用
 */
function hasToolCalls(response: LLMResponse): boolean {
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
function buildToolMessage(result: ScheduleResult): Message {
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
 * 迭代结果类型
 */
interface IterationResult {
  done: boolean;
  value?: ToolLoopResult;
}

/**
 * Agent 执行引擎
 *
 * 负责管理 LLM 调用循环、工具调度协调、上下文压缩和中断控制。
 * 每次 Agent.run() 调用时创建新实例。
 */
export class ExecutionEngine {
  // 依赖
  private llmService: ILLMService;
  private contextManager: ContextManager;
  private toolManager: ToolManager;
  private toolScheduler: ToolScheduler;

  // 状态
  private loopCount = 0;

  // 配置
  private maxLoops: number;
  private enableCompression: boolean;
  private modelLimit: number;
  private agentName: string;
  private executionStream?: ExecutionStreamManager;
  private workingDirectory: string;

  // 统计
  private statsManager?: StatsManager;

  // 中断控制
  private abortSignal?: AbortSignal;

  constructor(
    llmService: ILLMService,
    contextManager: ContextManager,
    toolManager: ToolManager,
    config?: ToolLoopConfig
  ) {
    this.llmService = llmService;
    this.contextManager = contextManager;
    this.toolManager = toolManager;

    // 提取配置
    this.maxLoops = config?.maxLoops ?? 50;
    this.enableCompression = config?.enableCompression ?? true;
    this.modelLimit = config?.modelLimit ?? DEFAULT_MODEL_LIMIT;
    this.agentName = config?.agentName ?? 'agent';
    this.executionStream = config?.executionStream;
    this.statsManager = config?.statsManager;
    this.abortSignal = config?.abortSignal;
    this.workingDirectory = config?.workingDirectory ?? process.cwd();

    // 提取工具调度器配置
    const enableToolSummarization = config?.enableToolSummarization ?? true;
    const approvalMode = config?.approvalMode ?? ApprovalMode.DEFAULT;
    const onConfirmRequired = config?.onConfirmRequired;

    // 创建工具调度器（ToolOutputSummarizer 自动从 LLMServiceRegistry 获取 SECONDARY 模型）
    this.toolScheduler = new ToolScheduler(toolManager, {
      approvalMode,
      executionStream: this.executionStream,
      enableToolSummarization,
      toolOutputSummarizer: enableToolSummarization ? new ToolOutputSummarizer() : undefined,
      onConfirmRequired: onConfirmRequired ? this.createConfirmHandler(onConfirmRequired) : undefined,
    });

    // 配置压缩（LLM 服务由 HistoryContext 从 LLMServiceRegistry 获取）
    if (this.enableCompression) {
      contextManager.configureCompression({
        modelLimit: this.modelLimit,
        sessionId: config?.sessionId,
      });
    }
  }

  /**
   * 检查是否被中断
   */
  private isAborted(): boolean {
    return this.abortSignal?.aborted ?? false;
  }

  /**
   * 执行工具循环
   * 主入口方法
   */
  async execute(): Promise<ToolLoopResult> {
    loopLogger.start(this.maxLoops, this.enableCompression);

    while (this.loopCount < this.maxLoops) {
      // 检查是否被中断
      if (this.isAborted()) {
        return this.buildCancelledResult();
      }

      const result = await this.executeIteration();
      if (result.done) {
        return result.value!;
      }
    }

    return this.buildMaxLoopResult();
  }

  /**
   * 执行单次迭代
   */
  private async executeIteration(): Promise<IterationResult> {
    this.loopCount++;
    loopLogger.iteration(this.loopCount, this.maxLoops);
    this.executionStream?.incrementLoopCount();

    try {
      // 0. 中断检查
      if (this.isAborted()) {
        return { done: true, value: this.buildCancelledResult() };
      }

      // 1. 溢出检查
      const overflowResult = this.checkOverflow();
      if (overflowResult) {
        return { done: true, value: overflowResult };
      }

      // 2. 获取上下文
      const messages = await this.contextManager.getContext(this.enableCompression);

      // 3. 中断检查（获取上下文后）
      if (this.isAborted()) {
        return { done: true, value: this.buildCancelledResult() };
      }

      // 4. 调用 LLM（传递 abortSignal 以支持中断）
      const tools = this.toolManager.getFormattedTools();

      // 保存最新的 LLM 请求参数（每次覆盖）
      saveLLMRequest(messages, tools);

      this.executionStream?.startThinking();
      const response = await this.llmService.complete(messages, tools, {
        abortSignal: this.abortSignal,
      });

      // 5. 中断检查（LLM 调用后）
      if (this.isAborted()) {
        return { done: true, value: this.buildCancelledResult() };
      }

      // 6. 更新统计
      this.updateStats(response);

      // 7. 处理响应
      if (hasToolCalls(response)) {
        await this.handleToolCalls(response);

        // 8. 中断检查（工具调用后）
        if (this.isAborted()) {
          return { done: true, value: this.buildCancelledResult() };
        }

        return { done: false };
      }

      // 9. 无工具调用，返回最终结果
      return { done: true, value: this.buildSuccessResult(response) };
    } catch (error) {
      // 检查是否是中断错误
      if (this.isAborted()) {
        return { done: true, value: this.buildCancelledResult() };
      }
      return { done: true, value: this.buildErrorResult(error) };
    }
  }

  /**
   * 检查上下文溢出
   */
  private checkOverflow(): ToolLoopResult | null {
    if (!this.contextManager.isOverflow()) {
      return null;
    }

    const usage = this.contextManager.getTokenUsage();
    contextLogger.overflow(usage.used, usage.limit, usage.percentage);

    return {
      success: false,
      error: '上下文溢出，请开始新会话或压缩历史',
      loopCount: this.loopCount,
    };
  }

  /**
   * 更新统计信息
   */
  private updateStats(response: LLMResponse): void {
    if (response.reasoningContent) {
      this.executionStream?.completeThinking(response.reasoningContent);
    }
    if (response.usage) {
      // 构建完整的 TokenUsage
      const tokenUsage = {
        inputTokens: response.usage.promptTokens,
        outputTokens: response.usage.completionTokens,
        cacheHitTokens: response.usage.cacheHitTokens,
        cacheMissTokens: response.usage.cacheMissTokens,
        reasoningTokens: response.usage.reasoningTokens,
      };

      // 更新 StatsManager 计算费用
      if (this.statsManager) {
        this.statsManager.update(tokenUsage);
      }

      // 获取累计费用（CNY）
      const totalCost = this.statsManager?.getTotalCostCNY() ?? 0;

      // 获取完整的 AgentStats（新接口）
      const agentStats = this.statsManager?.getStats(this.contextManager);

      // 更新执行流统计（携带完整 token 信息、totalCost 和 agentStats）
      this.executionStream?.updateStats(tokenUsage, totalCost, agentStats);

      this.contextManager.updateTokenCount(response.usage.promptTokens);
    }
  }

  /**
   * 处理工具调用
   */
  private async handleToolCalls(response: LLMResponse): Promise<void> {
    const toolCalls = response.toolCalls!;

    // 1. 添加 assistant 消息
    const assistantMessage: Message = {
      role: 'assistant',
      content: response.content || '',
      reasoning_content: response.reasoningContent || '',
      tool_calls: toolCalls,
    };
    this.contextManager.addToCurrentTurn(assistantMessage);

    // 2. 通知 CLI 层保存 assistant 消息
    this.executionStream?.addAssistantMessage(response.content || '', toolCalls);

    // 3. 触发事件
    for (const toolCall of toolCalls) {
      eventBus.emit('tool:call', {
        agentName: this.agentName,
        toolName: toolCall.function.name,
      });
    }

    // 4. 执行工具（传递 abortSignal 和 workingDirectory 以支持中断和子代理工作目录继承）
    const results = await this.toolScheduler.scheduleBatchFromToolCalls(
      toolCalls,
      {
        abortSignal: this.abortSignal,
        cwd: this.workingDirectory,
        workingDirectory: this.workingDirectory,
      },
      { thinkingContent: response.content?.trim() }
    );

    // 5. 添加工具结果到上下文
    for (const result of results) {
      const toolMessage = buildToolMessage(result);
      this.contextManager.addToCurrentTurn(toolMessage);
    }
  }

  /**
   * 构建成功结果
   */
  private buildSuccessResult(response: LLMResponse): ToolLoopResult {
    const totalTokens = this.contextManager.getLastPromptTokens();
    loopLogger.complete(this.loopCount, totalTokens);

    // 对于推理模型（如 DeepSeek Reasoner），最终回答可能在 reasoningContent 里
    // 优先使用 content，如果为空则使用 reasoningContent
    const finalContent = response.content || response.reasoningContent || '';

    this.contextManager.addToCurrentTurn({
      role: 'assistant',
      content: finalContent,
      reasoning_content: response.reasoningContent,
    });

    return {
      success: true,
      result: finalContent,
      loopCount: this.loopCount,
    };
  }

  /**
   * 构建错误结果
   */
  private buildErrorResult(error: unknown): ToolLoopResult {
    const errorMessage = error instanceof Error ? error.message : String(error);
    loopLogger.error(this.loopCount, errorMessage);

    return {
      success: false,
      error: errorMessage,
      loopCount: this.loopCount,
    };
  }

  /**
   * 构建超出最大循环次数结果
   */
  private buildMaxLoopResult(): ToolLoopResult {
    const totalTokens = this.contextManager.getLastPromptTokens();
    loopLogger.complete(this.loopCount, totalTokens);
    logger.warn(`Max loop count exceeded`, { maxLoops: this.maxLoops });

    return {
      success: false,
      error: `超过最大循环次数 (${this.maxLoops})`,
      loopCount: this.loopCount,
    };
  }

  /**
   * 构建取消结果
   *
   * 中断时：
   * - 清理当前轮次中不完整的消息
   * - 保留已完成的消息
   */
  private buildCancelledResult(): ToolLoopResult {
    logger.info('Execution cancelled by user');

    // 清理当前轮次中不完整的消息，保留已完成的
    this.contextManager.sanitizeCurrentTurn();

    return {
      success: false,
      cancelled: true,
      error: '执行已暂停',
      loopCount: this.loopCount,
    };
  }

  /**
   * 创建确认处理器
   * 包装外部的 onConfirmRequired 回调，添加工具名称参数
   * 
   */

  private createConfirmHandler(
    onConfirmRequired:(callId:string,toolName:string,details:ConfirmDetails) => Promise<ConfirmOutcome>
  ):(callId:string,details:ConfirmDetails) => Promise<ConfirmOutcome>  {
    return async (callId,details) => {
      const records = this.toolScheduler.getRecords();
      const record = records.find((r) => r.request.callId === callId);
      const toolName = record?.request.toolName ?? 'unknown';
      return onConfirmRequired(callId,toolName,details);
    }
  };
}
