/**
 * API Token 使用情况（单次 API 调用返回的数据）
 * 注意：与 ContextManager.TokenUsage 不同，这是 API 返回的原始数据
 */
export interface ApiTokenUsage {
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
   * 完整的 Agent 统计数据（对外接口）
   */
  export interface AgentStats {
    /** Token 统计 */
    tokens: {
      /** 估算值（用于上下文管理、压缩判断） */
      estimated: number;
      /** API 返回的精确值（用于显示） */
      actual: number;
      /** 本次输出的 token 数 */
      output: number;
      /** 累计总输入 token 数 */
      totalInput: number;
      /** 累计总输出 token 数 */
      totalOutput: number;
      /** 累计总 token 数 */
      total: number;
    };
    /** 上下文使用情况 */
    context: {
      /** 当前上下文 token 数 */
      used: number;
      /** 模型限制 */
      limit: number;
      /** 使用百分比 */
      percentage: number;
    };
    /** 费用统计 */
    cost: {
      /** 本次执行费用（CNY） */
      current: number;
      /** 累计费用（CNY） */
      total: number;
      /** 格式化字符串 */
      formatted: string;
    };
  }