/**
 * 模型列表加载器
 * 从配置文件读取 providers 的 options 字段，生成前端可用的模型列表
 */

import { configService } from './index.js';

/**
 * 模型信息（用于前端 /model 命令展示）
 */
export interface ModelInfo {
  /** 模型 ID（格式：provider/model） */
  id: string;
  /** 显示名称 */
  name: string;
  /** 供应商名称 */
  provider: string;
  /** 最大 Token 数 */
  maxTokens?: number;
  /** 定价信息 */
  pricing?: {
    /** 输入价格（每百万 Token） */
    input: number;
    /** 输出价格（每百万 Token） */
    output: number;
  };
  /** 描述 */
  description?: string;
}

/**
 * 模型元数据映射（硬编码的模型信息）
 * 后续可以扩展配置文件支持
 */
const MODEL_METADATA: Record<string, Partial<ModelInfo>> = {
  // DeepSeek
  'deepseek/deepseek-chat': {
    name: 'DeepSeek Chat',
    maxTokens: 64_000,
    pricing: { input: 2.0, output: 3.0 },
    description: 'Fast and affordable chat model',
  },
  'deepseek/deepseek-reasoner': {
    name: 'DeepSeek Reasoner',
    maxTokens: 64_000,
    pricing: { input: 2.0, output: 3.0 },
    description: 'Advanced reasoning model (R1)',
  },
  // OpenAI
  'openai/gpt-4o': {
    name: 'GPT-4o',
    maxTokens: 128_000,
    pricing: { input: 18.0, output: 72.0 },
    description: 'Fast and capable GPT-4 model',
  },
  'openai/gpt-4o-mini': {
    name: 'GPT-4o Mini',
    maxTokens: 128_000,
    pricing: { input: 1.08, output: 4.32 },
    description: 'Smaller, faster GPT-4o variant',
  },
  'openai/o1': {
    name: 'o1',
    maxTokens: 200_000,
    pricing: { input: 108.0, output: 432.0 },
    description: 'Advanced reasoning model',
  },
  'openai/o1-mini': {
    name: 'o1 Mini',
    maxTokens: 128_000,
    pricing: { input: 21.6, output: 86.4 },
    description: 'Smaller o1 variant',
  },
  // OpenRouter
  'openrouter/anthropic/claude-sonnet-4': {
    name: 'Claude Sonnet 4',
    maxTokens: 200_000,
    pricing: { input: 21.6, output: 108.0 },
    description: 'Most capable Claude model with 200K context',
  },
  'openrouter/x-ai/grok-4.1-fast': {
    name: 'Grok 4.1 Fast',
    maxTokens: 131_072,
    pricing: { input: 21.6, output: 72.0 },
    description: 'Fast xAI Grok model',
  },
};

/**
 * 格式化模型名称（将 model ID 转换为友好名称）
 */
function formatModelName(modelName: string): string {
  // 尝试从映射获取名称
  // 否则将连字符替换为空格并首字母大写
  return modelName
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * 获取模型元数据
 */
function getModelMetadata(
  providerName: string,
  modelName: string
): Partial<ModelInfo> {
  // 尝试多种 key 格式
  const keys = [
    `${providerName}/${modelName}`,
    modelName,
  ];

  for (const key of keys) {
    if (MODEL_METADATA[key]) {
      return MODEL_METADATA[key];
    }
  }

  // 返回默认值
  return {
    name: formatModelName(modelName),
    description: `${providerName} model`,
  };
}

/**
 * 从配置文件加载模型列表
 * 读取所有 provider 的 options 字段，生成模型列表
 */
export async function loadModelsFromConfig(): Promise<ModelInfo[]> {
  const config = await configService.getConfig();
  const models: ModelInfo[] = [];

  for (const [providerName, providerConfig] of Object.entries(config.providers)) {
    // 确保 options 存在
    if (!providerConfig.options || providerConfig.options.length === 0) {
      continue;
    }

    for (const modelName of providerConfig.options) {
      const id = `${providerName}/${modelName}`;
      const metadata = getModelMetadata(providerName, modelName);

      models.push({
        id,
        name: metadata.name || formatModelName(modelName),
        provider: providerName.charAt(0).toUpperCase() + providerName.slice(1),
        maxTokens: metadata.maxTokens,
        pricing: metadata.pricing,
        description: metadata.description,
      });
    }
  }

  return models;
}
