import { ContextType, Message } from './types.js';
import { SystemPromptContext } from './modules/SystemPromptContext.js';
import { HistoryContext } from './modules/HistoryContext.js';
import { CurrentTurnContext } from './modules/CurrentTurnContext.js';
import { TokenEstimator } from './utils/tokenEstimator.js';
import { sanitizeMessages } from './utils/messageSanitizer.js';
import { logger } from '../../utils/logger.js';
import type { ILLMService } from '../llm/types/index.js';

/** 默认 Token 限制 */
const DEFAULT_MODEL_LIMIT = 64000;

/** 默认压缩触发阈值 */
const DEFAULT_COMPRESSION_THRESHOLD = 0.7;

/** 默认溢出警告阈值 */
const DEFAULT_OVERFLOW_THRESHOLD = 0.95;

/**
 * 压缩配置选项
 */
export interface CompressionConfig {
  /** 模型 Token 限制 */
  modelLimit: number;
  /** LLM 服务（用于生成摘要） */
  llmService: ILLMService;
  /** 会话 ID（用于生成文件引用） */
  sessionId?: string;
  /** 压缩触发阈值（0-1），默认 0.7 */
  compressionThreshold?: number;
  /** 溢出警告阈值（0-1），默认 0.95 */
  overflowThreshold?: number;
}

/**
 * Token 使用情况
 */
export interface TokenUsage {
  /** 已使用 Token 数 */
  used: number;
  /** Token 限制 */
  limit: number;
  /** 使用百分比 */
  percentage: number;
  /** 格式化字符串 */
  formatted: string;
}

/**
 * 上下文管理器
 * 负责统一管理 3 种核心上下文：系统提示词、会话历史、当前运行记录
 * 支持自动压缩功能
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

  // ============ 压缩相关配置 ============

  /** 模型 Token 限制 */
  private modelLimit: number = DEFAULT_MODEL_LIMIT;

  /** 压缩触发阈值 */
  private compressionThreshold: number = DEFAULT_COMPRESSION_THRESHOLD;

  /** 溢出警告阈值 */
  private overflowThreshold: number = DEFAULT_OVERFLOW_THRESHOLD;

  /** LLM 服务（用于生成摘要） */
  private llmService: ILLMService | null = null;

  /** 会话 ID（用于生成文件引用） */
  private sessionId?: string;

  /** 上次请求的实际 Token 数（从 API 响应获取） */
  private lastPromptTokens: number = 0;

  constructor() {
    this.systemPrompt = new SystemPromptContext();
    this.history = new HistoryContext();
    this.currentTurn = new CurrentTurnContext();
    logger.debug('ContextManager 初始化完成');
  }

  // ============ 压缩配置 ============

  /**
   * 配置压缩参数（由 Agent 或 executeToolLoop 调用）
   */
  configureCompression(config: CompressionConfig): void {
    this.modelLimit = config.modelLimit;
    this.llmService = config.llmService;
    this.sessionId = config.sessionId;
    this.compressionThreshold = config.compressionThreshold ?? DEFAULT_COMPRESSION_THRESHOLD;
    this.overflowThreshold = config.overflowThreshold ?? DEFAULT_OVERFLOW_THRESHOLD;
    logger.debug('压缩配置已更新', {
      modelLimit: this.modelLimit,
      sessionId: this.sessionId,
      compressionThreshold: this.compressionThreshold,
    });
  }

  /**
   * 检查是否需要压缩（token 使用率 >= 阈值）
   */
  needsCompression(): boolean {
    const messages = this.buildMessages();
    const usage = this.calculateTokenUsage(messages);
    return usage.percentage >= this.compressionThreshold * 100;
  }

  /**
   * 检查是否溢出（token 使用率 >= 溢出阈值）
   */
  isOverflow(): boolean {
    const messages = this.buildMessages();
    const usage = this.calculateTokenUsage(messages);
    return usage.percentage >= this.overflowThreshold * 100;
  }

  /**
   * 获取 token 使用情况
   */
  getTokenUsage(): TokenUsage {
    const messages = this.buildMessages();
    return this.calculateTokenUsage(messages);
  }

  /**
   * 更新 Token 计数（从 API 响应获取实际值）
   */
  updateTokenCount(promptTokens: number): void {
    this.lastPromptTokens = promptTokens;
  }

  /**
   * 获取上次请求的 Token 数
   */
  getLastPromptTokens(): number {
    return this.lastPromptTokens;
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

  // ============ 用户输入相关 ============

  /**
   * 设置当前用户输入
   */
  setUserInput(input: string): void {
    this.userInput = input;
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
   * 加载带摘要的历史（从检查点恢复时使用）
   *
   * @param summary - 压缩生成的摘要
   * @param messages - 摘要之后的历史消息
   */
  loadWithSummary(summary: string, messages: Message[]): void {
    // 清空现有历史
    this.history.clear();

    // 先添加摘要作为系统消息（user 角色，让 LLM 知道之前的对话内容）
    const summaryMessage: Message = {
      role: 'user',
      content: `[历史对话摘要]\n以下是之前对话的摘要，请基于此继续对话：\n\n${summary}`,
    };

    // 加载摘要 + 后续消息
    this.history.load([summaryMessage, ...messages]);

    logger.debug(`加载带摘要的历史: 1 条摘要 + ${messages.length} 条消息`);
  }

  /**
   * 获取历史消息数量
   */
  getHistoryCount(): number {
    return this.history.getAll().length;
  }

  /**
   * 获取历史消息（用于持久化）
   */
  getHistoryMessages(): Message[] {
    return this.history.getAll();
  }

  // ============ 当前轮次相关 ============

  /**
   * 添加到当前轮次
   */
  addToCurrentTurn(message: Message): void {
    this.currentTurn.add(message);
  }

  /**
   * 清空当前轮次
   */
  clearCurrentTurn(): void {
    this.currentTurn.clear();
  }

  /**
   * 清理当前轮次的消息，保留已完成的部分
   *
   * 用于 ESC 中断时：
   * - 保留已完成的 assistant + tool 消息对
   * - 移除不完整的 assistant 消息（有 tool_calls 但缺少 tool 响应）
   */
  sanitizeCurrentTurn(): void {
    this.currentTurn.sanitize();
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
   * 支持自动压缩功能
   *
   * 消息组装顺序：
   * 1. [system] 系统提示词
   * 2. [...history] 历史消息
   * 3. [user] 当前用户输入
   * 4. [...turn] 当前轮次的工具调用
   *
   * @param autoCompress - 是否自动检查并压缩，默认 false
   * @returns 消息列表
   */
  async getContext(autoCompress: boolean = false): Promise<Message[]> {
    // 自动压缩检查
    if (autoCompress && this.llmService && this.needsCompression()) {
      logger.info('触发自动压缩', { usage: this.getTokenUsage().formatted });
      const result = await this.history.compress(this.llmService, this.sessionId);
      if (result.compressed) {
        logger.info('压缩完成', {
          originalCount: result.originalCount,
          compressedCount: result.compressedCount,
          originalTokens: result.originalTokens,
          compressedTokens: result.compressedTokens,
        });
      }
    }

    return this.buildMessages();
  }

  /**
   * 同步获取上下文（不执行压缩）
   * 用于需要同步获取的场景
   */
  getContextSync(): Message[] {
    return this.buildMessages();
  }

  /**
   * 构建消息列表（内部方法）
   *
   * 在构建完成后会进行消息验证和清理，确保：
   * - 每个带 tool_calls 的 assistant 消息后面有对应的 tool 消息
   * - 没有孤立的 tool 消息
   */
  private buildMessages(): Message[] {
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

    // 5. 验证并清理消息，确保符合 LLM API 规范
    const { messages: sanitizedMessages, sanitized, removedCount } = sanitizeMessages(messages);

    if (sanitized) {
      logger.warn(`消息列表已清理，移除了 ${removedCount} 条不完整的消息`);
    }

    return sanitizedMessages;
  }

  /**
   * 计算 Token 使用情况
   */
  private calculateTokenUsage(messages: Message[]): TokenUsage {
    const used = TokenEstimator.estimateMessages(messages);
    const percentage = (used / this.modelLimit) * 100;
    return {
      used,
      limit: this.modelLimit,
      percentage,
      formatted: `${TokenEstimator.formatTokens(used)} / ${TokenEstimator.formatTokens(this.modelLimit)} (${percentage.toFixed(1)}%)`,
    };
  }

  // ============ 清理 ============

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
}
