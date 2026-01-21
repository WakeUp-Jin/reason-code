/**
 * 配置服务
 * 统一管理配置文件的读写和缓存
 */

import { join } from 'path';
import { homedir } from 'os';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import {
  ModelTier,
  type AppConfig,
  type ModelTierConfig,
  type ProviderConfig,
  type ResolvedModelConfig,
  type DeepPartial,
} from './types.js';
import { deepMerge, resolveConfigEnvVars } from './utils.js';

/** 配置文件目录 */
const CONFIG_DIR = join(homedir(), '.reason-code');

/** 配置文件路径 */
const CONFIG_PATH = join(CONFIG_DIR, 'config.json');

/** 默认配置 */
const DEFAULT_CONFIG: AppConfig = {
  model: {
    primary: { provider: 'deepseek', model: 'deepseek-chat' },
    secondary: { provider: 'deepseek', model: 'deepseek-chat' },
    tertiary: { provider: 'deepseek', model: 'deepseek-chat' },
  },
  providers: {
    deepseek: {
      apiKey: '',
      baseUrl: 'https://api.deepseek.com',
      timeout: 60000,
    },
    openai: {
      apiKey: '',
      baseUrl: 'https://api.openai.com/v1',
      timeout: 60000,
    },
    openrouter: {
      apiKey: '',
      baseUrl: 'https://openrouter.ai/api/v1',
      timeout: 60000,
    },
  },
  agent: {
    current: 'default',
  },
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

/**
 * 配置服务（全局单例）
 */
class ConfigService {
  private cache: AppConfig | null = null;
  private configPath: string;

  constructor(configPath: string = CONFIG_PATH) {
    this.configPath = configPath;
  }

  /**
   * 获取完整配置（带缓存）
   */
  async getConfig(): Promise<AppConfig> {
    if (this.cache) {
      return this.cache;
    }
    return this.reload();
  }

  /**
   * 更新配置（深度合并 + 写入文件 + 更新缓存）
   */
  async updateConfig(updates: DeepPartial<AppConfig>): Promise<void> {
    const currentConfig = await this.getConfig();
    const newConfig = deepMerge(currentConfig, updates);

    await this.writeConfig(newConfig);
    this.cache = newConfig;
  }

  /**
   * 强制重新加载配置
   */
  async reload(): Promise<AppConfig> {
    try {
      if (!existsSync(CONFIG_DIR)) {
        await mkdir(CONFIG_DIR, { recursive: true });
      }

      if (!existsSync(this.configPath)) {
        await this.writeConfig(DEFAULT_CONFIG);
        this.cache = DEFAULT_CONFIG;
        return DEFAULT_CONFIG;
      }

      const content = await readFile(this.configPath, 'utf-8');
      const rawConfig = JSON.parse(content);

      // 合并默认配置，确保所有字段都存在
      const config = resolveConfigEnvVars(deepMerge(DEFAULT_CONFIG, rawConfig));

      this.cache = config;
      return config;
    } catch (error) {
      console.error('Failed to load config:', error);
      this.cache = DEFAULT_CONFIG;
      return DEFAULT_CONFIG;
    }
  }

  /**
   * 清除缓存
   */
  clearCache(): void {
    this.cache = null;
  }

  /**
   * 获取指定层级的模型配置（已解析，包含 apiKey）
   */
  async getModelConfig(tier: ModelTier): Promise<ResolvedModelConfig> {
    const config = await this.getConfig();
    let tierConfig = config.model[tier];

    // Fallback 策略
    if (!tierConfig?.provider) {
      tierConfig =
        tier === ModelTier.TERTIARY
          ? config.model.secondary || config.model.primary
          : config.model.primary;
    }

    const providerConfig = config.providers[tierConfig.provider] || {};

    return {
      provider: tierConfig.provider,
      model: tierConfig.model,
      apiKey: providerConfig.apiKey || '',
      baseUrl: providerConfig.baseUrl,
      timeout: providerConfig.timeout,
    };
  }

  /**
   * 更新指定层级的模型
   */
  async updateModel(tier: ModelTier, modelConfig: Partial<ModelTierConfig>): Promise<void> {
    await this.updateConfig({
      model: { [tier]: modelConfig },
    } as DeepPartial<AppConfig>);
  }

  /**
   * 获取 Provider 配置
   */
  async getProvider(provider: string): Promise<ProviderConfig | undefined> {
    const config = await this.getConfig();
    return config.providers[provider];
  }

  /**
   * 更新 Provider 配置
   */
  async updateProvider(provider: string, providerConfig: Partial<ProviderConfig>): Promise<void> {
    await this.updateConfig({
      providers: { [provider]: providerConfig },
    } as DeepPartial<AppConfig>);
  }

  /**
   * 获取 UI 配置
   */
  async getUIConfig(): Promise<AppConfig['ui']> {
    const config = await this.getConfig();
    return config.ui;
  }

  /**
   * 更新 UI 配置
   */
  async updateUIConfig(updates: Partial<AppConfig['ui']>): Promise<void> {
    await this.updateConfig({ ui: updates });
  }

  /**
   * 获取 Session 配置
   */
  async getSessionConfig(): Promise<AppConfig['session']> {
    const config = await this.getConfig();
    return config.session;
  }

  /**
   * 更新 Session 配置
   */
  async updateSessionConfig(updates: Partial<AppConfig['session']>): Promise<void> {
    await this.updateConfig({ session: updates });
  }

  /**
   * 获取 Agent 配置
   */
  async getAgentConfig(): Promise<AppConfig['agent']> {
    const config = await this.getConfig();
    return config.agent;
  }

  /**
   * 更新 Agent 配置
   */
  async updateAgentConfig(updates: Partial<AppConfig['agent']>): Promise<void> {
    await this.updateConfig({ agent: updates });
  }

  private async writeConfig(config: AppConfig): Promise<void> {
    if (!existsSync(CONFIG_DIR)) {
      await mkdir(CONFIG_DIR, { recursive: true });
    }
    await writeFile(this.configPath, JSON.stringify(config, null, 2), 'utf-8');
  }
}

export const configService = new ConfigService();
export { ConfigService };
