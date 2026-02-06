/**
 * LLM 服务注册表
 * 管理各层级 LLM 服务实例的创建和缓存
 */

import { configService, ModelTier, ResolvedModelConfig } from '../../config/index.js';
import { createLLMService } from './factory.js';
import type { ILLMService } from './types/index.js';

/**
 * LLM 服务注册表（全局单例）
 *
 * 职责：
 * 1. 按需创建 LLM 服务实例
 * 2. 实例缓存，相同配置复用
 * 3. 配置变更时失效缓存
 */
class LLMServiceRegistry {
  /** 服务实例缓存 */
  private services: Map<ModelTier, ILLMService> = new Map();

  /** 配置哈希缓存（用于检测配置变更） */
  private configHashes: Map<ModelTier, string> = new Map();

  /**
   * 获取指定层级的 LLM 服务
   * - 首次调用：从 ConfigService 读取配置，创建服务实例
   * - 后续调用：返回缓存的实例（如果配置未变）
   *
   * @param tier - 模型层级
   * @returns LLM 服务实例
   */
  async getService(tier: ModelTier): Promise<ILLMService> {
    const config = await configService.getModelConfig(tier);
    const hash = this.hashConfig(config);

    // 检查缓存是否有效
    if (this.services.has(tier) && this.configHashes.get(tier) === hash) {
      return this.services.get(tier)!;
    }

    // 创建新实例
    const service = await createLLMService({
      provider: config.provider,
      model: config.model,
      apiKey: config.apiKey,
      baseURL: config.baseUrl,
    });

    this.services.set(tier, service);
    this.configHashes.set(tier, hash);
    return service;
  }

  /**
   * 使指定层级的缓存失效
   * 配置更新后调用此方法，下次 getService 会重新创建实例
   *
   * @param tier - 要失效的层级，不传则失效所有层级
   */
  invalidate(tier?: ModelTier): void {
    if (tier) {
      this.services.delete(tier);
      this.configHashes.delete(tier);
    } else {
      this.services.clear();
      this.configHashes.clear();
    }
  }

  /**
   * 清除所有缓存
   */
  clear(): void {
    this.services.clear();
    this.configHashes.clear();
  }

  /**
   * 检查指定层级是否有缓存的服务实例
   *
   * @param tier - 模型层级
   * @returns 是否有缓存
   */
  has(tier: ModelTier): boolean {
    return this.services.has(tier);
  }

  /**
   * 生成配置哈希（用于检测配置变更）
   */
  private hashConfig(config: ResolvedModelConfig): string {
    return `${config.provider}:${config.model}:${config.baseUrl || ''}:${config.apiKey?.slice(0, 8) || ''}`;
  }
}

// 导出全局单例
export const llmServiceRegistry = new LLMServiceRegistry();

// 导出类（用于测试）
export { LLMServiceRegistry };
