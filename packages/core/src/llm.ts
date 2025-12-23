/**
 * LLM 生成选项
 */
export interface LLMGenerateOptions {
  /** 提示词 */
  prompt: string
  /** 系统提示词 */
  system?: string
  /** 最大 token 数 */
  maxTokens?: number
  /** 温度参数 (0-1) */
  temperature?: number
}

/**
 * LLM 接口
 * 定义所有 LLM 实现必须遵循的契约
 */
export interface LLM {
  /**
   * 生成文本
   * @param options - 生成选项
   * @returns 生成的文本
   */
  generate(options: LLMGenerateOptions): Promise<string>
}

/**
 * OpenAI LLM 配置
 */
export interface OpenAILLMConfig {
  /** API Key */
  apiKey: string
  /** 模型名称 */
  model?: string
  /** API 基础 URL */
  baseURL?: string
}

/**
 * OpenAI LLM 实现
 * 这是一个示例实现，实际使用时需要安装 openai SDK
 */
export class OpenAILLM implements LLM {
  private config: OpenAILLMConfig

  constructor(config: OpenAILLMConfig) {
    this.config = {
      model: 'gpt-4',
      ...config,
    }
  }

  async generate(options: LLMGenerateOptions): Promise<string> {
    // TODO: 实际实现需要调用 OpenAI API
    // 这里返回一个模拟响应
    return `Mock response for: ${options.prompt}`
  }
}

/**
 * 本地 Mock LLM 实现
 * 用于测试和开发
 */
export class MockLLM implements LLM {
  async generate(options: LLMGenerateOptions): Promise<string> {
    return `Mock LLM response: ${options.prompt}`
  }
}
