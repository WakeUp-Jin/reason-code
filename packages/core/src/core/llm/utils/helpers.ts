import { LLMConfig, ToolCall } from '../types/index.js';
import { logger } from '../../../utils/logger.js';

/**
 * 提取 API Key
 *
 * 优先级（从高到低）：
 * 1. 用户传递的 config.apiKey（必须，由 ConfigService 提供）
 * 2. 无需 API Key 的提供商返回占位符
 *
 * 注意：新架构中，API Key 应该由 ConfigService 在调用 createLLMService 前解析好
 *
 * @param config - LLM 配置
 * @returns API Key 字符串
 */
export function extractApiKey(config: LLMConfig): string {
  const provider = config.provider.toLowerCase();

  // 无需 API Key 的提供商
  if (['ollama', 'lmstudio', 'aws'].includes(provider)) {
    return 'not-required';
  }

  // 使用传入的 API Key（应该由 ConfigService 提供）
  if (config.apiKey) {
    return config.apiKey;
  }

  // 没有 API Key，抛出错误
  throw new Error(
    `API key not found for provider "${provider}". ` +
      `Please configure your API key in ~/.reason-code/config.json`
  );
}

/**
 * 获取提供商的 Base URL
 *
 * 优先级（从高到低）：
 * 1. 用户传递的 config.baseURL（显式配置）
 * 2. 环境变量中的配置（通过 provider 自动查找）
 * 3. 硬编码的默认 Base URL
 *
 * @param config - LLM 配置
 * @returns Base URL 字符串
 *
 */
export function getBaseURL(config: LLMConfig): string {
  // 1. 优先使用用户传递的 baseURL
  if (config.baseURL) {
    return config.baseURL;
  }

  const provider = config.provider.toLowerCase();

  // 3. 硬编码的默认 Base URL（兜底）
  const defaultBaseURLs: Record<string, string> = {
    deepseek: 'https://api.deepseek.com',
    openai: 'https://api.openai.com/v1',
    anthropic: 'https://api.anthropic.com',
    siliconflow: 'https://api.siliconflow.cn/v1',
    qwen: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    openrouter: 'https://openrouter.ai/api/v1',
    ollama: 'http://localhost:11434/v1',
    lmstudio: 'http://localhost:1234/v1',
  };

  const baseURL = defaultBaseURLs[provider];
  if (!baseURL) {
    throw new Error(
      `No base URL found for provider "${provider}". ` +
        `Please pass baseURL in config: { provider: '${provider}', model: '...', baseURL: 'https://...' }`
    );
  }

  return baseURL;
}

/** 获取默认上下文窗口大小 */
export function getDefaultContextWindow(provider: string, model?: string): number {
  const defaults: Record<string, Record<string, number>> = {
    openai: {
      'gpt-4o': 128000,
      'gpt-4': 8192,
      'gpt-3.5-turbo': 16385,
      default: 8192,
    },
    anthropic: { default: 200000 },
    gemini: { default: 1000000 },
    deepseek: { default: 128000 },
    ollama: { default: 8192 },
  };

  const providerDefaults = defaults[provider.toLowerCase()] || {
    default: 8192,
  };
  return providerDefaults[model || 'default'] || providerDefaults.default;
}

/** 睡眠函数 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 深度解析参数：递归检查字符串类型的参数值，尝试 JSON 解析
 * 用于处理 Claude 等模型返回嵌套 JSON 字符串的情况
 *
 * 例如：{ bgmRequests: "[{...}]" } → { bgmRequests: [{...}] }
 */
export function deepParseArgs(args: any): any {
  if (typeof args === 'string') {
    // 尝试解析看起来像 JSON 数组或对象的字符串
    const trimmed = args.trim();
    if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
      // 第一次尝试：直接解析
      try {
        const parsed = JSON.parse(trimmed);
        logger.debug('deepParseArgs: First attempt succeeded');
        return deepParseArgs(parsed);
      } catch (e) {
        logger.debug('deepParseArgs: First attempt failed', { error: (e as Error).message });

        // 第二次尝试：处理 Claude 模型返回的双重转义问题
        // 将 \\n 转换为 \n，\\\" 转换为 \"
        try {
          const unescaped = trimmed.replace(/\\\\n/g, '\\n').replace(/\\\\"/g, '\\"');
          logger.debug('deepParseArgs: Trying with unescaped string');
          const parsed = JSON.parse(unescaped);
          logger.debug('deepParseArgs: Second attempt succeeded');
          return deepParseArgs(parsed);
        } catch (e2) {
          logger.debug('deepParseArgs: Second attempt also failed', { error: (e2 as Error).message });
          // 都失败了，返回原始字符串
          return args;
        }
      }
    }
    return args;
  }

  if (Array.isArray(args)) {
    return args.map(deepParseArgs);
  }

  if (args && typeof args === 'object') {
    const result: any = {};
    for (const [key, value] of Object.entries(args)) {
      result[key] = deepParseArgs(value);
    }
    return result;
  }

  return args;
}


/**
 * 规范化 tool_calls - 统一不同 LLM 提供商的输出格式
 *
 * 解决的问题：
 * - Claude: 无参数时不返回 arguments 字段
 * - Gemini: 始终返回 arguments
 * - 其他模型: 格式可能各有差异
 *
 * @param raw - LLM 返回的原始 tool_calls
 * @returns 规范化后的 ToolCall 数组，或 undefined
 */
export function normalizeToolCalls(raw?: any[]): ToolCall[] | undefined {
  if (!raw?.length) return undefined;

  return raw.map((tc) => ({
    id: tc.id,
    type: 'function' as const,
    function: {
      name: tc.function?.name ?? '',
      arguments: tc.function?.arguments ?? '{}',
    },
  }));
}