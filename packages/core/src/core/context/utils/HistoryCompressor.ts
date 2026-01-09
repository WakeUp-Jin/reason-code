/**
 * 历史压缩器
 * 负责将对话历史压缩为摘要，减少 Token 使用
 */

import type { ILLMService } from '../../llm/types/index.js';
import type { Message, CompressionResult } from '../types.js';
import { TokenEstimator } from './tokenEstimator.js';
import {
  COMPRESSION_SYSTEM_PROMPT,
  extractSummaryContent,
} from '../../promptManager/compression/historyCompression.js';
import { DEFAULT_THRESHOLDS } from './ContextChecker.js';

/**
 * 历史压缩器类
 */
export class HistoryCompressor {
  /** LLM 服务实例 */
  private llmService: ILLMService;

  /**
   * 创建历史压缩器
   *
   * @param llmService - LLM 服务实例
   */
  constructor(llmService: ILLMService) {
    this.llmService = llmService;
  }

  /**
   * 压缩历史记录
   *
   * @param history - 历史消息列表
   * @param preserveRatio - 保留最近历史的比例（默认 0.3）
   * @returns 压缩结果
   */
  async compress(
    history: Message[],
    preserveRatio: number = DEFAULT_THRESHOLDS.compressionPreserve
  ): Promise<CompressionResult> {
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
      // 生成摘要
      const summary = await this.generateSummary(historyToCompress);

      if (!summary) {
        return {
          compressed: false,
          originalCount: history.length,
          compressedCount: history.length,
          originalTokens,
          compressedTokens: originalTokens,
        };
      }

      // 创建摘要消息
      const summaryMessage: Message = {
        role: 'system',
        content: `[历史对话摘要]\n${summary}`,
      };

      // 组合新历史
      const newHistory = [summaryMessage, ...historyToPreserve];
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
   * 生成历史摘要
   *
   * @param historyToCompress - 需要压缩的历史消息
   * @returns 生成的摘要
   */
  private async generateSummary(historyToCompress: Message[]): Promise<string | null> {
    // 格式化历史为文本
    const historyText = this.formatHistoryForSummary(historyToCompress);

    // 调用 LLM 生成摘要
    const response = await this.llmService.simpleChat(
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
   *
   * @param history - 历史消息列表
   * @returns 格式化的文本
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
   *
   * @param role - 消息角色
   * @returns 角色标签
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
   *
   * @param history - 历史消息列表
   * @param preserveRatio - 保留比例
   * @returns 分割点索引
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
   *
   * @param history - 历史消息列表
   * @param splitIndex - 原始分割点
   * @returns 调整后的分割点
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
