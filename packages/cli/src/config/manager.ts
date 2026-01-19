/**
 * 配置管理器
 * 使用 Bun 原生 API 进行文件操作
 */

import { mkdir } from 'fs/promises';
import { dirname, join } from 'path';
import { homedir } from 'os';
import { logger } from '../util/logger.js';
import { configLogger } from '../util/logUtils.js';
import type { ReasonCliConfig, PartialConfig } from './schema.js';
import { safeValidateConfig } from './schema.js';
import { DEFAULT_CONFIG, resolveConfigEnvVars, deepMerge } from './defaults.js';

/** 存储根目录 */
const STORAGE_DIR = join(homedir(), '.reason-code');

/** 配置文件路径 */
const CONFIG_FILE = join(STORAGE_DIR, 'config.json');

/**
 * 配置管理器
 */
export class ConfigManager {
  private config: ReasonCliConfig;

  constructor() {
    this.config = DEFAULT_CONFIG;
  }

  /**
   * 加载配置文件
   * 如果配置文件不存在，自动创建默认配置文件
   * @returns 加载后的配置
   */
  async loadConfig(): Promise<ReasonCliConfig> {
    const file = Bun.file(CONFIG_FILE);

    // 如果配置文件不存在，创建默认配置文件
    const exists = await file.exists();
    if (!exists) {
      await this.createDefaultConfig();
    }

    try {
      // 读取配置文件（重新获取 file 引用，因为可能刚创建）
      const rawConfig = await Bun.file(CONFIG_FILE).json();

      // 合并默认配置
      const mergedConfig = deepMerge(DEFAULT_CONFIG, rawConfig);

      // 解析环境变量
      const resolvedConfig = resolveConfigEnvVars(mergedConfig);

      // Zod 验证
      const result = safeValidateConfig(resolvedConfig);

      if (!result.success) {
        logger.error('Config validation failed, using default config', {
          error: result.error,
        });
        this.config = DEFAULT_CONFIG;
        return this.config;
      }

      this.config = result.data!;
      configLogger.load();
      return this.config;
    } catch (error) {
      logger.error('Failed to load config file, using default config', { error });
      this.config = DEFAULT_CONFIG;
      return this.config;
    }
  }

  /**
   * 创建默认配置文件
   */
  private async createDefaultConfig(): Promise<void> {
    try {
      // 确保目录存在
      const configDir = dirname(CONFIG_FILE);
      await mkdir(configDir, { recursive: true });

      // 写入默认配置（保留环境变量引用格式）
      await Bun.write(CONFIG_FILE, JSON.stringify(DEFAULT_CONFIG, null, 2));
    } catch (error) {
      logger.error('Failed to create default config file', { error });
    }
  }

  /**
   * 保存配置文件
   * 智能合并策略：
   * - session, ui, model, agent: 使用内存中的最新值（程序会修改）
   * - providers: 完全使用磁盘文件中的值（只由用户手动管理）
   */
  async saveConfig(): Promise<void> {
    try {
      let configToSave: ReasonCliConfig;
      const file = Bun.file(CONFIG_FILE);

      // 如果配置文件已存在，智能合并
      const exists = await file.exists();
      if (exists) {
        const diskConfig = (await file.json()) as ReasonCliConfig;

        // 合并配置：
        // - providers 使用磁盘上的值（完全以文件为准）
        // - 其他字段使用内存中的最新值
        configToSave = {
          ...diskConfig, // 以磁盘配置为基础
          session: this.config.session, // 覆盖 session（程序会修改）
          ui: this.config.ui, // 覆盖 ui（程序会修改）
          model: this.config.model, // 覆盖 model（程序会修改）
          providers: diskConfig.providers, // 保留磁盘上的 providers（完全不改）
        };
      } else {
        // 配置文件不存在，使用默认配置
        configToSave = DEFAULT_CONFIG;
      }

      // 写入文件
      await Bun.write(CONFIG_FILE, JSON.stringify(configToSave, null, 2));
    } catch (error) {
      logger.error('Failed to save config file', { error });
    }
  }

  /**
   * 更新配置（部分更新）
   * @param updates 要更新的配置项
   */
  async updateConfig(updates: PartialConfig): Promise<void> {
    this.config = deepMerge(this.config, updates);
    await this.saveConfig();
  }

  /**
   * 获取当前配置
   */
  getConfig(): ReasonCliConfig {
    return this.config;
  }

  /**
   * 重置为默认配置
   */
  async resetConfig(): Promise<void> {
    this.config = DEFAULT_CONFIG;
    await this.saveConfig();
  }
}

// 导出单例实例
export const configManager = new ConfigManager();
