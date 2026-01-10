/**
 * Agent 类
 * 独立实现，提供 CLI 友好的 API
 */

import { ContextManager, ContextType, Message } from '../context/index.js';
import { ToolManager } from '../tool/ToolManager.js';
import { ILLMService } from '../llm/types/index.js';
import { createLLMService } from '../llm/factory.js';
import { ToolLoopExecutor } from '../llm/utils/executeToolLoop.js';
import { eventBus } from '../../evaluation/EventBus.js';
import { INSIGHT_FORMAT_PROMPT, SIMPLE_AGENT_PROMPT } from '../promptManager/index.js';
import { ExecutionStreamManager } from '../execution/index.js';
import { ApprovalMode, ConfirmDetails, ConfirmOutcome } from '../tool/types.js';
import { SessionStats, type CheckpointStats, type ModelPricing } from '../stats/index.js';
import { logger } from '../../utils/logger.js';

/**
 * Agent 配置
 */
export interface AgentConfig {
  // LLM 配置
  provider: string;
  model: string;
  apiKey?: string;
  baseURL?: string;

  // Agent 配置
  name?: string;
  systemPrompt?: string;
  maxLoops?: number;
}

/**
 * 历史消息加载选项
 */
export interface HistoryLoadOptions {
  /** 是否清空现有上下文，默认 true */
  clearExisting?: boolean;
  /** 是否跳过系统提示词，默认 true */
  skipSystemPrompt?: boolean;
  /** 最大加载消息数 */
  maxMessages?: number;
}

/**
 * 检查点数据（用于恢复会话状态）
 */
export interface SessionCheckpoint {
  /** 压缩生成的摘要 */
  summary: string;
  /** 从这个消息 ID 之后开始加载 */
  loadAfterMessageId: string;
  /** 压缩时间戳 */
  compressedAt: number;
  /** 累计统计 */
  stats: CheckpointStats;
}

/**
 * 压缩完成回调参数
 */
export interface CompressionCompleteEvent {
  /** 压缩生成的摘要 */
  summary: string;
  /** 被压缩的消息数量 */
  compressedCount: number;
  /** 保留的消息数量 */
  preservedCount: number;
  /** 压缩后的 token 数 */
  compressedTokens: number;
}

/**
 * Agent 运行选项
 */
export interface AgentRunOptions {
  /** 模型的 Token 限制（由 CLI 层传入） */
  modelLimit?: number;

  /** 会话 ID（用于压缩时引用历史文件） */
  sessionId: string;

  /** 工具确认回调（由 CLI 层提供） */
  onConfirmRequired?: (
    callId: string,
    toolName: string,
    details: ConfirmDetails
  ) => Promise<ConfirmOutcome>;

  /** 批准模式 */
  approvalMode?: ApprovalMode;

  /** 压缩完成回调（用于 CLI 保存检查点） */
  onCompressionComplete?: (event: CompressionCompleteEvent) => void;
}

/**
 * Agent 执行结果
 */
export interface AgentResult {
  /** 收集到的 Agent 名称列表 */
  agents: string[];
  /** 每个 Agent 调用的工具记录 */
  tools: Record<string, string[]>;
  /** 最终响应内容 */
  finalResponse: string;
  /** 是否成功 */
  success: boolean;
  /** 错误信息 */
  error?: string;
}

/**
 * Agent 类
 *
 * 使用方式：
 * ```typescript
 * const agent = new Agent({
 *   provider: 'deepseek',
 *   model: 'deepseek-chat',
 *   apiKey: process.env.DEEPSEEK_API_KEY,
 * });
 * await agent.init();
 * const result = await agent.run('你好', { modelLimit: 64000 });
 * ```
 */
export class Agent {
  private config: AgentConfig;
  private llmService: ILLMService | null = null;
  private contextManager: ContextManager;
  private toolManager: ToolManager;
  private initialized = false;
  private executionStream: ExecutionStreamManager;

  /** 会话统计（费用累计） */
  private sessionStats: SessionStats;

  /** 压缩完成回调 */
  private onCompressionComplete?: (event: CompressionCompleteEvent) => void;

  /** 中断控制器（用于取消执行） */
  private abortController: AbortController | null = null;

  /** 当前执行器（用于中断时清理） */
  private currentExecutor: ToolLoopExecutor | null = null;

  constructor(config: AgentConfig) {
    this.config = {
      name: config.name ?? 'agent',
      systemPrompt: config.systemPrompt ?? SIMPLE_AGENT_PROMPT,
      maxLoops: config.maxLoops ?? 100,
      ...config,
    };
    this.contextManager = new ContextManager();
    this.toolManager = new ToolManager();
    this.executionStream = new ExecutionStreamManager();
    this.sessionStats = new SessionStats();
  }

  /**
   * 初始化 Agent
   * 创建 LLM 服务、设置系统提示词
   */
  async init(): Promise<void> {
    // 创建 LLM 服务
    this.llmService = await createLLMService({
      provider: this.config.provider,
      model: this.config.model,
      apiKey: this.config.apiKey,
      baseURL: this.config.baseURL,
    });

    // 设置系统提示词
    let systemPrompt = this.config.systemPrompt ?? INSIGHT_FORMAT_PROMPT;
    if (systemPrompt) {
      this.contextManager.setSystemPrompt(systemPrompt);
    }

    this.initialized = true;
  }

  /**
   * 从检查点初始化 Agent
   * 用于恢复之前的会话状态
   *
   * @param history - 完整历史消息（用于没有检查点时）
   * @param checkpoint - 检查点数据（如有）
   */
  async initWithCheckpoint(
    history: Message[],
    checkpoint?: SessionCheckpoint
  ): Promise<void> {
    // 先执行基本初始化
    await this.init();

    if (checkpoint) {
      // 有检查点：从检查点恢复
      logger.info('Restoring from checkpoint', {
        loadAfterMessageId: checkpoint.loadAfterMessageId,
        compressedAt: new Date(checkpoint.compressedAt).toISOString(),
      });

      // 找到分割点
      const splitIndex = history.findIndex(
        (msg) => (msg as any).id === checkpoint.loadAfterMessageId
      );

      if (splitIndex === -1) {
        // 消息 ID 找不到，加载完整历史
        logger.warn('Checkpoint message ID not found, loading full history');
        this.loadHistory(history);
      } else {
        // 使用摘要 + 分割点之后的消息
        const partialHistory = history.slice(splitIndex + 1);
        this.contextManager.loadWithSummary(checkpoint.summary, partialHistory);
      }

      // 恢复统计数据
      this.sessionStats.restore(checkpoint.stats);
    } else {
      // 无检查点：加载完整历史
      this.loadHistory(history);
    }
  }

  /**
   * 切换模型
   * 重新创建 LLM 服务，保留上下文
   */
  async setModel(provider: string, model: string, apiKey?: string): Promise<void> {
    this.config.provider = provider;
    this.config.model = model;
    if (apiKey) {
      this.config.apiKey = apiKey;
    }

    // 重新创建 LLM 服务（保留上下文）
    this.llmService = await createLLMService({
      provider: this.config.provider,
      model: this.config.model,
      apiKey: this.config.apiKey,
      baseURL: this.config.baseURL,
    });
  }

  /**
   * 执行 Agent
   * @param userInput - 用户输入
   * @param options - 运行选项
   * @returns Agent 执行结果
   */
  async run(userInput: string, options?: AgentRunOptions): Promise<AgentResult> {
    if (!this.initialized || !this.llmService) {
      throw new Error('Agent not initialized. Call init() first.');
    }

    // 创建新的中断控制器
    this.abortController = new AbortController();

    // 重置事件收集器
    eventBus.reset();

    // 记录执行前的累计费用（用于计算本次执行费用）
    const costBeforeRun = this.sessionStats.getTotalCostCNY();

    // 发射 Agent 调用事件
    eventBus.emit('agent:call', { agentName: this.config.name! });

    // 启动执行流
    this.executionStream.start();

    try {
      // 设置用户输入
      this.contextManager.setUserInput(userInput);

      // 执行工具循环
      const executor = new ToolLoopExecutor(
        this.llmService,
        this.contextManager,
        this.toolManager,
        {
          maxLoops: this.config.maxLoops,
          agentName: this.config.name,
          executionStream: this.executionStream,
          model: this.config.model,
          modelLimit: options?.modelLimit,
          sessionId: options?.sessionId,
          onConfirmRequired: options?.onConfirmRequired,
          approvalMode: options?.approvalMode,
          abortSignal: this.abortController.signal,
          sessionStats: this.sessionStats,
        }
      );

      // 保存当前执行器引用
      this.currentExecutor = executor;

      const loopResult = await executor.run();

      // 清理执行器引用
      this.currentExecutor = null;

      // 检查是否被中断
      if (loopResult.cancelled) {
        // 中断时不归档到历史，保留 currentTurn 中已完成的消息
        // sanitize 已在 executor 中调用
        this.executionStream.cancel('用户取消执行');

        const collected = eventBus.getData();
        return {
          agents: collected.agents,
          tools: collected.tools,
          finalResponse: '',
          success: false,
          error: '执行已暂停',
        };
      }

      // 完成当前轮次（归档到历史）
      this.contextManager.finishTurn();

      // 计算本次执行的费用（CNY）= 当前累计 - 执行前累计
      const costCNY = this.sessionStats.getTotalCostCNY() - costBeforeRun;
      
      // 完成执行流，传递本次执行费用
      this.executionStream.complete(costCNY);

      // 从事件系统获取收集的数据
      const collected = eventBus.getData();

      return {
        agents: collected.agents,
        tools: collected.tools,
        finalResponse: loopResult.result || '',
        success: loopResult.success,
        error: loopResult.error,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      // 清理执行器引用
      this.currentExecutor = null;

      // 执行流错误
      this.executionStream.error(errorMessage);

      // 从事件系统获取收集的数据
      const collected = eventBus.getData();

      return {
        agents: collected.agents,
        tools: collected.tools,
        finalResponse: '',
        success: false,
        error: errorMessage,
      };
    } finally {
      // 清理中断控制器
      this.abortController = null;
    }
  }

  /**
   * 中断当前执行
   *
   * 调用后：
   * - 取消正在进行的 LLM 调用和工具执行
   * - 保留当前轮次中已完成的消息
   * - 清理不完整的消息（有 tool_calls 但缺少 tool 响应）
   */
  abort(): void {
    if (this.abortController) {
      logger.info('Agent execution aborted by user');
      this.abortController.abort();
    }
  }

  /**
   * 检查是否正在执行
   */
  isRunning(): boolean {
    return this.abortController !== null;
  }

  /**
   * 获取 Agent 名称
   */
  getName(): string {
    return this.config.name!;
  }

  /**
   * 获取工具管理器
   */
  getToolManager(): ToolManager {
    return this.toolManager;
  }

  /**
   * 获取上下文管理器
   */
  getContextManager(): ContextManager {
    return this.contextManager;
  }

  /**
   * 获取当前模型配置
   */
  getModelConfig(): { provider: string; model: string } {
    return {
      provider: this.config.provider,
      model: this.config.model,
    };
  }

  /**
   * 获取执行流管理器
   * 用于 CLI 层订阅执行状态更新
   */
  getExecutionStream(): ExecutionStreamManager {
    return this.executionStream;
  }

  /**
   * 加载历史消息到上下文
   * 用于恢复之前的会话状态
   *
   * @param messages - Core 格式的历史消息
   * @param options - 加载选项
   */
  loadHistory(messages: Message[], options?: HistoryLoadOptions): void {
    const opts: Required<HistoryLoadOptions> = {
      clearExisting: true,
      skipSystemPrompt: true,
      maxMessages: Infinity,
      ...options,
    };

    // 清空现有历史（保留系统提示词）
    if (opts.clearExisting) {
      this.contextManager.clear(ContextType.HISTORY);
      this.contextManager.clearCurrentTurn();
    }

    // 限制消息数量
    const messagesToLoad =
      opts.maxMessages !== Infinity ? messages.slice(-opts.maxMessages) : messages;

    // 过滤并加载消息
    const filteredMessages = opts.skipSystemPrompt
      ? messagesToLoad.filter((msg) => msg.role !== 'system')
      : messagesToLoad;

    // 加载到历史上下文
    this.contextManager.loadHistory(filteredMessages);
  }

  /**
   * 清空上下文（保留系统提示词）
   */
  clearContext(): void {
    this.contextManager.clear(ContextType.HISTORY);
    this.contextManager.clearCurrentTurn();
  }

  // ============ 统计相关 ============

  /**
   * 获取会话统计
   */
  getSessionStats(): SessionStats {
    return this.sessionStats;
  }

  /**
   * 设置模型定价（用于费用计算）
   */
  setModelPricing(pricing: ModelPricing): void {
    this.sessionStats.setPricing(pricing);
  }

  /**
   * 设置汇率
   */
  setExchangeRate(rate: number): void {
    this.sessionStats.setExchangeRate(rate);
  }

  /**
   * 获取当前 Token 使用情况
   * 从 ContextManager 实时计算
   */
  getTokenUsage(): { used: number; limit: number; percentage: number } {
    const usage = this.contextManager.getTokenUsage();
    return {
      used: usage.used,
      limit: usage.limit,
      percentage: usage.percentage,
    };
  }

  /**
   * 获取累计费用
   */
  getTotalCost(currency: 'USD' | 'CNY' = 'CNY'): number {
    return currency === 'USD'
      ? this.sessionStats.getTotalCostUSD()
      : this.sessionStats.getTotalCostCNY();
  }

  /**
   * 获取格式化的费用字符串
   */
  getFormattedCost(currency: 'USD' | 'CNY' = 'CNY'): string {
    return this.sessionStats.getFormattedCost(currency);
  }
}
