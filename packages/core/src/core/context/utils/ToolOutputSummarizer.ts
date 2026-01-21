/**
 * 工具输出总结器
 * 负责总结过长的工具输出，减少 Token 使用
 * 
 * 使用 SECONDARY 层级模型进行总结，以平衡成本和效果
 */

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ILLMService } from '../../llm/types/index.js';
import { llmServiceRegistry, ModelTier } from '../../llm/index.js';
import type { ToolOutputProcessResult } from '../types.js';
import { TokenEstimator } from './tokenEstimator.js';
import { TOOL_OUTPUT_SUMMARY_PROMPT } from '../../promptManager/summarization/toolOutputSummary.js';

/**
 * 默认配置
 */
const DEFAULT_MAX_FILE_SIZE = 100_000;
const DEFAULT_TRUNCATE_LINES = 1000;
/** 工具输出超过此 Token 数触发总结 */
const DEFAULT_TOOL_OUTPUT_SUMMARY_THRESHOLD = 4000;

/**
 * 工具输出总结器类
 * 
 * 支持两种使用方式：
 * 1. 传入 llmService（向后兼容）
 * 2. 不传入，自动使用 SECONDARY 层级模型（推荐）
 */
export class ToolOutputSummarizer {
  /** LLM 服务实例（可选，不传则使用 SECONDARY 层级） */
  private llmService?: ILLMService;

  /**
   * 创建工具输出总结器
   *
   * @param llmService - LLM 服务实例（可选）
   *   - 如果传入：使用传入的服务
   *   - 如果不传：自动使用 SECONDARY 层级模型
   */
  constructor(llmService?: ILLMService) {
    this.llmService = llmService;
  }

  /**
   * 获取 LLM 服务
   * 如果构造时未传入，则从 Registry 获取 SECONDARY 层级服务
   */
  private async getLLMService(): Promise<ILLMService> {
    if (this.llmService) {
      return this.llmService;
    }
    // 使用 SECONDARY 层级模型进行工具输出总结
    return llmServiceRegistry.getService(ModelTier.SECONDARY);
  }

  /**
   * 检查是否需要总结
   *
   * @param output - 工具输出
   * @param threshold - Token 阈值（默认 2000）
   * @returns 是否需要总结
   */
  needsSummary(output: string, threshold: number = DEFAULT_TOOL_OUTPUT_SUMMARY_THRESHOLD): boolean {
    return TokenEstimator.estimate(output) > threshold;
  }

  /**
   * 检查是否需要截断
   *
   * @param output - 工具输出
   * @param maxSize - 最大字符数（默认 100K）
   * @returns 是否需要截断
   */
  needsTruncation(output: string, maxSize: number = DEFAULT_MAX_FILE_SIZE): boolean {
    return output.length > maxSize;
  }

  /**
   * 处理工具输出
   * 策略：
   * 1. 超大输出（> 100K 字符）→ 先截断，再总结（保险机制）
   * 2. 普通长输出（> 2000 tokens）→ 直接总结
   * 3. 正常输出 → 不处理
   *
   * @param output - 工具输出
   * @param toolName - 工具名称（用于上下文）
   * @param params - 工具参数（用于上下文）
   * @returns 处理结果
   */
  async process(output: string, toolName?: string,params?: any): Promise<ToolOutputProcessResult> {
    const originalTokens = TokenEstimator.estimate(output);

    // 1. 超大输出：先截断，再总结
    //    截断作为保险机制，防止工具内部忘记实现截断
    if (this.needsTruncation(output)) {
      const truncated = this.truncate(output);
      const summary = await this.summarize(truncated, toolName);

      return {
        output: summary,
        summarized: true,
        truncated: true,
        originalTokens,
        processedTokens: TokenEstimator.estimate(summary),
      };
    }

    // 2. 普通长输出：直接总结
    if (this.needsSummary(output)) {
      const summary = await this.summarize(output, toolName);
      return {
        output: summary,
        summarized: true,
        truncated: false,
        originalTokens,
        processedTokens: TokenEstimator.estimate(summary),
      };
    }

    // 3. 正常大小：不需要处理
    return {
      output,
      summarized: false,
      truncated: false,
      originalTokens,
      processedTokens: originalTokens,
    };
  }

  /**
   * 总结工具输出
   *
   * @param output - 工具输出
   * @param toolName - 工具名称
   * @returns 总结后的内容
   */
  async summarize(output: string, toolName?: string,params?: any): Promise<string> {
    const startTime = Date.now();
    const contextInfo = toolName ? `工具名称: ${toolName}\n\n` : '';
    const paramsInfo = params ? `工具参数: ${JSON.stringify(params)}\n\n` : '';
    const prompt = `${TOOL_OUTPUT_SUMMARY_PROMPT}${contextInfo}${output}`;

    try {
      // 获取 LLM 服务（优先使用 SECONDARY 层级）
      const service = await this.getLLMService();
      const summary = await service.simpleChat(prompt);
      const executionTime = Date.now() - startTime;
      
      // 记录完整输入和执行时间
      const logContent = `=== 工具压缩日志 ===
时间: ${new Date().toISOString()}
工具: ${toolName || 'unknown'}
执行时间: ${executionTime}ms
模型: ${service.getConfig().model}

=== 完整输入 ===
${prompt}

=== 输出结果 ===
${summary}

`;

      // 写入日志文件（覆盖模式）
      const logPath = join(process.cwd(), 'logs', 'tool-compression.txt');
      writeFileSync(logPath, logContent, 'utf8');

      return `[工具输出摘要${toolName ? ` - ${toolName}` : ''}]\n${summary}`;
    } catch (error) {
      // 如果总结失败，返回截断的原始内容
      return this.truncate(output, DEFAULT_TRUNCATE_LINES);
    }
  }

  /**
   * 截断过大的输出（保留头尾）
   *
   * @param output - 工具输出
   * @param maxLines - 最大行数（默认 1000）
   * @returns 截断后的内容
   */
  truncate(output: string, maxLines: number = DEFAULT_TRUNCATE_LINES): string {
    const lines = output.split('\n');

    if (lines.length <= maxLines) {
      // 如果行数不超过限制，检查字符数
      if (output.length <= DEFAULT_MAX_FILE_SIZE) {
        return output;
      }

      // 按字符截断
      const halfSize = Math.floor(DEFAULT_MAX_FILE_SIZE / 2) - 50;
      const head = output.slice(0, halfSize);
      const tail = output.slice(-halfSize);
      return `${head}\n\n... [内容已截断，省略 ${output.length - halfSize * 2} 字符] ...\n\n${tail}`;
    }

    // 按行截断（保留头尾各一半）
    const halfLines = Math.floor(maxLines / 2);
    const headLines = lines.slice(0, halfLines);
    const tailLines = lines.slice(-halfLines);
    const omittedLines = lines.length - maxLines;

    return [
      ...headLines,
      '',
      `... [内容已截断，省略 ${omittedLines} 行] ...`,
      '',
      ...tailLines,
    ].join('\n');
  }

  /**
   * 快速截断（不调用 LLM）
   * 用于紧急情况下的快速处理
   *
   * @param output - 工具输出
   * @param maxTokens - 最大 Token 数
   * @returns 截断后的内容
   */
  quickTruncate(output: string, maxTokens: number = 2000): string {
    const currentTokens = TokenEstimator.estimate(output);

    if (currentTokens <= maxTokens) {
      return output;
    }

    // 估算需要保留的字符数（假设 1 token ≈ 4 字符）
    const targetChars = maxTokens * 4;
    const halfChars = Math.floor(targetChars / 2) - 50;

    const head = output.slice(0, halfChars);
    const tail = output.slice(-halfChars);

    return `${head}\n\n... [内容已截断] ...\n\n${tail}`;
  }
}
