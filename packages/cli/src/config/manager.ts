import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { CONFIG_FILE } from '../util/storage.js';
import { logger } from '../util/logger.js';
import type { ReasonCliConfig, PartialConfig } from './schema.js';
import { safeValidateConfig } from './schema.js';
import { DEFAULT_CONFIG, resolveConfigEnvVars, deepMerge } from './defaults.js';

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
  loadConfig(): ReasonCliConfig {
    // 如果配置文件不存在，创建默认配置文件
    if (!existsSync(CONFIG_FILE)) {
      logger.info('Config file not found, creating default config');
      this.createDefaultConfig();
    }

    try {
      // 读取配置文件
      const content = readFileSync(CONFIG_FILE, 'utf-8');
      const rawConfig = JSON.parse(content);

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
      logger.info('Config loaded successfully');
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
  private createDefaultConfig(): void {
    try {
      // 确保目录存在
      const configDir = dirname(CONFIG_FILE);
      if (!existsSync(configDir)) {
        mkdirSync(configDir, { recursive: true });
      }

      // 写入默认配置（保留环境变量引用格式）
      writeFileSync(CONFIG_FILE, JSON.stringify(DEFAULT_CONFIG, null, 2), 'utf-8');
      logger.info('Default config file created at ' + CONFIG_FILE);
    } catch (error) {
      logger.error('Failed to create default config file', { error });
    }
  }

  /**
   * 保存配置文件
   */
  saveConfig(): void {
    try {
      // 移除环境变量的实际值，保留引用格式
      const configToSave = this.stripEnvValues(this.config);

      // 写入文件
      writeFileSync(CONFIG_FILE, JSON.stringify(configToSave, null, 2), 'utf-8');
      logger.info('Config saved successfully');
    } catch (error) {
      logger.error('Failed to save config file', { error });
    }
  }

  /**
   * 更新配置（部分更新）
   * @param updates 要更新的配置项
   */
  updateConfig(updates: PartialConfig): void {
    this.config = deepMerge(this.config, updates);
    this.saveConfig();
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
  resetConfig(): void {
    this.config = DEFAULT_CONFIG;
    this.saveConfig();
  }

  /**
   * 移除配置中的环境变量实际值，保留引用格式
   * 例如：将 "sk-ant-xxx" 转换回 "${ANTHROPIC_API_KEY}"
   */
  private stripEnvValues(config: ReasonCliConfig): ReasonCliConfig {
    const result = JSON.parse(JSON.stringify(config)) as ReasonCliConfig;

    // 处理 providers 中的 API keys
    for (const providerName in result.providers) {
      const provider = result.providers[providerName];
      if (provider && provider.apiKey) {
        // 如果 API key 不是环境变量引用格式，转换为引用
        if (!provider.apiKey.startsWith('${')) {
          const envVarName = `${providerName.toUpperCase()}_API_KEY`;
          provider.apiKey = `\${${envVarName}}`;
        }
      }
    }

    return result;
  }
}

// 导出单例实例
export const configManager = new ConfigManager();
