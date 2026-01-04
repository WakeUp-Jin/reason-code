/**
 * 上下文检查器
 * 负责检查上下文是否溢出、是否需要压缩
 */

import { TokenEstimator } from './tokenEstimator.js';
import type { Message, ContextCheckResult } from '../types.js';

/**
 * 上下文阈值配置（由 CLI 层传入或使用默认值）
 */
export interface ContextThresholds {
  /** 触发历史压缩的阈值 (0-1)，默认 0.7 */
  compressionTrigger: number;
  /** 压缩后保留最近的历史比例 (0-1)，默认 0.3 */
  compressionPreserve: number;
  /** 拒绝请求的阈值 (0-1)，默认 0.95 */
  overflowWarning: number;
  /** 工具输出超过此 Token 数触发总结，默认 2000 */
  toolOutputSummary: number;
}

/**
 * 默认阈值配置
 */
export const DEFAULT_THRESHOLDS: ContextThresholds = {
  compressionTrigger: 0.7,
  compressionPreserve: 0.3,
  overflowWarning: 0.95,
  toolOutputSummary: 2000,
};

/**
 * 上下文检查器类
 */
export class ContextChecker {
  /** 模型 Token 限制 */
  private modelLimit: number;
  /** 阈值配置 */
  private thresholds: ContextThresholds;
  /** 上次请求的实际 Token 数（从 API 响应获取） */
  private lastPromptTokens: number;

  /**
   * 创建上下文检查器
   *
   * @param modelLimit - 模型的 Token 限制
   * @param thresholds - 阈值配置（可选，使用默认值）
   */
  constructor(modelLimit: number, thresholds?: Partial<ContextThresholds>) {
    this.modelLimit = modelLimit;
    this.thresholds = { ...DEFAULT_THRESHOLDS, ...thresholds };
    this.lastPromptTokens = 0;
  }

  /**
   * 检查是否可以发送请求（95% 溢出检查）
   *
   * @param messages - 当前消息列表
   * @returns 检查结果
   */
  checkOverflow(messages: Message[]): ContextCheckResult {
    const currentTokens = TokenEstimator.estimateMessages(messages);
    const usagePercent = (currentTokens / this.modelLimit) * 100;

    // 95% 溢出检查
    if (usagePercent >= this.thresholds.overflowWarning * 100) {
      return {
        passed: false,
        currentTokens,
        modelLimit: this.modelLimit,
        usagePercent,
        error: `上下文已使用 ${usagePercent.toFixed(1)}%，超过 ${this.thresholds.overflowWarning * 100}% 阈值，请压缩历史或开始新会话`,
      };
    }

    return {
      passed: true,
      currentTokens,
      modelLimit: this.modelLimit,
      usagePercent,
    };
  }

  /**
   * 检查是否需要压缩（70% 检查）
   *
   * @param messages - 当前消息列表
   * @returns 是否需要压缩
   */
  checkCompression(messages: Message[]): boolean {
    const estimatedTokens = TokenEstimator.estimateMessages(messages);
    const usagePercentage = estimatedTokens / this.modelLimit;
    return usagePercentage >= this.thresholds.compressionTrigger;
  }

  /**
   * 更新 Token 计数（从 API 响应获取实际值）
   *
   * @param promptTokens - 实际使用的 prompt token 数
   */
  updateTokenCount(promptTokens: number): void {
    this.lastPromptTokens = promptTokens;
  }

  /**
   * 获取上次请求的 Token 数
   */
  getLastPromptTokens(): number {
    return this.lastPromptTokens;
  }

  /**
   * 获取模型 Token 限制
   */
  getModelLimit(): number {
    return this.modelLimit;
  }

  /**
   * 获取阈值配置
   */
  getThresholds(): ContextThresholds {
    return { ...this.thresholds };
  }

  /**
   * 获取当前使用情况
   *
   * @param messages - 当前消息列表
   * @returns 使用情况对象
   */
  getUsage(messages: Message[]): {
    used: number;
    limit: number;
    percentage: number;
    formatted: string;
  } {
    const used = TokenEstimator.estimateMessages(messages);
    const percentage = (used / this.modelLimit) * 100;
    return {
      used,
      limit: this.modelLimit,
      percentage,
      formatted: `${TokenEstimator.formatTokens(used)} / ${TokenEstimator.formatTokens(this.modelLimit)} (${percentage.toFixed(1)}%)`,
    };
  }
}
