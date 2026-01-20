/**
 * Agent 类
 * 统一的 Agent 执行器，支持主代理和子代理
 */

import { ContextManager, ContextType, Message } from '../context/index.js';
import { ToolManager } from '../tool/ToolManager.js';
import { ILLMService } from '../llm/types/index.js';
import { createLLMService } from '../llm/factory.js';
import { ExecutionEngine } from './execution/index.js';
import { eventBus } from '../../evaluation/EventBus.js';
import { buildSystemPrompt, type SystemPromptContext } from '../promptManager/index.js';
import { ExecutionStreamManager } from '../execution/index.js';
import { ApprovalMode, ConfirmDetails, ConfirmOutcome, InternalTool } from '../tool/types.js';
import { SessionStats, type ModelPricing } from '../stats/index.js';
import { logger } from '../../utils/logger.js';
import type { AgentConfig } from './config/types.js';
import type { SharedRuntime } from './AgentManager.js';
import type { SessionCheckpoint } from '../session/types.js';

/**
 * Agent 初始化选项
 */
export interface AgentInitOptions {
  /** 系统提示词上下文（由 CLI 传入的动态参数） */
  promptContext?: SystemPromptContext;
}

// 重新导出 SystemPromptContext 供外部使用
export type { SystemPromptContext };

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

// SessionCheckpoint 从 session/types.ts 导入
export type { SessionCheckpoint };

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

  /** 外部 ExecutionStream（用于子代理） */
  executionStream?: ExecutionStreamManager;
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
  private runtime: SharedRuntime;
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

  /** 当前执行引擎（用于中断时清理） */
  private currentExecutor: ExecutionEngine | null = null;

  /** 系统提示词上下文（保存以供子代理使用） */
  private promptContext?: SystemPromptContext;

  constructor(config: AgentConfig, runtime: SharedRuntime) {
    this.config = config;
    this.runtime = runtime;
    this.contextManager = new ContextManager();
    this.toolManager = runtime.toolManager;
    this.executionStream = new ExecutionStreamManager();
    this.sessionStats = new SessionStats();
  }

  /**
   * 过滤工具
   * 根据 Agent 模式和配置过滤可用工具
   */
  private filterTools(): InternalTool[] {
    const allTools = this.toolManager.getTools();
    const toolConfig = this.config.tools || {};

    // 1. 自动排除（防止递归）
    const autoExclude = this.config.mode === 'subagent' ? ['task'] : [];

    // 2. 白名单模式（如果指定了 include）
    if (toolConfig.include) {
      const includeSet = new Set(toolConfig.include);
      return allTools.filter((t) => includeSet.has(t.name));
    }

    // 3. 黑名单模式（默认）
    const excludeSet = new Set([
      ...autoExclude,
      ...(toolConfig.exclude || []),
    ]);

    return allTools.filter((t) => {
      // 排除列表中的工具
      if (excludeSet.has(t.name)) return false;

      // 细粒度控制（向后兼容）
      if (toolConfig[t.name] === false) return false;

      return true;
    });
  }

  /**
   * 初始化 Agent
   * 创建 LLM 服务、设置系统提示词
   *
   * @param options - 初始化选项
   *   - promptContext: 系统提示词上下文（推荐），由 CLI 传入动态参数
   *   - 如果不提供 promptContext，将使用 config.systemPrompt 或默认提示词
   */
  async init(options?: AgentInitOptions): Promise<void> {
    // 使用 config.model 或默认值
    const provider = this.config.model?.provider || 'deepseek';
    const model = this.config.model?.model || 'deepseek-chat';

    // 创建 LLM 服务
    this.llmService = await createLLMService({
      provider,
      model,
      apiKey: this.runtime.apiKey,
      baseURL: this.runtime.baseURL,
    });

    // 构建系统提示词
    let systemPrompt: string;

    if (options?.promptContext) {
      // 使用新的构建器（推荐方式）
      systemPrompt = buildSystemPrompt(options.promptContext);
      // 保存 promptContext 供后续使用（如子代理）
      this.promptContext = options.promptContext;
      logger.info('System prompt built from context', {
        workingDirectory: options.promptContext.workingDirectory,
        modelName: options.promptContext.modelName,
      });
    } else if (this.config.systemPrompt) {
      // 使用配置中的自定义提示词
      systemPrompt = this.config.systemPrompt;
    } else {
      // 没有提供 promptContext 也没有自定义提示词，使用默认构建
      const defaultContext = {
        workingDirectory: process.cwd(),
        modelName: model,
      };
      systemPrompt = buildSystemPrompt(defaultContext);
      // 保存默认 promptContext
      this.promptContext = defaultContext;
      logger.warn('No promptContext provided, using default system prompt');
    }

    this.contextManager.setSystemPrompt(systemPrompt);
    this.initialized = true;
  }

  /**
   * 从检查点初始化 Agent
   * 用于恢复之前的会话状态
   *
   * @param history - 完整历史消息（用于没有检查点时）
   * @param checkpoint - 检查点数据（如有）
   * @param options - 初始化选项（包含 promptContext）
   */
  async initWithCheckpoint(
    history: Message[],
    checkpoint?: SessionCheckpoint,
    options?: AgentInitOptions
  ): Promise<void> {
    // 先执行基本初始化
    await this.init(options);

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
    // 更新配置
    if (!this.config.model) {
      this.config.model = { provider, model };
    } else {
      this.config.model.provider = provider;
      this.config.model.model = model;
    }

    // 更新运行时 apiKey（如果提供）
    if (apiKey) {
      this.runtime.apiKey = apiKey;
    }

    // 重新创建 LLM 服务（保留上下文）
    this.llmService = await createLLMService({
      provider,
      model,
      apiKey: this.runtime.apiKey,
      baseURL: this.runtime.baseURL,
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
    eventBus.emit('agent:call', { agentName: this.config.name });

    // 使用外部传入的 executionStream（如果有），否则使用内部的
    const executionStream = options?.executionStream || this.executionStream;

    // 启动执行流
    executionStream.start();

    try {
      // 设置用户输入
      this.contextManager.setUserInput(userInput);

      // 获取过滤后的工具
      const filteredTools = this.filterTools();

      // 创建临时 ToolManager（只包含过滤后的工具）
      const isolatedToolManager = new ToolManager();
      isolatedToolManager.clear();
      filteredTools.forEach((tool) => isolatedToolManager.register(tool));

      // 创建执行引擎
      const engine = new ExecutionEngine(
        this.llmService,
        this.contextManager,
        isolatedToolManager,
        {
          maxLoops: this.config.execution?.maxLoops || 100,
          agentName: this.config.name,
          executionStream: executionStream,
          model: this.config.model?.model || 'deepseek-chat',
          modelLimit: options?.modelLimit,
          sessionId: options?.sessionId,
          onConfirmRequired: options?.onConfirmRequired,
          approvalMode: options?.approvalMode,
          abortSignal: this.abortController.signal,
          sessionStats: this.sessionStats,
          workingDirectory: this.promptContext?.workingDirectory,
        }
      );

      // 保存当前执行引擎引用
      this.currentExecutor = engine;

      const loopResult = await engine.execute();

      // 清理执行器引用
      this.currentExecutor = null;

      // 检查是否被中断
      if (loopResult.cancelled) {
        // 中断时不归档到历史，保留 currentTurn 中已完成的消息
        // sanitize 已在 executor 中调用
        executionStream.cancel('用户取消执行');

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
      executionStream.complete(costCNY);

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
      executionStream.error(errorMessage);

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
      provider: this.config.model?.provider || 'deepseek',
      model: this.config.model?.model || 'deepseek-chat',
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
   * 获取系统提示词上下文
   * 用于子代理继承父代理的工作目录
   */
  getPromptContext(): SystemPromptContext | undefined {
    return this.promptContext;
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
