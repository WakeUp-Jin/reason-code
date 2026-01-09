/**
 * Token 限制配置
 * 定义各模型的 Token 限制和上下文管理阈值
 */

/**
 * 各模型的 Token 限制
 * 键为模型名称，值为最大 Token 数
 */
export const TOKEN_LIMITS: Record<string, number> = {
  // DeepSeek 模型
  'deepseek-chat': 64_000,
  'deepseek-reasoner': 64_000,

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

