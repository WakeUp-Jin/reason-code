/**
 * CLI 配置模块
 * 
 * 使用 Core 的 ConfigService 作为底层实现
 * 提供 CLI 特定的类型别名和兼容层
 */

// 从 Core 重新导出
export { 
  configService,
  ConfigService,
  ModelTier,
} from '@reason-cli/core';

// 模型列表加载器
export { loadModelsFromConfig, type ModelInfo } from './modelLoader.js';

export type {
  AppConfig,
  ModelConfig,
  ModelTierConfig,
  ProviderConfig,
  ResolvedModelConfig,
  UIConfig,
  SessionConfig,
  AgentAppConfig,
  DeepPartial,
} from '@reason-cli/core';

// CLI 特定的类型别名（向后兼容）
export type { AppConfig as ReasonCliConfig } from '@reason-cli/core';
export type { DeepPartial as PartialConfig } from '@reason-cli/core';

// 兼容层：保持旧的 configManager 接口
import { configService } from '@reason-cli/core';
import type { AppConfig, DeepPartial } from '@reason-cli/core';

/**
 * 配置管理器兼容层
 * 将旧的 configManager API 映射到新的 configService
 */
class ConfigManagerCompat {
  /**
   * 加载配置
   * @deprecated 使用 configService.getConfig() 代替
   */
  async loadConfig(): Promise<AppConfig> {
    return configService.getConfig();
  }

  /**
   * 获取配置（同步版本，用于启动时）
   * 注意：首次调用前需要先调用 loadConfig()
   * @deprecated 使用 configService.getConfig() 代替
   */
  getConfig(): AppConfig {
    // 这是一个同步方法，但 configService 是异步的
    // 我们假设在调用此方法前已经调用过 loadConfig()
    // 返回默认配置作为 fallback
    return {
      model: {
        primary: { provider: 'deepseek', model: 'deepseek-chat' },
        secondary: { provider: 'deepseek', model: 'deepseek-chat' },
        tertiary: { provider: 'deepseek', model: 'deepseek-chat' },
      },
      providers: {},
      agent: { current: 'default' },
      ui: {
        theme: 'kanagawa',
        mode: 'dark',
        currency: 'CNY',
        exchangeRate: 7.2,
        approvalMode: 'default',
      },
      session: {
        autoSave: true,
        saveDebounce: 500,
      },
    };
  }

  /**
   * 更新配置
   * @deprecated 使用 configService.updateConfig() 代替
   */
  async updateConfig(updates: DeepPartial<AppConfig>): Promise<void> {
    return configService.updateConfig(updates);
  }

  /**
   * 保存配置
   * @deprecated configService.updateConfig() 会自动保存
   */
  async saveConfig(): Promise<void> {
    // ConfigService 的 updateConfig 会自动保存
    // 这里不需要额外操作
  }

  /**
   * 重置配置
   */
  async resetConfig(): Promise<void> {
    await configService.reload();
  }
}

/**
 * @deprecated 请直接使用 configService
 */
export const configManager = new ConfigManagerCompat();
