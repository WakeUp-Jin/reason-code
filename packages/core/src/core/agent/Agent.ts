/**
 * Agent 类
 * 独立实现，提供 CLI 友好的 API
 */

import { ContextManager, ContextType, Message } from '../context/index.js';
import { ToolManager } from '../tool/ToolManager.js';
import { ILLMService } from '../llm/types/index.js';
import { createLLMService } from '../llm/factory.js';
import { executeToolLoop } from '../llm/utils/executeToolLoop.js';
import { eventBus } from '../../evaluation/EventBus.js';
import { SIMPLE_AGENT_PROMPT } from '../promptManager/index.js';
import { ExecutionStreamManager } from '../execution/index.js';
import { ApprovalMode, ConfirmDetails, ConfirmOutcome } from '../tool/types.js';

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
 * Agent 运行选项
 */
export interface AgentRunOptions {
  /** 模型的 Token 限制（由 CLI 层传入） */
  modelLimit?: number;

  /** 工具确认回调（由 CLI 层提供） */
  onConfirmRequired?: (
    callId: string,
    toolName: string,
    details: ConfirmDetails
  ) => Promise<ConfirmOutcome>;

  /** 批准模式 */
  approvalMode?: ApprovalMode;
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
    this.contextManager.setSystemPrompt(this.config.systemPrompt!);

    this.initialized = true;
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

    // 重置事件收集器
    eventBus.reset();

    // 发射 Agent 调用事件
    eventBus.emit('agent:call', { agentName: this.config.name! });

    // 启动执行流
    this.executionStream.start();

    try {
      // 设置用户输入
      this.contextManager.setUserInput(userInput);

      // 执行工具循环
      const loopResult = await executeToolLoop(
        this.llmService,
        this.contextManager,
        this.toolManager,
        {
          maxLoops: this.config.maxLoops,
          agentName: this.config.name,
          executionStream: this.executionStream,
          model: this.config.model,
          modelLimit: options?.modelLimit,
          onConfirmRequired: options?.onConfirmRequired,
          approvalMode: options?.approvalMode,
        }
      );

      // 完成当前轮次（归档到历史）
      this.contextManager.finishTurn();

      // 完成执行流
      this.executionStream.complete();

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
    }
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
}
