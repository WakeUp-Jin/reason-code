import type { ModelInfo, TokenUsage, MessageMetadata } from '../context/store.js';

/**
 * 计算 token 使用成本
 * @param tokenUsage Token 使用情况
 * @param model 模型信息
 * @returns 成本信息（USD）
 */
export function calculateCost(
  tokenUsage: TokenUsage,
  model: ModelInfo
): { inputCost: number; outputCost: number; totalCost: number } {
  if (!model.pricing) {
    return { inputCost: 0, outputCost: 0, totalCost: 0 };
  }

  // 计算成本（pricing 是 per 1M tokens）
  const inputCost = (tokenUsage.inputTokens / 1_000_000) * model.pricing.input;
  const outputCost = (tokenUsage.outputTokens / 1_000_000) * model.pricing.output;
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
 * @param cost 成本（USD）
 * @returns 格式化后的字符串
 */
export function formatCost(cost: number): string {
  return `$${cost.toFixed(4)}`;
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
