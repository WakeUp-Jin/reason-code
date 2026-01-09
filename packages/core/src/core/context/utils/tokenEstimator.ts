/**
 * Token 估算器
 * 提供快速的 Token 数量估算功能
 */

import type { Message } from '../types.js';

/**
 * Token 估算器类
 * 使用字符数估算 Token 数量
 */
export class TokenEstimator {
  /**
   * 估算字符串的 Token 数
   * 规则：
   * - ASCII 字符：约 4 字符 = 1 token
   * - 中文字符：约 1-2 字符 = 1 token
   *
   * @param content - 要估算的内容
   * @returns 估算的 Token 数
   */
  static estimate(content: unknown): number {
    const str = typeof content === 'string' ? content : JSON.stringify(content);

    if (!str || str.length === 0) {
      return 0;
    }

    // 统计中文字符数量
    const chineseChars = (str.match(/[\u4e00-\u9fff]/g) || []).length;
    // 非中文字符数量
    const otherChars = str.length - chineseChars;

    // 中文字符：约 1.5 字符 = 1 token
    // 其他字符：约 4 字符 = 1 token
    const chineseTokens = Math.ceil(chineseChars / 1.5);
    const otherTokens = Math.ceil(otherChars / 4);

    return chineseTokens + otherTokens;
  }

  /**
   * 估算消息数组的总 Token 数
   *
   * @param messages - 消息数组
   * @returns 估算的总 Token 数
   */
  static estimateMessages(messages: Message[]): number {
    if (!messages || messages.length === 0) {
      return 0;
    }

    return messages.reduce((sum, msg) => {
      // 消息内容
      let tokens = this.estimate(msg.content);

      // 角色标识（约 4 tokens）
      tokens += 4;

      // 工具调用（如果有）
      if (msg.tool_calls) {
        tokens += this.estimate(msg.tool_calls);
      }

      // 工具调用 ID（如果有）
      if (msg.tool_call_id) {
        tokens += this.estimate(msg.tool_call_id);
      }

      // 名称（如果有）
      if (msg.name) {
        tokens += this.estimate(msg.name);
      }

      return sum + tokens;
    }, 0);
  }

  /**
   * 格式化 Token 数为可读字符串
   *
   * @param tokens - Token 数
   * @returns 格式化的字符串（如 "1.2K", "45.6K"）
   */
  static formatTokens(tokens: number): string {
    if (tokens < 1000) {
      return String(tokens);
    }
    if (tokens < 1_000_000) {
      return `${(tokens / 1000).toFixed(1)}K`;
    }
    return `${(tokens / 1_000_000).toFixed(2)}M`;
  }
}
