import { BaseContext } from '../base/BaseContext.js';
import { ContextType, Message } from '../types.js';

/**
 * 系统提示词上下文管理类
 * 负责管理系统级提示词
 */
export class SystemPromptContext extends BaseContext<string> {
  constructor() {
    super(ContextType.SYSTEM_PROMPT);
  }

  /**
   * 格式化为系统消息数组
   */
  format(): Message[] {
    if (this.isEmpty()) {
      return [];
    }

    return [
      {
        role: 'system',
        content: this.items.join('\n\n'),
      },
    ];
  }

  /**
   * 获取合并后的提示词文本
   */
  getPrompt(): string {
    return this.items.join('\n\n');
  }

  /**
   * 设置提示词（清空现有并添加新的）
   */
  setPrompt(prompt: string): void {
    this.clear();
    if (prompt) {
      this.add(prompt);
    }
  }
}
