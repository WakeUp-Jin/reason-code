/**
 * Agent 类
 * 独立实现，提供 CLI 友好的 API
 */

import { ContextManager, ContextType } from '../context/index.js';
import { ToolManager } from '../tool/ToolManager.js';
import { ILLMService } from '../llm/types/index.js';
import { createLLMService } from '../llm/factory.js';
import { executeToolLoop } from '../llm/utils/executeToolLoop.js';
import { eventBus } from '../../evaluation/EventBus.js';
import { SIMPLE_AGENT_PROMPT } from '../promptManager/index.js';

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
 * const result = await agent.run('你好');
 * ```
 */
export class Agent {
  private config: AgentConfig;
  private llmService: ILLMService | null = null;
  private contextManager: ContextManager;
  private toolManager: ToolManager;
  private initialized = false;

  constructor(config: AgentConfig) {
    this.config = {
      name: config.name ?? 'agent',
      systemPrompt: config.systemPrompt ?? SIMPLE_AGENT_PROMPT,
      maxLoops: config.maxLoops ?? 10,
      ...config,
    };
    this.contextManager = new ContextManager();
    this.toolManager = new ToolManager();
  }

  /**
   * 初始化 Agent
   * 创建 LLM 服务、初始化上下文管理器
   */
  async init(): Promise<void> {
    // 创建 LLM 服务
    this.llmService = await createLLMService({
      provider: this.config.provider,
      model: this.config.model,
      apiKey: this.config.apiKey,
      baseURL: this.config.baseURL,
    });

    // 初始化上下文管理器
    await this.contextManager.init();

    // 设置系统提示词
    this.contextManager.add(this.config.systemPrompt!, ContextType.SYSTEM_PROMPT);

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
   * @returns Agent 执行结果
   */
  async run(userInput: string): Promise<AgentResult> {
    if (!this.initialized || !this.llmService) {
      throw new Error('Agent not initialized. Call init() first.');
    }

    // 重置事件收集器
    eventBus.reset();

    // 发射 Agent 调用事件
    eventBus.emit('agent:call', { agentName: this.config.name! });

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
        }
      );

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
}
