import { ContextType, Message } from './types.js';
import { SystemPromptContext } from './modules/SystemPromptContext.js';
import { HistoryContext } from './modules/HistoryContext.js';
import { CurrentTurnContext } from './modules/CurrentTurnContext.js';
import { logger } from '../../utils/logger.js';

/**
 * 上下文管理器
 * 负责统一管理 3 种核心上下文：系统提示词、会话历史、当前运行记录
 */
export class ContextManager {
  /** 系统提示词上下文 */
  private systemPrompt: SystemPromptContext;

  /** 会话历史上下文 */
  private history: HistoryContext;

  /** 当前运行记录上下文 */
  private currentTurn: CurrentTurnContext;

  /** 当前用户输入 */
  private userInput: string = '';

  constructor() {
    this.systemPrompt = new SystemPromptContext();
    this.history = new HistoryContext();
    this.currentTurn = new CurrentTurnContext();
    logger.debug('ContextManager 初始化完成');
  }

  // ============ 系统提示词相关 ============

  /**
   * 设置系统提示词
   */
  setSystemPrompt(prompt: string): void {
    this.systemPrompt.setPrompt(prompt);
  }

  /**
   * 添加系统提示词片段
   */
  addSystemPrompt(prompt: string): void {
    this.systemPrompt.add(prompt);
  }

  /**
   * 获取系统提示词
   */
  getSystemPrompt(): string {
    return this.systemPrompt.getPrompt();
  }

  // ============ 用户输入相关 ============

  /**
   * 设置当前用户输入
   */
  setUserInput(input: string): void {
    this.userInput = input;
  }

  /**
   * 获取当前用户输入
   */
  getUserInput(): string {
    return this.userInput;
  }

  // ============ 历史消息相关 ============

  /**
   * 加载历史消息（从 CLI 传入）
   */
  loadHistory(messages: Message[]): void {
    this.history.load(messages);
    logger.debug(`加载历史消息: ${messages.length} 条`);
  }

  /**
   * 获取历史上下文
   */
  getHistory(): HistoryContext {
    return this.history;
  }

  /**
   * 获取历史消息
   */
  getHistoryMessages(): Message[] {
    return this.history.getAll();
  }

  /**
   * 获取历史消息数量
   */
  getHistoryCount(): number {
    return this.history.getCount();
  }

  // ============ 当前轮次相关 ============

  /**
   * 添加到当前轮次
   */
  addToCurrentTurn(message: Message): void {
    this.currentTurn.add(message);
  }

  /**
   * 获取当前轮次上下文
   */
  getCurrentTurn(): CurrentTurnContext {
    return this.currentTurn;
  }

  /**
   * 获取当前轮次消息
   */
  getCurrentTurnMessages(): Message[] {
    return this.currentTurn.getAll();
  }

  /**
   * 清空当前轮次
   */
  clearCurrentTurn(): void {
    this.currentTurn.clear();
  }

  /**
   * 检查当前轮次是否有待处理的工具调用
   */
  hasPendingToolCalls(): boolean {
    return this.currentTurn.hasPendingToolCalls();
  }

  // ============ 轮次管理 ============

  /**
   * 完成当前轮次（归档到历史）
   */
  finishTurn(): void {
    if (this.userInput) {
      this.currentTurn.archiveTo(this.history, this.userInput);
      this.userInput = '';
      logger.debug('当前轮次已归档到历史');
    }
  }

  // ============ 上下文组装 ============

  /**
   * 获取完整上下文（供 LLM 调用）
   *
   * 消息组装顺序：
   * 1. [system] 系统提示词
   * 2. [...history] 历史消息
   * 3. [user] 当前用户输入
   * 4. [...turn] 当前轮次的工具调用
   */
  getContext(): Message[] {
    const messages: Message[] = [];

    // 1. 系统提示词
    messages.push(...this.systemPrompt.format());

    // 2. 历史消息
    messages.push(...this.history.format());

    // 3. 当前用户输入
    if (this.userInput) {
      messages.push({ role: 'user', content: this.userInput });
    }

    // 4. 当前轮次的工具调用
    messages.push(...this.currentTurn.format());

    return messages;
  }

  /**
   * 获取所有消息（不含系统提示词）
   * 用于 token 估算等场景
   */
  getAllMessages(): Message[] {
    const messages: Message[] = [];
    messages.push(...this.history.format());
    if (this.userInput) {
      messages.push({ role: 'user', content: this.userInput });
    }
    messages.push(...this.currentTurn.format());
    return messages;
  }

  // ============ 清理和重置 ============

  /**
   * 清空指定类型的上下文
   */
  clear(type: ContextType): void {
    switch (type) {
      case ContextType.SYSTEM_PROMPT:
        this.systemPrompt.clear();
        break;
      case ContextType.HISTORY:
        this.history.clear();
        break;
      case ContextType.CURRENT_TURN:
        this.currentTurn.clear();
        break;
      default:
        logger.warn(`未知的上下文类型: ${type}`);
    }
  }

  /**
   * 重置所有上下文
   */
  reset(): void {
    this.systemPrompt.clear();
    this.history.clear();
    this.currentTurn.clear();
    this.userInput = '';
    logger.debug('ContextManager 已重置');
  }

  // ============ 统计和调试 ============

  /**
   * 检查是否为空
   */
  isEmpty(): boolean {
    return (
      this.systemPrompt.isEmpty() &&
      this.history.isEmpty() &&
      this.currentTurn.isEmpty() &&
      !this.userInput
    );
  }

  /**
   * 获取统计信息
   */
  getStats(): { systemPrompt: number; history: number; currentTurn: number; hasUserInput: boolean } {
    return {
      systemPrompt: this.systemPrompt.getCount(),
      history: this.history.getCount(),
      currentTurn: this.currentTurn.getCount(),
      hasUserInput: !!this.userInput,
    };
  }

  /**
   * 打印当前状态（调试用）
   */
  debug(): void {
    const stats = this.getStats();
    logger.debug('ContextManager state', {
      systemPrompt: stats.systemPrompt,
      history: stats.history,
      currentTurn: stats.currentTurn,
      hasUserInput: stats.hasUserInput,
    });
  }
}
