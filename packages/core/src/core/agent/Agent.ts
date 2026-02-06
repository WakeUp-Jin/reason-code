/**
 * Agent 类
 * 统一的 Agent 执行器，支持主代理和子代理
 */

import { ContextManager, ContextType, Message } from '../context/index.js';
import { ToolManager } from '../tool/ToolManager.js';
import { ILLMService, LLMChatOptions } from '../llm/types/index.js';
import { llmServiceRegistry, ModelTier } from '../llm/index.js';
import { ExecutionEngine } from './execution/index.js';
import { eventBus } from '../../evaluation/EventBus.js';
import { buildSystemPrompt, type SystemPromptContext } from '../promptManager/index.js';
import { ExecutionStreamManager, MonitorWriter } from '../execution/index.js';
import { ApprovalMode, ConfirmDetails, ConfirmOutcome, InternalTool } from '../tool/types.js';
import { StatsManager, type ModelPricing, type AgentStats } from '../stats/index.js';
import { logger } from '../../utils/logger.js';
import { configService } from '../../config/index.js';
import type { AgentConfig } from './config/types.js';
import type { SharedRuntime } from './AgentManager.js';
import type { SessionCheckpoint } from '../session/types.js';

/**
 * Monitor 配置选项
 */
export interface MonitorOptions {
  /** 是否启用监控文件写入 */
  enabled: boolean;
  /** 会话 ID（用于文件命名） */
  sessionId: string;
  /** 项目路径 */
  projectPath?: string;
}

/**
 * Agent 初始化选项
 */
export interface AgentInitOptions {
  /** 直接传入的系统提示词（最高优先级） */
  systemPrompt?: string;
  /** 系统提示词上下文（由 CLI 传入的动态参数，用于构建器） */
  promptContext?: SystemPromptContext;
  /** Monitor 配置（启用后会写入监控文件供 Butler 读取） */
  monitor?: MonitorOptions;
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
  sessionId?: string;

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

  /** LLM 调用选项（透传到 llmService.complete，支持 onChunk 流式回调等） */
  llmOptions?: Partial<LLMChatOptions>;
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

  /** 统计管理器（Token 统计 + 费用计算） */
  private statsManager: StatsManager;

  /** 压缩完成回调 */
  private onCompressionComplete?: (event: CompressionCompleteEvent) => void;

  /** 中断控制器（用于取消执行） */
  private abortController: AbortController | null = null;

  /** 当前执行引擎（用于中断时清理） */
  private currentExecutor: ExecutionEngine | null = null;

  /** 系统提示词上下文（保存以供子代理使用） */
  private promptContext?: SystemPromptContext;

  /** MonitorWriter 实例（用于写入监控文件） */
  private monitorWriter?: MonitorWriter;
  /** MonitorWriter 事件订阅取消函数 */
  private monitorUnsubscribe?: () => void;
  /** 缓存的模型配置（供 getModelConfig() 同步返回） */
  private cachedModelConfig?: { provider: string; model: string };

  constructor(config: AgentConfig, runtime: SharedRuntime) {
    this.config = config;
    this.runtime = runtime;
    this.contextManager = new ContextManager();
    this.toolManager = runtime.toolManager;
    this.executionStream = new ExecutionStreamManager();
    this.statsManager = new StatsManager();
  }

  /**
   * 解析系统提示词
   * 优先级：传入 > 配置静态 > 配置构建器 > 无
   */
  private resolveSystemPrompt(options?: AgentInitOptions): string | undefined {
    // 1. 最高优先级：直接传入的系统提示词
    if (options?.systemPrompt) {
      logger.info('Using provided system prompt');
      return options.systemPrompt;
    }

    // 2. 配置中的静态提示词
    if (this.config.systemPrompt) {
      logger.info('Using config static system prompt');
      return this.config.systemPrompt;
    }

    // 3. 配置中的构建器 + promptContext
    if (this.config.systemPromptBuilder && options?.promptContext) {
      logger.info('Using config system prompt builder', {
        workingDirectory: options.promptContext.workingDirectory,
        modelName: options.promptContext.modelName,
      });
      return this.config.systemPromptBuilder(options.promptContext);
    }

    // 4. 无系统提示词
    logger.warn('No system prompt configured');
    return undefined;
  }

  /**
   * 过滤工具
   * 根据 Agent 模式和配置过滤可用工具
   */
  private filterTools(): InternalTool[] {
    const allTools = this.toolManager.getTools();
    const toolConfig = this.config.tools || {};

    // 1. 自动排除（防止递归）
    const autoExclude = this.config.role === 'subagent' ? ['task'] : [];

    // 2. 白名单模式（如果指定了 include）
    if (toolConfig.include) {
      const includeSet = new Set(toolConfig.include);
      return allTools.filter((t) => includeSet.has(t.name));
    }

    // 3. 黑名单模式（默认）
    const excludeSet = new Set([...autoExclude, ...(toolConfig.exclude || [])]);

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
    // 从配置读取模型层级，默认 PRIMARY
    const tier = this.config.modelTier || ModelTier.PRIMARY;

    // 使用 LLMServiceRegistry 获取指定层级的模型服务
    this.llmService = await llmServiceRegistry.getService(tier);

    // 获取当前模型配置（用于日志、提示词和缓存）
    const modelConfig = await configService.getModelConfig(tier);
    const model = modelConfig.model;

    // 缓存模型配置（供 getModelConfig() 同步返回）
    this.cachedModelConfig = {
      provider: modelConfig.provider,
      model: modelConfig.model,
    };

    // 解析并设置系统提示词（优先级：传入 > 配置静态 > 配置构建器 > 无）
    const systemPrompt = this.resolveSystemPrompt(options);
    if (systemPrompt) {
      this.contextManager.setSystemPrompt(systemPrompt);
    }

    // 保存 promptContext（供后续使用，如子代理）
    if (options?.promptContext) {
      this.promptContext = options.promptContext;
    }

    // 初始化 MonitorWriter（如果启用）
    if (options?.monitor?.enabled) {
      this.initMonitorWriter(options.monitor, model);
    }

    this.initialized = true;
  }

  /**
   * 初始化 MonitorWriter
   * 在 Core 层订阅执行流事件，写入监控文件
   */
  private initMonitorWriter(monitorConfig: MonitorOptions, model: string): void {
    // 清理之前的 MonitorWriter
    this.shutdownMonitorWriter();

    // 创建新的 MonitorWriter
    this.monitorWriter = new MonitorWriter({
      sessionId: monitorConfig.sessionId,
      projectPath: monitorConfig.projectPath || process.cwd(),
      model,
      agentMode: this.config.name,
    });
    this.monitorWriter.init();

    // 订阅执行流事件
    this.monitorUnsubscribe = this.executionStream.on((event) => {
      this.monitorWriter?.handleEvent(event);
    });

    logger.info('MonitorWriter initialized in Agent', {
      sessionId: monitorConfig.sessionId,
      filePath: this.monitorWriter.getFilePath(),
    });
  }

  /**
   * 关闭 MonitorWriter
   * 标记为 idle 状态并取消事件订阅
   */
  shutdownMonitorWriter(): void {
    if (this.monitorWriter) {
      this.monitorWriter.markAsIdle();
      this.monitorWriter = undefined;
    }
    if (this.monitorUnsubscribe) {
      this.monitorUnsubscribe();
      this.monitorUnsubscribe = undefined;
    }
  }

  /**
   * 获取 MonitorWriter 实例
   */
  getMonitorWriter(): MonitorWriter | undefined {
    return this.monitorWriter;
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
      this.statsManager.restore(checkpoint.stats);
    } else {
      // 无检查点：加载完整历史
      this.loadHistory(history);
    }
  }

  /**
   * 切换模型
   * 更新配置并重新获取 LLM 服务，保留上下文
   *
   * 当 /model 指令切换模型（如 deepseek-chat → deepseek-reasoner）时：
   * 1. 更新内存：重新获取 LLM 服务实例
   * 2. 写入配置文件：持久化到 model.primary（或对应层级），下次启动生效
   * 3. 更新缓存：刷新 cachedModelConfig
   */
  async setModel(provider: string, model: string): Promise<void> {
    // 获取当前使用的模型层级（默认 PRIMARY）
    const tier = this.config.modelTier || ModelTier.PRIMARY;

    // 1. 写入配置文件（持久化）
    await configService.updateModel(tier, { provider, model });

    // 2. 使 LLM 服务缓存失效
    llmServiceRegistry.invalidate(tier);

    // 3. 重新获取 LLM 服务（内存更新）
    this.llmService = await llmServiceRegistry.getService(tier);

    // 4. 更新缓存的 modelConfig（供 getModelConfig() 同步返回）
    this.cachedModelConfig = { provider, model };
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
    const costBeforeRun = this.statsManager.getTotalCostCNY();

    // 发射 Agent 调用事件
    eventBus.emit('agent:call', { agentName: this.config.name });

    // 使用外部传入的 executionStream（如果有），否则使用内部的
    const executionStream = options?.executionStream || this.executionStream;

    // 将 executionStream 注入到 ContextManager（用于发送压缩事件）
    this.contextManager.setExecutionStream(executionStream);

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

      // 获取缓存的模型配置
      const modelConfig = this.getModelConfig();

      // 创建执行引擎
      const engine = new ExecutionEngine(
        this.llmService,
        this.contextManager,
        isolatedToolManager,
        {
          maxLoops: this.config.execution?.maxLoops || 100,
          agentName: this.config.name,
          executionStream: executionStream,
          model: modelConfig.model,
          modelLimit: options?.modelLimit,
          sessionId: options?.sessionId,
          onConfirmRequired: options?.onConfirmRequired,
          approvalMode: options?.approvalMode,
          abortSignal: this.abortController.signal,
          statsManager: this.statsManager,
          workingDirectory: this.promptContext?.workingDirectory,
          llmOptions: options?.llmOptions,
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
      const costCNY = this.statsManager.getTotalCostCNY() - costBeforeRun;

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
   * 返回缓存的配置（在 init() 时从 ConfigService 获取并缓存）
   */
  getModelConfig(): { provider: string; model: string } {
    // 返回缓存的配置，如果未初始化则返回默认值
    return (
      this.cachedModelConfig || {
        provider: 'deepseek',
        model: 'deepseek-chat',
      }
    );
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

  // ============ 压缩相关 ============

  /**
   * 手动触发压缩（供 CLI /compact 命令调用）
   * 绕过阈值检查，立即执行压缩
   */
  async compress(): Promise<{
    compressed: boolean;
    originalTokens?: number;
    compressedTokens?: number;
    originalCount?: number;
    compressedCount?: number;
    savedPercentage?: number;
    retainedFiles?: string[];
  }> {
    const tokenUsage = this.contextManager.getTokenUsage();

    // 发送压缩开始事件
    this.executionStream.startCompression(tokenUsage.formatted);

    // 执行压缩（绕过阈值检查）
    const result = await this.contextManager.forceCompress();

    if (result.compressed) {
      const retainedFiles = this.contextManager.extractRetainedFiles();
      const savedPercentage = Math.round(
        (1 - result.compressedTokens / result.originalTokens) * 100
      );

      // 发送压缩完成事件
      this.executionStream.completeCompression({
        originalTokens: result.originalTokens,
        compressedTokens: result.compressedTokens,
        originalCount: result.originalCount,
        compressedCount: result.compressedCount,
        savedPercentage,
        retainedFiles,
      });

      logger.info('手动压缩完成', {
        originalTokens: result.originalTokens,
        compressedTokens: result.compressedTokens,
        savedPercentage,
        retainedFiles: retainedFiles.length,
      });

      return {
        compressed: true,
        originalTokens: result.originalTokens,
        compressedTokens: result.compressedTokens,
        originalCount: result.originalCount,
        compressedCount: result.compressedCount,
        savedPercentage,
        retainedFiles,
      };
    }

    logger.info('压缩跳过：历史消息太短或无需压缩');
    return { compressed: false };
  }

  // ============ 统计相关 ============

  /**
   * 获取统计管理器
   */
  getStatsManager(): StatsManager {
    return this.statsManager;
  }

  /**
   * 获取完整统计数据（核心对外接口）
   * 包含 Token 统计、上下文使用情况、费用统计
   */
  getStats(): AgentStats {
    return this.statsManager.getStats(this.contextManager);
  }

  /**
   * 设置模型定价（用于费用计算）
   */
  setModelPricing(pricing: ModelPricing): void {
    this.statsManager.setPricing(pricing);
  }

  /**
   * 设置汇率
   */
  setExchangeRate(rate: number): void {
    this.statsManager.setExchangeRate(rate);
  }

  /**
   * 设置模型（自动加载定价和限制）
   */
  setStatsModel(modelId: string): void {
    this.statsManager.setModel(modelId);
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
    return this.statsManager.getTotalCost(currency);
  }

  /**
   * 获取格式化的费用字符串
   */
  getFormattedCost(currency: 'USD' | 'CNY' = 'CNY'): string {
    return this.statsManager.getFormattedCost(currency);
  }
}
