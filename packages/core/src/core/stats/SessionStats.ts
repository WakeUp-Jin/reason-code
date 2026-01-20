/**
 * 会话统计模块
 * 管理会话级别的费用累计
 *
 * 注意：Token 数量由 ContextManager 实时计算，不在此处累加
 * 此模块只负责费用的累加和持久化
 * 
 * 货币策略：
 * - 计算、存储、内存全部使用 CNY
 * - 显示层根据用户配置决定显示 CNY 或 USD（通过汇率转换）
 */

import { logger } from '../../utils/logger.js';

/**
 * Token 使用情况（单次 API 调用）
 */
export interface TokenUsage {
  /** 输入 token 数（prompt_tokens，用于显示） */
  inputTokens: number;
  /** 输出 token 数（completion_tokens） */
  outputTokens: number;
  /** 缓存命中的 token 数（DeepSeek: prompt_cache_hit_tokens） */
  cacheHitTokens?: number;
  /** 缓存未命中的 token 数（DeepSeek: prompt_cache_miss_tokens） */
  cacheMissTokens?: number;
  /** 推理 token 数（已包含在 outputTokens 中，用于显示） */
  reasoningTokens?: number;
}

/**
 * 模型定价（每百万 token，单位 CNY）
 */
export interface ModelPricing {
  /** 输入价格（每百万 token，CNY） */
  inputPricePerMillion: number;
  /** 输出价格（每百万 token，CNY） */
  outputPricePerMillion: number;
  /** 缓存命中价格（每百万 token，CNY，可选） */
  cacheHitPricePerMillion?: number;
}

/**
 * 检查点统计数据（用于持久化，单位 CNY）
 */
export interface CheckpointStats {
  /** 累计费用（CNY） */
  totalCost: number;
}

/**
 * 会话统计类
 * 负责累计费用，支持从检查点恢复
 * 
 * 全部使用 CNY：计算、存储、内存
 */
export class SessionStats {
  /** 累计费用（CNY） */
  private totalCost: number = 0;

  /** 当前模型定价（CNY） */
  private currentPricing: ModelPricing | null = null;

  /** USD 到 CNY 的汇率（仅用于显示层转换） */
  private exchangeRate: number = 7.2;

  constructor() {
    logger.debug('SessionStats initialized');
  }

  /**
   * 从检查点恢复统计数据（CNY）
   */
  restore(stats: CheckpointStats): void {
    this.totalCost = stats.totalCost;
    logger.debug('SessionStats restored from checkpoint', { totalCost: this.totalCost });
  }

  /**
   * 设置当前模型定价（CNY）
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
   * 更新统计（每次 API 调用后）
   */
  update(usage: TokenUsage): void {
    if (!this.currentPricing) {
      logger.warn('No pricing set, cannot calculate cost');
      return;
    }

    const cost = this.calculateCost(usage, this.currentPricing);
    this.totalCost += cost;

    logger.debug('SessionStats updated', {
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
  private calculateCost(usage: TokenUsage, pricing: ModelPricing): number {
    let inputCost: number;
    
    // 如果有缓存命中/未命中的详细信息，使用精确计算
    if (usage.cacheHitTokens !== undefined && usage.cacheMissTokens !== undefined) {
      // 缓存命中部分使用缓存价格（如果没有配置缓存价格，则免费）
      const cacheHitCost = (usage.cacheHitTokens / 1_000_000) * (pricing.cacheHitPricePerMillion ?? 0);
      // 缓存未命中部分使用正常输入价格
      const cacheMissCost = (usage.cacheMissTokens / 1_000_000) * pricing.inputPricePerMillion;
      inputCost = cacheHitCost + cacheMissCost;
    } else {
      // 兜底：没有缓存信息时，使用 inputTokens 作为全部未命中计算
      inputCost = (usage.inputTokens / 1_000_000) * pricing.inputPricePerMillion;
    }
    
    // 输出费用
    const outputCost = (usage.outputTokens / 1_000_000) * pricing.outputPricePerMillion;

    return inputCost + outputCost;
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
   * 导出为检查点格式（CNY）
   */
  toCheckpoint(): CheckpointStats {
    return {
      totalCost: this.totalCost,
    };
  }

  /**
   * 重置统计
   */
  reset(): void {
    this.totalCost = 0;
    logger.debug('SessionStats reset');
  }

  /**
   * 手动添加费用（CNY，用于压缩等特殊操作）
   */
  addCost(cost: number): void {
    this.totalCost += cost;
  }
  
  /**
   * 从历史费用初始化（用于会话恢复）
   * @param totalCostCNY 历史累计费用（CNY）
   */
  initFromHistory(totalCostCNY: number): void {
    this.totalCost = totalCostCNY;
    logger.debug('SessionStats initialized from history', { totalCostCNY });
  }
}

