import { BaseContext } from '../base/BaseContext.js';
import { ContextType, Message } from '../types.js';
import { HistoryContext } from './HistoryContext.js';
import { sanitizeMessages, SanitizeResult } from '../utils/messageSanitizer.js';

/**
 * 当前运行记录上下文管理类
 * 负责管理当前轮次的工具调用和响应
 */
export class CurrentTurnContext extends BaseContext<Message> {
  constructor() {
    super(ContextType.CURRENT_TURN);
  }

  /**
   * 格式化为消息数组
   */
  format(): Message[] {
    return this.getAll();
  }

  /**
   * 归档到历史
   * 将用户输入和当前轮次的所有消息归档到历史上下文
   *
   * @param history - 历史上下文
   * @param userInput - 用户输入
   */
  archiveTo(history: HistoryContext, userInput: string): void {
    // 先添加用户输入
    history.add({ role: 'user', content: userInput });

    // 再添加当前轮次的所有消息
    for (const msg of this.items) {
      history.add(msg);
    }

    // 清空当前轮次
    this.clear();
  }

  /**
   * 检查是否有工具调用
   */
  hasToolCalls(): boolean {
    return this.items.some(
      (msg) => msg.role === 'assistant' && msg.tool_calls && msg.tool_calls.length > 0
    );
  }

  /**
   * 检查是否有待处理的工具结果
   * 即最后一条消息是 assistant 带 tool_calls
   */
  hasPendingToolCalls(): boolean {
    if (this.isEmpty()) return false;
    const lastMsg = this.items[this.items.length - 1];
    return lastMsg.role === 'assistant' && !!lastMsg.tool_calls && lastMsg.tool_calls.length > 0;
  }

  /**
   * 获取最后一条 assistant 消息
   */
  getLastAssistantMessage(): Message | undefined {
    for (let i = this.items.length - 1; i >= 0; i--) {
      if (this.items[i].role === 'assistant') {
        return this.items[i];
      }
    }
    return undefined;
  }

  /**
   * 清理当前轮次的消息，保留已完成的部分
   *
   * 用于 ESC 中断时：
   * - 保留已完成的 assistant + tool 消息对
   * - 移除不完整的 assistant 消息（有 tool_calls 但缺少 tool 响应）
   *
   * @returns 清理结果
   */
  sanitize(): SanitizeResult {
    const result = sanitizeMessages(this.items);

    if (result.sanitized) {
      // 替换为清理后的消息
      this.replace(result.messages);
    }

    return result;
  }
}
