/**
 * AgentManager - Agent 注册和管理类
 * 
 * 职责：
 * 1. 注册内置和自定义 Agent 配置
 * 2. 创建 Agent 实例（工厂方法）
 * 3. 提供子代理查询（供 Task 工具使用）
 * 
 * 注意：模型配置由 ConfigService 管理，LLM 服务由 LLMServiceRegistry 提供
 */

import type { AgentConfig } from './config/types.js';
import { buildAgent } from './config/presets/build.js';
import { exploreAgent } from './config/presets/explore.js';
import { stewardAgent } from './config/presets/steward.js';
import { ToolManager } from '../tool/ToolManager.js';
import { logger } from '../../utils/logger.js';
import { Agent } from './Agent.js';

/**
 * 共享运行时依赖
 */
export interface SharedRuntime {
  toolManager: ToolManager;
}

/**
 * Agent 管理器
 */
export class AgentManager {
  private configs = new Map<string, AgentConfig>();
  private sharedRuntime: SharedRuntime;
  private _toolManagerInitialized = false;

  constructor() {
    // 创建共享运行时（ToolManager 延迟初始化，避免循环依赖）
    this.sharedRuntime = {
      toolManager: null as any, // 延迟初始化
    };

    // 注册内置预设
    this.register(buildAgent);
    this.register(exploreAgent);
    this.register(stewardAgent);

    logger.debug('AgentManager initialized', {
      registeredAgents: Array.from(this.configs.keys()),
    });
  }

  /**
   * 确保 ToolManager 已初始化
   * 延迟初始化避免循环依赖：AgentManager -> ToolManager -> TaskTool -> agentManager
   */
  private ensureToolManager(): void {
    if (!this._toolManagerInitialized) {
      this.sharedRuntime.toolManager = new ToolManager();
      this._toolManagerInitialized = true;
    }
  }

  /**
   * 注册 Agent 配置
   */
  register(config: AgentConfig): this {
    if (this.configs.has(config.name)) {
      logger.warn('Agent config overwritten', { name: config.name });
    }

    this.configs.set(config.name, config);

    logger.debug('Agent registered', {
      name: config.name,
      role: config.role,
      description: config.description,
    });

    return this;
  }

  /**
   * 获取 Agent 配置
   */
  get(name: string): AgentConfig | undefined {
    return this.configs.get(name);
  }

  /**
   * 获取共享运行时依赖
   */
  getSharedRuntime(): SharedRuntime {
    this.ensureToolManager();
    return this.sharedRuntime;
  }

  /**
   * 创建 Agent 实例（工厂方法）
   * @param name - Agent 名称（从注册表查找预设）
   * @param overrides - 可选的配置覆盖（优先级高于预设）
   */
  createAgent(name: string, overrides?: Partial<AgentConfig>): Agent {
    const config = this.configs.get(name);
    if (!config) {
      const available = Array.from(this.configs.keys()).join(', ');
      throw new Error(`Agent '${name}' not found. Available: ${available}`);
    }

    // 确保 ToolManager 已初始化
    this.ensureToolManager();

    // 合并配置：预设（副）+ 覆盖（主）
    const finalConfig: AgentConfig = {
      ...config,
      ...overrides,
    };

    return new Agent(finalConfig, this.sharedRuntime);
  }

  /**
   * 列出所有子代理（供 Task 工具使用）
   */
  listSubAgents(): AgentConfig[] {
    return Array.from(this.configs.values()).filter(
      (c) => c.role === 'subagent' || c.role === 'all'
    );
  }

  /**
   * 列出所有主代理（供 UI 切换使用）
   */
  listPrimaryAgents(): AgentConfig[] {
    return Array.from(this.configs.values())
      .filter((c) => c.role === 'primary' || c.role === 'all')
      .filter((c) => !c.hidden);
  }

  /**
   * 列出所有已注册的 Agent
   */
  listAll(): AgentConfig[] {
    return Array.from(this.configs.values());
  }
}

/**
 * 默认的全局 AgentManager 实例
 */
export const agentManager = new AgentManager();
