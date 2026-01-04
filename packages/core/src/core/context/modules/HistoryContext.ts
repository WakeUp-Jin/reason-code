import { BaseContext } from '../base/BaseContext.js';
import { ContextType, Message } from '../types.js';

/**
 * 会话历史上下文管理类
 * 负责管理会话历史消息
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
}

