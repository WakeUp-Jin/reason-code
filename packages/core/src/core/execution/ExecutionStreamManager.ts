/**
 * 执行流管理器
 * 管理 Agent 执行过程中的状态、工具调用、统计信息
 */

import type { ExecutionEvent, ExecutionEventHandler } from './events.js';
import {
  ExecutionState,
  ToolCallStatus,
  type ExecutionSnapshot,
  type ToolCallRecord,
  type ExecutionStats,
} from './types.js';
import type { ConfirmDetails } from '../tool/types.js';
import { logger } from '../../utils/logger.js';
import { eventLogger } from '../../utils/logUtils.js';

// 状态短语池
const STATUS_PHRASES = [
  'Thinking...',
  'Analyzing...',
  'Processing...',
  'Reasoning...',
  'Deciphering...',
  'Elucidating...',
  'Crunching...',
  'Computing...',
];

/**
 * ExecutionStreamManager 配置选项
 */
export interface ExecutionStreamManagerOptions {
  /** Web 端流式传输回调，预留接口 */
  onStream?: ExecutionEventHandler;
}

/**
 * 执行流管理器
 * 管理 Agent 执行过程中的状态、工具调用、统计信息
 */
export class ExecutionStreamManager {
  private handlers: Set<ExecutionEventHandler> = new Set();
  private snapshot: ExecutionSnapshot;
  private phraseIndex = 0;
  private phraseInterval?: ReturnType<typeof setInterval>;

  /** Web 端流式传输回调，预留接口 */
  private onStream?: ExecutionEventHandler;

  /** ✅ 新增：保存等待确认的工具信息（用于取消时生成事件） */
  private pendingConfirmInfo?: {
    toolCallId: string;
    toolName: string;
    toolCategory: string;
    paramsSummary: string;
  };

  constructor(options?: ExecutionStreamManagerOptions) {
    this.snapshot = this.createInitialSnapshot();
    this.onStream = options?.onStream;
  }

  private createInitialSnapshot(): ExecutionSnapshot {
    return {
      state: ExecutionState.Idle,
      statusPhrase: '',
      stats: {
        startTime: 0,
        elapsedTime: 0,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        toolCallCount: 0,
        loopCount: 0,
      },
      toolCallHistory: [],
      streamingContent: '',
    };
  }

  // ==================== 事件系统 ====================

  on(handler: ExecutionEventHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  private emit(event: ExecutionEvent): void {
    // 📡 记录事件发送（自动过滤高频事件）
    eventLogger.emit(event.type, this.serializeEventForLog(event));

    this.handlers.forEach((handler) => handler(event));
    // Web 端流式传输回调
    this.onStream?.(event);
  }

  /**
   * 序列化事件用于日志记录
   * 避免日志过大，只记录关键信息
   */
  private serializeEventForLog(event: ExecutionEvent): object {
    const baseLog = { type: event.type };

    switch (event.type) {
      // 生命周期事件
      case 'execution:start':
        return { ...baseLog, timestamp: event.timestamp };

      case 'execution:complete':
        return {
          ...baseLog,
          stats: event.stats,
        };

      case 'execution:error':
        return { ...baseLog, error: event.error };

      case 'execution:cancel':
        return baseLog;

      // 状态事件
      case 'state:change':
        return {
          ...baseLog,
          state: event.state,
          phrase: event.phrase,
        };

      // 思考事件
      case 'thinking:start':
        return {
          ...baseLog,
        };

      case 'thinking:delta':
        return {
          ...baseLog,
          deltaLength: event.delta.length,
          deltaPreview: event.delta.slice(0, 50),
        };

      case 'thinking:complete':
        return {
          ...baseLog,
          contentLength: event.thinkingContent.length,
          contentPreview: event.thinkingContent.slice(0, 100),
        };

      // Assistant 消息事件 - 关键！
      case 'assistant:message':
        return {
          ...baseLog,
          contentLength: event.content.length,
          contentPreview: event.content.slice(0, 100),
          toolCallsCount: event.tool_calls.length,
          toolNames: event.tool_calls.map((tc) => tc.function.name),
        };

      // 工具事件
      case 'tool:validating':
        return {
          ...baseLog,
          toolCallId: event.toolCall.id,
          toolName: event.toolCall.toolName,
          toolCategory: event.toolCall.toolCategory,
          hasThinking: !!event.toolCall.thinkingContent,
          thinkingPreview: event.toolCall.thinkingContent?.slice(0, 50),
        };

      case 'tool:executing':
        return {
          ...baseLog,
          toolCallId: event.toolCall.id,
          toolName: event.toolCall.toolName,
          paramsCount: Object.keys(event.toolCall.params).length,
        };

      case 'tool:output':
        return {
          ...baseLog,
          toolCallId: event.toolCallId,
          outputLength: event.output.length,
          outputPreview: event.output.slice(0, 100),
        };

      case 'tool:complete':
        return {
          ...baseLog,
          toolCallId: event.toolCall.id,
          toolName: event.toolCall.toolName,
          status: event.toolCall.status,
          duration: event.toolCall.duration,
          resultSummary: event.toolCall.resultSummary,
        };

      case 'tool:error':
        return {
          ...baseLog,
          toolCallId: event.toolCallId,
          error: event.error,
        };

      case 'tool:awaiting_approval':
        return {
          ...baseLog,
          toolCallId: event.toolCallId,
          toolName: event.toolName,
          confirmDetailsType: event.confirmDetails.type,
        };

      case 'tool:cancelled':
        return {
          ...baseLog,
          toolCallId: event.toolCallId,
          reason: event.reason,
        };

      // 流式输出事件
      case 'content:delta':
        return {
          ...baseLog,
          deltaLength: event.delta.length,
          deltaPreview: event.delta.slice(0, 50),
        };

      case 'content:complete':
        return {
          ...baseLog,
          contentLength: event.content.length,
          contentPreview: event.content.slice(0, 100),
        };

      // Token 统计事件
      case 'stats:update':
        return {
          ...baseLog,
          stats: event.stats,
        };

      default:
        return baseLog;
    }
  }

  // ==================== 生命周期 ====================

  start(): void {
    this.snapshot = this.createInitialSnapshot();
    this.snapshot.state = ExecutionState.Thinking;
    this.snapshot.stats.startTime = Date.now();
    this.startPhraseRotation();
    this.emit({ type: 'execution:start', timestamp: Date.now() });
    this.emitStateChange();
  }

  complete(cost?: number): void {
    this.stopPhraseRotation();
    this.snapshot.state = ExecutionState.Completed;
    this.emit({ type: 'execution:complete', stats: { ...this.snapshot.stats }, cost });
  }

  cancel(reason?: string): void {
    this.stopPhraseRotation();
    this.snapshot.state = ExecutionState.Cancelled;
    this.emit({ type: 'execution:cancel', reason });
  }

  error(error: string): void {
    this.stopPhraseRotation();
    this.snapshot.state = ExecutionState.Error;
    this.snapshot.error = error;
    this.emit({ type: 'execution:error', error });
  }

  // ==================== 状态短语轮换 ====================

  private startPhraseRotation(): void {
    this.phraseIndex = Math.floor(Math.random() * STATUS_PHRASES.length);
    this.snapshot.statusPhrase = STATUS_PHRASES[this.phraseIndex]!;

    // 每 3-5 秒随机切换短语
    this.phraseInterval = setInterval(
      () => {
        this.phraseIndex = (this.phraseIndex + 1) % STATUS_PHRASES.length;
        this.snapshot.statusPhrase = STATUS_PHRASES[this.phraseIndex]!;
        this.emitStateChange();
      },
      3000 + Math.random() * 2000
    );
  }

  private stopPhraseRotation(): void {
    if (this.phraseInterval) {
      clearInterval(this.phraseInterval);
      this.phraseInterval = undefined;
    }
  }

  private emitStateChange(): void {
    this.emit({
      type: 'state:change',
      state: this.snapshot.state,
      phrase: this.snapshot.statusPhrase,
    });
  }

  // ==================== 思考内容 ====================

  startThinking(): void {
    this.snapshot.thinking = { content: '', isComplete: false };
    this.snapshot.state = ExecutionState.Thinking;
    this.emit({ type: 'thinking:start' });
    this.emitStateChange();
  }

  appendThinking(delta: string): void {
    if (this.snapshot.thinking) {
      this.snapshot.thinking.content += delta;
      this.emit({ type: 'thinking:delta', delta });
    }
  }

  completeThinking(thinkingContent?: string): void {
    if (this.snapshot.thinking) {
      // 如果传入了 content，使用传入的；否则使用累积的
      if (thinkingContent) {
        this.snapshot.thinking.content = thinkingContent;
      }
      this.snapshot.thinking.isComplete = true;
      this.emit({
        type: 'thinking:complete',
        thinkingContent: this.snapshot.thinking.content,
      });
    }
  }

  // ==================== 工具调用 ====================

  /**
   * 通知 CLI 层添加 assistant 消息（包含 tool_calls）
   * 当 LLM 返回工具调用时，需要保存完整的 assistant 消息以确保历史加载时消息序列合法
   */
  addAssistantMessage(
    content: string,
    toolCalls: Array<{
      id: string;
      type: 'function';
      function: { name: string; arguments: string };
    }>
  ): void {
    this.emit({
      type: 'assistant:message',
      content,
      tool_calls: toolCalls,
    });
  }

  /**
   * 工具开始验证（最早的状态）
   * 在参数解析和工具定义获取阶段调用
   */
  startValidating(
    callId: string,
    toolName: string,
    toolCategory: string,
    paramsSummary: string,
    thinkingContent?: string
  ): void {
    const record: ToolCallRecord = {
      id: callId,
      toolName,
      toolCategory,
      params: {}, // 验证阶段可能还没完整参数
      paramsSummary,
      thinkingContent,
      status: ToolCallStatus.Pending, // 使用 Pending 状态
      startTime: Date.now(),
    };

    this.snapshot.currentToolCall = record;
    this.snapshot.state = ExecutionState.ToolExecuting;
    this.snapshot.stats.toolCallCount++;

    this.emit({
      type: 'tool:validating',
      toolCall: record,
    });
    this.emitStateChange();
  }

  /**
   * 更新为执行中（从 validating/awaiting → executing）
   * 重新开始计时
   */
  updateToExecuting(callId: string, params: Record<string, any>): void {
    if (this.snapshot.currentToolCall?.id === callId) {
      const record = this.snapshot.currentToolCall;
      record.status = ToolCallStatus.Executing;
      record.params = params; // 更新完整参数
      record.startTime = Date.now(); // ✅ 重新计时（从 executing 开始）

      this.emit({
        type: 'tool:executing',
        toolCall: { ...record },
      });
      this.emitStateChange();
    }
  }

  updateToolOutput(toolCallId: string, output: string): void {
    if (this.snapshot.currentToolCall?.id === toolCallId) {
      this.snapshot.currentToolCall.liveOutput = output;
      this.emit({ type: 'tool:output', toolCallId, output });
    }
  }

  completeToolCall(toolCallId: string, result: any, resultSummary: string): void {
    if (this.snapshot.currentToolCall?.id === toolCallId) {
      const record = this.snapshot.currentToolCall;
      record.status = ToolCallStatus.Success;
      record.endTime = Date.now();
      record.duration = record.endTime - record.startTime;
      record.result = result;
      record.resultSummary = resultSummary;

      this.snapshot.toolCallHistory.push(record);
      this.snapshot.currentToolCall = undefined;
      this.snapshot.state = ExecutionState.Thinking;

      this.emit({ type: 'tool:complete', toolCall: { ...record } });
      this.emitStateChange();
    }
  }

  errorToolCall(toolCallId: string, error: string): void {
    if (this.snapshot.currentToolCall?.id === toolCallId) {
      const record = this.snapshot.currentToolCall;
      record.status = ToolCallStatus.Error;
      record.endTime = Date.now();
      record.duration = record.endTime - record.startTime;
      record.error = error;

      this.snapshot.toolCallHistory.push(record);
      this.snapshot.currentToolCall = undefined;

      this.emit({ type: 'tool:error', toolCallId, error });
    }
  }

  /**
   * 工具等待用户确认
   * 当工具需要用户批准时调用
   */
  awaitingApproval(toolCallId: string, toolName: string, confirmDetails: ConfirmDetails): void {
    // ✅ 新增：保存工具信息，以便取消时使用
    const paramsSummary =
      confirmDetails.fileName || confirmDetails.filePath || confirmDetails.command || '';

    this.pendingConfirmInfo = {
      toolCallId,
      toolName,
      toolCategory: confirmDetails.type || 'builtin',
      paramsSummary,
    };

    // 更新当前工具调用状态（如果存在）
    if (this.snapshot.currentToolCall?.id === toolCallId) {
      this.snapshot.currentToolCall.status = ToolCallStatus.Pending; // 等待确认
    }

    this.snapshot.state = ExecutionState.WaitingConfirm;
    this.emit({
      type: 'tool:awaiting_approval',
      toolCallId,
      toolName,
      confirmDetails,
    });
    this.emitStateChange();
  }

  /**
   * 工具调用被取消
   * 当用户拒绝或取消工具执行时调用
   */
  cancelToolCall(toolCallId: string, reason: string): void {
    if (this.snapshot.currentToolCall?.id === toolCallId) {
      // 已经 startToolCall/startValidating，更新记录
      const record = this.snapshot.currentToolCall;
      record.status = ToolCallStatus.Cancelled;
      record.endTime = Date.now();
      record.duration = record.endTime - record.startTime;
      record.error = reason;

      this.snapshot.toolCallHistory.push(record);
      this.snapshot.currentToolCall = undefined;
      this.snapshot.state = ExecutionState.Thinking;

      // ✅ 包含工具信息
      this.emit({
        type: 'tool:cancelled',
        toolCallId,
        reason,
        toolName: record.toolName,
        toolCategory: record.toolCategory,
        paramsSummary: record.paramsSummary,
      });
      this.emitStateChange();
    } else {
      // ✅ 确认阶段取消（没有 startValidating），使用保存的 pendingConfirmInfo
      const info = this.pendingConfirmInfo;

      this.emit({
        type: 'tool:cancelled',
        toolCallId,
        reason,
        toolName: info?.toolName || 'unknown',
        toolCategory: info?.toolCategory || 'builtin',
        paramsSummary: info?.paramsSummary || '',
      });

      // 清理保存的信息
      this.pendingConfirmInfo = undefined;
    }
  }

  // ==================== 流式输出 ====================

  appendContent(delta: string): void {
    this.snapshot.streamingContent += delta;
    this.snapshot.state = ExecutionState.Streaming;
    this.emit({ type: 'content:delta', delta });
  }

  completeContent(): void {
    this.emit({
      type: 'content:complete',
      content: this.snapshot.streamingContent,
    });
  }

  // ==================== Token 统计 ====================

  updateStats(stats: Partial<ExecutionStats>, totalCost?: number): void {
    Object.assign(this.snapshot.stats, stats);
    this.snapshot.stats.totalTokens =
      this.snapshot.stats.inputTokens + this.snapshot.stats.outputTokens;
    this.emit({ type: 'stats:update', stats, totalCost });
  }

  incrementLoopCount(): void {
    this.snapshot.stats.loopCount++;
  }

  // ==================== 获取状态 ====================

  getSnapshot(): ExecutionSnapshot {
    return {
      ...this.snapshot,
      stats: {
        ...this.snapshot.stats,
        elapsedTime: this.snapshot.stats.startTime
          ? Math.floor((Date.now() - this.snapshot.stats.startTime) / 1000)
          : 0,
      },
      toolCallHistory: [...this.snapshot.toolCallHistory],
      currentToolCall: this.snapshot.currentToolCall
        ? { ...this.snapshot.currentToolCall }
        : undefined,
      thinking: this.snapshot.thinking ? { ...this.snapshot.thinking } : undefined,
    };
  }

  // ==================== 重置 ====================

  reset(): void {
    this.stopPhraseRotation();
    this.snapshot = this.createInitialSnapshot();
  }
}
