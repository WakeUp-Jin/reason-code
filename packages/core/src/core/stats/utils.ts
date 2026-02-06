
import { TOKEN_LIMITS, DEFAULT_TOKEN_LIMIT, MODEL_PRICING_CONFIG } from './modelConfig.js';
import type { ModelPricing } from './type.js';

/**
 * 获取模型的 Token 限制
 *
 * @param model - 模型名称
 * @returns Token 限制数
 */
export function getModelTokenLimit(model: string): number {
    // 尝试精确匹配
    if (TOKEN_LIMITS[model]) {
      return TOKEN_LIMITS[model];
    }
  
    // 尝试模糊匹配（处理带版本号的模型名）
    const normalizedModel = model.toLowerCase();
    for (const [key, value] of Object.entries(TOKEN_LIMITS)) {
      if (normalizedModel.includes(key.toLowerCase())) {
        return value;
      }
    }
  
    // 返回默认值
    return DEFAULT_TOKEN_LIMIT;
  }
  
  /**
   * 获取模型定价
   *
   * @param model - 模型名称
   * @returns 定价配置，如果未找到返回 null
   */
  export function getModelPricing(model: string): ModelPricing | null {
    // 尝试精确匹配
    const pricing = MODEL_PRICING_CONFIG[model];
    if (pricing) {
      return {
        inputPricePerMillion: pricing.input,
        outputPricePerMillion: pricing.output,
        cacheHitPricePerMillion: pricing.cacheHit,
      };
    }
  
    // 尝试模糊匹配
    const normalizedModel = model.toLowerCase();
    for (const [key, value] of Object.entries(MODEL_PRICING_CONFIG)) {
      if (normalizedModel.includes(key.toLowerCase())) {
        return {
          inputPricePerMillion: value.input,
          outputPricePerMillion: value.output,
          cacheHitPricePerMillion: value.cacheHit,
        };
      }
    }
  
    return null;
  }