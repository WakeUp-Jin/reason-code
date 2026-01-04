import type { ModelInfo, TokenUsage, MessageMetadata, Currency } from '../context/store.js';

/**
 * 计算 token 使用成本
 * @param tokenUsage Token 使用情况
 * @param model 模型信息
 * @param currency 目标货币（默认 CNY）
 * @param exchangeRate 汇率（CNY to USD，默认 7.2）
 * @returns 成本信息（指定货币）
 */
export function calculateCost(
  tokenUsage: TokenUsage,
  model: ModelInfo,
  currency: Currency = 'CNY',
  exchangeRate: number = 7.2
): { inputCost: number; outputCost: number; totalCost: number } {
  if (!model.pricing) {
    return { inputCost: 0, outputCost: 0, totalCost: 0 };
  }

  // 模型定价是人民币（CNY per 1M tokens）
  let inputCost = (tokenUsage.inputTokens / 1_000_000) * model.pricing.input;
  let outputCost = (tokenUsage.outputTokens / 1_000_000) * model.pricing.output;

  // 如果用户选择美元，转换为美元
  if (currency === 'USD') {
    inputCost = inputCost / exchangeRate;
    outputCost = outputCost / exchangeRate;
  }

  const totalCost = inputCost + outputCost;

  return {
    inputCost,
    outputCost,
    totalCost,
  };
}

/**
 * 创建 assistant 消息的 metadata
 * @param tokenUsage Token 使用情况
 * @param model 模型信息
 * @param generationInfo 生成信息（可选）
 * @returns MessageMetadata
 */
export function createAssistantMetadata(
  tokenUsage: TokenUsage,
  model: ModelInfo,
  generationInfo?: {
    temperature?: number;
    maxTokens?: number;
    stopReason?: string;
    latency?: number;
  }
): MessageMetadata {
  const cost = calculateCost(tokenUsage, model);

  return {
    tokenUsage,
    model: model.id,
    cost,
    generationInfo,
  };
}

/**
 * 格式化 token 数量（添加千分位分隔符）
 * @param tokens Token 数量
 * @returns 格式化后的字符串
 */
export function formatTokens(tokens: number): string {
  return tokens.toLocaleString();
}

/**
 * 格式化成本（保留 4 位小数）
 * @param cost 成本
 * @param currency 货币类型（默认 CNY）
 * @returns 格式化后的字符串
 */
export function formatCost(cost: number, currency: Currency = 'CNY'): string {
  const symbol = currency === 'CNY' ? '¥' : '$';
  return `${symbol}${cost.toFixed(4)}`;
}

/**
 * 获取货币符号
 * @param currency 货币类型
 * @returns 货币符号
 */
export function getCurrencySymbol(currency: Currency): string {
  return currency === 'CNY' ? '¥' : '$';
}

/**
 * 计算百分比
 * @param current 当前 token 数
 * @param max 最大 token 数
 * @returns 百分比（0-100）
 */
export function calculatePercentage(current: number, max: number): number {
  return Math.min(100, Math.round((current / max) * 100));
}
