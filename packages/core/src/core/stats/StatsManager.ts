/**
 * 统计管理器
 * 统一管理 Token 统计、费用计算、模型定价和限制
 *
 * 功能：
 * - 模型 Token 限制配置
 * - 模型定价配置（CNY）
 * - Token 统计（估算值 + API 精确值）
 * - 费用计算与累加
 * - 检查点保存/恢复
 *
 * 货币策略：
 * - 计算、存储、内存全部使用 CNY
 * - 显示层根据用户配置决定显示 CNY 或 USD（通过汇率转换）
 */

import { logger } from '../../utils/logger.js';
import type { ContextManager } from '../context/ContextManager.js';
import { TOKEN_LIMITS, DEFAULT_TOKEN_LIMIT, MODEL_PRICING_CONFIG } from './modelConfig.js';
import type { ModelPricing, ApiTokenUsage, AgentStats, CheckpointStats } from './type.js';
import { getModelTokenLimit, getModelPricing } from './utils.js';

/**
 * 统计管理器
 * 负责 Token 统计、费用计算和累加，支持从检查点恢复
 *
 * 全部使用 CNY：计算、存储、内存
 */
export class StatsManager {
  /** 累计费用（CNY） */
  private totalCost: number = 0;

  /** 本次执行费用（CNY） */
  private lastCost: number = 0;

  /** 当前模型定价（CNY） */
  private currentPricing: ModelPricing | null = null;

  /** 当前模型 Token 限制 */
  private modelLimit: number = DEFAULT_TOKEN_LIMIT;

  /** USD 到 CNY 的汇率（仅用于显示层转换） */
  private exchangeRate: number = 7.2;

  /** 上次 API 返回的 Token 数据 */
  private lastApiTokens = { input: 0, output: 0 };

  /** 累计 Token 数据 */
  private totalTokens = { input: 0, output: 0 };

  constructor() {
    logger.debug('StatsManager initialized');
  }

  /**
   * 设置当前模型（自动加载定价和限制）
   */
  setModel(modelId: string): void {
    // 设置 Token 限制
    this.modelLimit = getModelTokenLimit(modelId);

    // 设置定价
    const pricing = getModelPricing(modelId);
    if (pricing) {
      this.currentPricing = pricing;
    } else {
      logger.warn(`No pricing found for model: ${modelId}`);
    }

    logger.debug('StatsManager model set', {
      modelId,
      modelLimit: this.modelLimit,
      hasPricing: !!pricing,
    });
  }

  /**
   * 设置当前模型定价（用于外部传入定价）
   */
  setPricing(pricing: ModelPricing): void {
    this.currentPricing = pricing;
  }

  /**
   * 设置汇率（仅用于显示层 CNY → USD 转换）
   */
  setExchangeRate(rate: number): void {
    this.exchangeRate = rate;
  }

  /**
   * 设置模型 Token 限制
   */
  setModelLimit(limit: number): void {
    this.modelLimit = limit;
  }

  /**
   * 更新统计（每次 API 调用后）
   */
  update(usage: ApiTokenUsage): void {
    // 更新 API Token 数据
    this.lastApiTokens = {
      input: usage.inputTokens,
      output: usage.outputTokens,
    };

    // 累计 Token 数据
    this.totalTokens.input += usage.inputTokens;
    this.totalTokens.output += usage.outputTokens;

    // 计算费用
    if (!this.currentPricing) {
      logger.warn('No pricing set, cannot calculate cost');
      this.lastCost = 0;
      return;
    }

    const cost = this.calculateCost(usage);
    this.lastCost = cost;
    this.totalCost += cost;

    logger.debug('StatsManager updated', {
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      cost,
      totalCost: this.totalCost,
    });
  }

  /**
   * 计算单次调用费用（CNY）
   *
   * DeepSeek 定价规则：
   * - 缓存命中: prompt_cache_hit_tokens × ¥0.2 / 1M
   * - 缓存未命中: prompt_cache_miss_tokens × ¥2.0 / 1M
   * - 输出: completion_tokens × ¥3.0 / 1M
   *
   * 注意: prompt_tokens = prompt_cache_hit_tokens + prompt_cache_miss_tokens
   */
  private calculateCost(usage: ApiTokenUsage): number {
    if (!this.currentPricing) {
      return 0;
    }

    let inputCost: number;

    // 如果有缓存命中/未命中的详细信息，使用精确计算
    if (usage.cacheHitTokens !== undefined && usage.cacheMissTokens !== undefined) {
      // 缓存命中部分使用缓存价格（如果没有配置缓存价格，则免费）
      const cacheHitCost =
        (usage.cacheHitTokens / 1_000_000) * (this.currentPricing.cacheHitPricePerMillion ?? 0);
      // 缓存未命中部分使用正常输入价格
      const cacheMissCost =
        (usage.cacheMissTokens / 1_000_000) * this.currentPricing.inputPricePerMillion;
      inputCost = cacheHitCost + cacheMissCost;
    } else {
      // 兜底：没有缓存信息时，使用 inputTokens 作为全部未命中计算
      inputCost = (usage.inputTokens / 1_000_000) * this.currentPricing.inputPricePerMillion;
    }

    // 输出费用
    const outputCost = (usage.outputTokens / 1_000_000) * this.currentPricing.outputPricePerMillion;

    return inputCost + outputCost;
  }

  /**
   * 获取完整统计数据（核心对外接口）
   */
  getStats(contextManager?: ContextManager): AgentStats {
    // 获取估算的 Token 数（从 ContextManager）
    let estimated = 0;
    if (contextManager) {
      const usage = contextManager.getTokenUsage();
      estimated = usage.used;
    }

    // 上下文使用情况
    const contextUsed = this.lastApiTokens.input || estimated;
    const percentage = Math.round((contextUsed / this.modelLimit) * 100);

    return {
      tokens: {
        estimated,
        actual: this.lastApiTokens.input,
        output: this.lastApiTokens.output,
        totalInput: this.totalTokens.input,
        totalOutput: this.totalTokens.output,
        total: this.totalTokens.input + this.totalTokens.output,
      },
      context: {
        used: contextUsed,
        limit: this.modelLimit,
        percentage,
      },
      cost: {
        current: this.lastCost,
        total: this.totalCost,
        formatted: this.getFormattedCost('CNY'),
      },
    };
  }

  /**
   * 获取累计费用（CNY）
   */
  getTotalCostCNY(): number {
    return this.totalCost;
  }

  /**
   * 获取累计费用（USD，用于显示层）
   */
  getTotalCostUSD(): number {
    return this.totalCost / this.exchangeRate;
  }

  /**
   * 获取累计费用
   */
  getTotalCost(currency: 'USD' | 'CNY' = 'CNY'): number {
    return currency === 'USD' ? this.getTotalCostUSD() : this.getTotalCostCNY();
  }

  /**
   * 获取格式化的费用字符串
   * @param currency 显示货币，默认 CNY
   */
  getFormattedCost(currency: 'USD' | 'CNY' = 'CNY'): string {
    if (currency === 'USD') {
      return `$${this.getTotalCostUSD().toFixed(4)}`;
    }
    return `¥${this.totalCost.toFixed(4)}`;
  }

  /**
   * 获取模型 Token 限制
   */
  getModelLimit(): number {
    return this.modelLimit;
  }

  /**
   * 导出为检查点格式（CNY）
   */
  toCheckpoint(): CheckpointStats {
    return {
      totalCost: this.totalCost,
    };
  }

  /**
   * 从检查点恢复统计数据（CNY）
   */
  restore(stats: CheckpointStats): void {
    this.totalCost = stats.totalCost;
    logger.debug('StatsManager restored from checkpoint', { totalCost: this.totalCost });
  }

  /**
   * 从历史费用初始化（用于会话恢复）
   * @param totalCostCNY 历史累计费用（CNY）
   */
  initFromHistory(totalCostCNY: number): void {
    this.totalCost = totalCostCNY;
    logger.debug('StatsManager initialized from history', { totalCostCNY });
  }

  /**
   * 手动添加费用（CNY，用于压缩等特殊操作）
   */
  addCost(cost: number): void {
    this.totalCost += cost;
  }

  /**
   * 重置统计
   */
  reset(): void {
    this.totalCost = 0;
    this.lastCost = 0;
    this.lastApiTokens = { input: 0, output: 0 };
    logger.debug('StatsManager reset');
  }
}
