import type OpenAI from 'openai';
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

/**
 * 消费流式响应，累积成与非流式一致的 ChatCompletion 结构
 *
 * 设计理念：
 * - 文本内容：累积 + 实时回调（用于 TTS 等场景）
 * - tool_calls：仅累积，不回调（需要完整 JSON 才能执行）
 * - 返回值：与非流式 API 一致的结构，后续解析逻辑零改动
 *
 * @param stream - OpenAI 流式响应（AsyncIterable）
 * @param onChunk - 文本回调函数
 * @returns 与非流式 API 一致的 ChatCompletion 结构
 */
export async function consumeStream(
  stream: AsyncIterable<OpenAI.ChatCompletionChunk>,
  onChunk: (text: string) => void
): Promise<OpenAI.ChatCompletion> {
  let content = '';
  const toolCalls: OpenAI.ChatCompletionMessageToolCall[] = [];
  let finishReason: string = '';
  let usage: OpenAI.CompletionUsage | undefined = undefined;
  let reasoningContent = '';

  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta;

    // 文本内容：累积 + 回调
    if (delta?.content) {
      content += delta.content;
      onChunk(delta.content);
    }

    // reasoning_content（DeepSeek Reasoner 专用）：仅累积
    if ((delta as any)?.reasoning_content) {
      reasoningContent += (delta as any).reasoning_content;
    }

    // tool_calls：仅累积（需要完整 JSON 才能执行）
    if (delta?.tool_calls) {
      accumulateToolCalls(toolCalls, delta.tool_calls);
    }

    // 元数据
    if (chunk.choices[0]?.finish_reason) {
      finishReason = chunk.choices[0].finish_reason;
    }
    if (chunk.usage) {
      usage = chunk.usage as OpenAI.CompletionUsage;
    }
  }

  // 构建与非流式 API 一致的结构
  const message: any = {
    role: 'assistant' as const,
    content,
  };

  if (toolCalls.length > 0) {
    message.tool_calls = toolCalls;
  }

  if (reasoningContent) {
    message.reasoning_content = reasoningContent;
  }

  return {
    id: 'stream',
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: '',
    choices: [
      {
        index: 0,
        message,
        finish_reason: finishReason as any,
      },
    ],
    usage,
  } as OpenAI.ChatCompletion;
}

/**
 * 累积流式 tool_calls delta
 *
 * OpenAI 流式 tool_calls 格式：
 * - 每个 delta 包含 index 表示是第几个 tool_call
 * - 首次出现时包含 id 和 function.name
 * - 后续 delta 只包含 function.arguments 的增量
 */
function accumulateToolCalls(
  toolCalls: OpenAI.ChatCompletionMessageToolCall[],
  deltas: OpenAI.ChatCompletionChunk.Choice.Delta.ToolCall[]
): void {
  for (const delta of deltas) {
    const index = delta.index;

    // 新的 tool_call
    if (!toolCalls[index]) {
      toolCalls[index] = {
        id: delta.id || '',
        type: 'function',
        function: {
          name: delta.function?.name || '',
          arguments: delta.function?.arguments || '',
        },
      };
    } else {
      // 累积 arguments
      if (delta.function?.arguments) {
        toolCalls[index].function.arguments += delta.function.arguments;
      }
      // 可能后续 delta 才有 name（虽然通常首次就有）
      if (delta.function?.name) {
        toolCalls[index].function.name = delta.function.name;
      }
    }
  }
}