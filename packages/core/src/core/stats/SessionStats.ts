/**
 * 会话统计模块
 * 管理会话级别的费用累计
 *
 * 注意：Token 数量由 ContextManager 实时计算，不在此处累加
 * 此模块只负责费用的累加和持久化
 */

import { logger } from '../../utils/logger.js';

/**
 * Token 使用情况（单次 API 调用）
 */
export interface TokenUsage {
  /** 输入 token 数 */
  inputTokens: number;
  /** 输出 token 数 */
  outputTokens: number;
  /** 缓存命中的 token 数（可选） */
  cacheHitTokens?: number;
}

/**
 * 模型定价（每百万 token）
 */
export interface ModelPricing {
  /** 输入价格（每百万 token） */
  inputPricePerMillion: number;
  /** 输出价格（每百万 token） */
  outputPricePerMillion: number;
  /** 缓存命中价格（每百万 token，可选） */
  cacheHitPricePerMillion?: number;
  /** 货币单位 */
  currency: 'USD' | 'CNY';
}

/**
 * 检查点统计数据（用于持久化）
 */
export interface CheckpointStats {
  /** 累计费用（USD） */
  totalCost: number;
}

/**
 * 会话统计类
 * 负责累计费用，支持从检查点恢复
 */
export class SessionStats {
  /** 累计费用（USD） */
  private totalCost: number = 0;

  /** 当前模型定价 */
  private currentPricing: ModelPricing | null = null;

  /** USD 到 CNY 的汇率 */
  private exchangeRate: number = 7.2;

  constructor() {
    logger.debug('SessionStats initialized');
  }

  /**
   * 从检查点恢复统计数据
   */
  restore(stats: CheckpointStats): void {
    this.totalCost = stats.totalCost;
    logger.debug('SessionStats restored from checkpoint', { totalCost: this.totalCost });
  }

  /**
   * 设置当前模型定价
   */
  setPricing(pricing: ModelPricing): void {
    this.currentPricing = pricing;
  }

  /**
   * 设置汇率
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
   * 计算单次调用费用
   */
  private calculateCost(usage: TokenUsage, pricing: ModelPricing): number {
    const inputCost = (usage.inputTokens / 1_000_000) * pricing.inputPricePerMillion;
    const outputCost = (usage.outputTokens / 1_000_000) * pricing.outputPricePerMillion;

    let cacheHitCost = 0;
    if (usage.cacheHitTokens && pricing.cacheHitPricePerMillion) {
      cacheHitCost = (usage.cacheHitTokens / 1_000_000) * pricing.cacheHitPricePerMillion;
    }

    let totalCost = inputCost + outputCost + cacheHitCost;

    // 如果定价是 CNY，转换为 USD 存储
    if (pricing.currency === 'CNY') {
      totalCost = totalCost / this.exchangeRate;
    }

    return totalCost;
  }

  /**
   * 获取累计费用（USD）
   */
  getTotalCostUSD(): number {
    return this.totalCost;
  }

  /**
   * 获取累计费用（CNY）
   */
  getTotalCostCNY(): number {
    return this.totalCost * this.exchangeRate;
  }

  /**
   * 获取格式化的费用字符串
   */
  getFormattedCost(currency: 'USD' | 'CNY' = 'CNY'): string {
    if (currency === 'USD') {
      return `$${this.totalCost.toFixed(4)}`;
    }
    return `¥${this.getTotalCostCNY().toFixed(4)}`;
  }

  /**
   * 导出为检查点格式
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
   * 手动添加费用（用于压缩等特殊操作）
   */
  addCost(cost: number, currency: 'USD' | 'CNY' = 'USD'): void {
    if (currency === 'CNY') {
      this.totalCost += cost / this.exchangeRate;
    } else {
      this.totalCost += cost;
    }
  }
}

