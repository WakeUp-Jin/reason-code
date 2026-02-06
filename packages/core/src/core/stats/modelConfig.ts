/**
 * 各模型的 Token 限制
 * 键为模型名称，值为最大 Token 数
 */
export const TOKEN_LIMITS: Record<string, number> = {
  // DeepSeek 模型
  'deepseek-chat': 128_000,
  'deepseek-reasoner': 128_000,

  // OpenAI 模型
  'gpt-4o': 128_000,
  'gpt-4o-mini': 128_000,
  'gpt-4-turbo': 128_000,
  'gpt-4': 8_192,
  'gpt-3.5-turbo': 16_385,

  // Anthropic 模型
  'claude-3-5-sonnet': 200_000,
  'claude-3-opus': 200_000,
  'claude-3-sonnet': 200_000,
  'claude-3-haiku': 200_000,
  'claude-sonnet-4': 200_000,

  // Google 模型
  'gemini-2.0-flash': 1_048_576,
  'gemini-pro': 1_000_000,
  'gemini-1.5-pro': 1_000_000,
  'gemini-1.5-flash': 1_000_000,
};

/**
 * 默认 Token 限制（未知模型使用）
 */
export const DEFAULT_TOKEN_LIMIT = 64_000;

/**
 * 模型定价配置（每百万 Token，CNY）
 *
 * DeepSeek 定价说明：
 * - input: 缓存未命中的输入价格 (¥2.0/1M)
 * - output: 输出价格 (¥3.0/1M)
 * - cacheHit: 缓存命中的输入价格 (¥0.2/1M)
 */
export const MODEL_PRICING_CONFIG: Record<
  string,
  { input: number; output: number; cacheHit?: number }
> = {
  // DeepSeek 模型（CNY）- 支持缓存定价
  'deepseek-chat': { input: 2.0, output: 3.0, cacheHit: 0.2 },
  'deepseek-reasoner': { input: 2.0, output: 3.0, cacheHit: 0.2 },

  // OpenAI 模型（转换为 CNY，汇率约 7.2）
  'gpt-4o': { input: 18.0, output: 72.0 },
  'gpt-4o-mini': { input: 1.08, output: 4.32 },
  'gpt-4-turbo': { input: 72.0, output: 216.0 },

  // Anthropic 模型（转换为 CNY）
  'claude-3-5-sonnet': { input: 21.6, output: 108.0 },
  'claude-sonnet-4': { input: 21.6, output: 108.0 },
  'claude-3-opus': { input: 108.0, output: 540.0 },

  // Google 模型（转换为 CNY）
  'gemini-2.0-flash': { input: 0.54, output: 2.16 },
  'gemini-pro': { input: 3.6, output: 10.8 },
  'gemini-1.5-pro': { input: 9.0, output: 36.0 },
};

/**
 * 上下文管理阈值配置
 */
export const CONTEXT_THRESHOLDS = {
  /** 70% - 触发历史压缩 */
  COMPRESSION_TRIGGER: 0.7,

  /** 30% - 压缩后保留最近的历史比例 */
  COMPRESSION_PRESERVE: 0.3,

  /** 95% - 拒绝请求阈值 */
  OVERFLOW_WARNING: 0.95,

  /** 工具输出超过此 Token 数触发总结 */
  TOOL_OUTPUT_SUMMARY: 2000,

  /** 文件大小截断阈值（字符数） */
  MAX_FILE_SIZE: 100_000,

  /** 截断时保留的行数 */
  TRUNCATE_LINES: 1000,
} as const;
