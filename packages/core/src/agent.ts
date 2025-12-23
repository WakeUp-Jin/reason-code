import type { LLM } from './llm'
import type { Tool } from './tools'

/**
 * Agent 配置接口
 */
export interface AgentConfig {
  /** LLM 实例 */
  llm: LLM
  /** 可用工具列表 */
  tools?: Tool[]
  /** 系统提示词 */
  systemPrompt?: string
}

/**
 * Agent 核心引擎
 * 负责协调 LLM、工具调用和任务执行
 */
export class Agent {
  private config: AgentConfig

  constructor(config: AgentConfig) {
    this.config = config
  }

  /**
   * 运行 Agent
   * @param input - 用户输入
   * @returns Agent 响应
   */
  async run(input: string): Promise<string> {
    // 构建完整的提示词
    const prompt = this.config.systemPrompt
      ? `${this.config.systemPrompt}\n\nUser: ${input}`
      : input

    // 调用 LLM 生成响应
    const response = await this.config.llm.generate({
      prompt,
      system: this.config.systemPrompt,
    })

    return response
  }

  /**
   * 注册工具
   * @param tool - 工具实例
   */
  registerTool(tool: Tool): void {
    if (!this.config.tools) {
      this.config.tools = []
    }
    this.config.tools.push(tool)
  }

  /**
   * 获取已注册的工具列表
   */
  getTools(): Tool[] {
    return this.config.tools || []
  }
}
