/**
 * 会话历史上下文管理类
 * 负责管理会话历史消息和压缩功能
 * 
 * 压缩功能使用 SECONDARY 层级模型以平衡成本和效果
 */

import { BaseContext } from '../base/BaseContext.js';
import { ContextType, Message, CompressionResult } from '../types.js';
import type { ILLMService } from '../../llm/types/index.js';
import { llmServiceRegistry, ModelTier } from '../../llm/index.js';
import { TokenEstimator } from '../utils/tokenEstimator.js';
import {
  COMPRESSION_SYSTEM_PROMPT,
  extractSummaryContent,
} from '../../promptManager/compression/historyCompression.js';

/** 默认保留比例 */
const DEFAULT_PRESERVE_RATIO = 0.3;

/**
 * 会话历史上下文管理类
 * 负责管理会话历史消息，包含压缩功能
 */
export class HistoryContext extends BaseContext<Message> {
  constructor() {
    super(ContextType.HISTORY);
  }

  /**
   * 格式化为消息数组
   */
  format(): Message[] {
    return this.getAll();
  }

  /**
   * 加载历史消息（清空现有并加载新的）
   */
  load(messages: Message[]): void {
    this.replace(messages);
  }

  /**
   * 获取最近 N 条消息
   */
  getRecent(count: number): Message[] {
    if (count <= 0) return [];
    return this.items.slice(-count);
  }

  /**
   * 获取除了最近 N 条之外的所有消息
   */
  getExceptRecent(count: number): Message[] {
    if (count <= 0) return this.getAll();
    if (count >= this.items.length) return [];
    return this.items.slice(0, -count);
  }

  // ============================================================
  // 压缩功能（从 HistoryCompressor 合并）
  // ============================================================

  /**
   * 压缩历史并添加文件引用
   * 使用 SECONDARY 层级模型进行压缩
   *
   * @param sessionId - 会话 ID（用于生成文件引用）
   * @param preserveRatio - 保留最近历史的比例，默认 0.3
   * @returns 压缩结果
   */
  async compress(
    sessionId?: string,
    preserveRatio: number = DEFAULT_PRESERVE_RATIO
  ): Promise<CompressionResult> {
    const history = this.getAll();
    const originalTokens = TokenEstimator.estimateMessages(history);

    // 如果历史太短，不需要压缩
    if (history.length < 4) {
      return {
        compressed: false,
        originalCount: history.length,
        compressedCount: history.length,
        originalTokens,
        compressedTokens: originalTokens,
      };
    }

    // 计算分割点
    const splitIndex = this.findSplitPoint(history, preserveRatio);

    // 如果分割点太靠前，不压缩
    if (splitIndex < 2) {
      return {
        compressed: false,
        originalCount: history.length,
        compressedCount: history.length,
        originalTokens,
        compressedTokens: originalTokens,
      };
    }

    // 分割历史
    const historyToCompress = history.slice(0, splitIndex);
    const historyToPreserve = history.slice(splitIndex);

    try {
      // 获取 SECONDARY 层级 LLM 服务进行压缩
      const llmService = await llmServiceRegistry.getService(ModelTier.SECONDARY);
      
      // 生成摘要
      const summary = await this.generateSummary(historyToCompress, llmService);

      if (!summary) {
        return {
          compressed: false,
          originalCount: history.length,
          compressedCount: history.length,
          originalTokens,
          compressedTokens: originalTokens,
        };
      }

      // 创建摘要消息（包含历史文件引用）
      const summaryMessage = this.buildSummaryMessage(summary, sessionId);

      // 组合新历史并替换
      const newHistory = [summaryMessage, ...historyToPreserve];
      this.replace(newHistory);

      const compressedTokens = TokenEstimator.estimateMessages(newHistory);

      return {
        compressed: true,
        originalCount: history.length,
        compressedCount: newHistory.length,
        originalTokens,
        compressedTokens,
        summary,
      };
    } catch (error) {
      return {
        compressed: false,
        originalCount: history.length,
        compressedCount: history.length,
        originalTokens,
        compressedTokens: originalTokens,
      };
    }
  }

  /**
   * 构建摘要消息（包含历史文件引用）
   */
  private buildSummaryMessage(summary: string, sessionId?: string): Message {
    let content = '[历史对话摘要]\n\n';

    // 如果有 sessionId，添加历史文件引用
    if (sessionId) {
      content += `如需查看完整历史记录，可以读取文件：~/.reason-code/sessions/${sessionId}/history.json\n\n---\n\n`;
    }

    content += summary;

    return {
      role: 'system',
      content,
    };
  }

  /**
   * 生成历史摘要
   */
  private async generateSummary(
    historyToCompress: Message[],
    llmService: ILLMService
  ): Promise<string | null> {
    // 格式化历史为文本
    const historyText = this.formatHistoryForSummary(historyToCompress);

    // 调用 LLM 生成摘要
    const response = await llmService.simpleChat(
      `请根据以下对话历史生成摘要：\n\n${historyText}`,
      COMPRESSION_SYSTEM_PROMPT
    );

    // 提取摘要内容
    const summary = extractSummaryContent(response);

    // 如果没有找到 <summary> 标签，直接使用响应内容
    return summary || response;
  }

  /**
   * 格式化历史为摘要输入
   */
  private formatHistoryForSummary(history: Message[]): string {
    return history
      .map((msg, index) => {
        const roleLabel = this.getRoleLabel(msg.role);
        let content = msg.content;

        // 截断过长的内容
        if (content.length > 2000) {
          content = content.slice(0, 2000) + '... [内容已截断]';
        }

        return `[${index + 1}] ${roleLabel}:\n${content}`;
      })
      .join('\n\n---\n\n');
  }

  /**
   * 获取角色标签
   */
  private getRoleLabel(role: string): string {
    switch (role) {
      case 'user':
        return '用户';
      case 'assistant':
        return '助手';
      case 'system':
        return '系统';
      case 'tool':
        return '工具';
      default:
        return role;
    }
  }

  /**
   * 计算分割点
   * 保留最近 preserveRatio 比例的历史
   */
  private findSplitPoint(history: Message[], preserveRatio: number): number {
    const totalTokens = TokenEstimator.estimateMessages(history);
    const targetPreserveTokens = totalTokens * preserveRatio;

    let preserveTokens = 0;
    let splitIndex = history.length;

    // 从后往前累计 Token，找到分割点
    for (let i = history.length - 1; i >= 0; i--) {
      const msgTokens = TokenEstimator.estimate(history[i]);
      preserveTokens += msgTokens;

      if (preserveTokens >= targetPreserveTokens) {
        splitIndex = i;
        break;
      }
    }

    // 确保分割点在消息边界（不要分割 tool 调用序列）
    splitIndex = this.adjustSplitPointForToolCalls(history, splitIndex);

    return splitIndex;
  }

  /**
   * 调整分割点以避免分割工具调用序列
   */
  private adjustSplitPointForToolCalls(history: Message[], splitIndex: number): number {
    // 如果分割点在工具消息上，向前移动到 assistant 消息之前
    while (
      splitIndex > 0 &&
      (history[splitIndex]?.role === 'tool' || history[splitIndex - 1]?.tool_calls)
    ) {
      splitIndex--;
    }

    return splitIndex;
  }
}
