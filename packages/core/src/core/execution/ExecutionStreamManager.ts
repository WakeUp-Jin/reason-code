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
    this.handlers.forEach(handler => handler(event));
    // Web 端流式传输回调
    this.onStream?.(event);
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

  complete(): void {
    this.stopPhraseRotation();
    this.snapshot.state = ExecutionState.Completed;
    this.emit({ type: 'execution:complete', stats: { ...this.snapshot.stats } });
  }

  cancel(): void {
    this.stopPhraseRotation();
    this.snapshot.state = ExecutionState.Cancelled;
    this.emit({ type: 'execution:cancel' });
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
    this.phraseInterval = setInterval(() => {
      this.phraseIndex = (this.phraseIndex + 1) % STATUS_PHRASES.length;
      this.snapshot.statusPhrase = STATUS_PHRASES[this.phraseIndex]!;
      this.emitStateChange();
    }, 3000 + Math.random() * 2000);
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

  completeThinking(content?: string): void {
    if (this.snapshot.thinking) {
      // 如果传入了 content，使用传入的；否则使用累积的
      if (content) {
        this.snapshot.thinking.content = content;
      }
      this.snapshot.thinking.isComplete = true;
      this.emit({
        type: 'thinking:complete',
        content: this.snapshot.thinking.content
      });
    }
  }

  // ==================== 工具调用 ====================

  startToolCall(
    toolCall: Omit<ToolCallRecord, 'status' | 'startTime'>
  ): ToolCallRecord {
    const record: ToolCallRecord = {
      ...toolCall,
      status: ToolCallStatus.Executing,
      startTime: Date.now(),
    };

    this.snapshot.currentToolCall = record;
    this.snapshot.state = ExecutionState.ToolExecuting;
    this.snapshot.stats.toolCallCount++;

    this.emit({ type: 'tool:start', toolCall: record });
    this.emitStateChange();

    return record;
  }

  updateToolOutput(toolCallId: string, output: string): void {
    if (this.snapshot.currentToolCall?.id === toolCallId) {
      this.snapshot.currentToolCall.liveOutput = output;
      this.emit({ type: 'tool:output', toolCallId, output });
    }
  }

  completeToolCall(
    toolCallId: string,
    result: any,
    resultSummary: string
  ): void {
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

  // ==================== 流式输出 ====================

  appendContent(delta: string): void {
    this.snapshot.streamingContent += delta;
    this.snapshot.state = ExecutionState.Streaming;
    this.emit({ type: 'content:delta', delta });
  }

  completeContent(): void {
    this.emit({
      type: 'content:complete',
      content: this.snapshot.streamingContent
    });
  }

  // ==================== Token 统计 ====================

  updateStats(stats: Partial<ExecutionStats>): void {
    Object.assign(this.snapshot.stats, stats);
    this.snapshot.stats.totalTokens =
      this.snapshot.stats.inputTokens + this.snapshot.stats.outputTokens;
    this.emit({ type: 'stats:update', stats });
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
      thinking: this.snapshot.thinking
        ? { ...this.snapshot.thinking }
        : undefined,
    };
  }

  // ==================== 重置 ====================

  reset(): void {
    this.stopPhraseRotation();
    this.snapshot = this.createInitialSnapshot();
  }
}
