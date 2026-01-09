# Core 层实现

## 1. 概述

Core 层负责执行流的状态管理和事件发射，不包含任何 UI 逻辑。

## 2. 执行流管理器

```typescript
// packages/core/src/core/execution/ExecutionStreamManager.ts

import { ExecutionEvent, ExecutionEventEmitter } from './events.js';
import {
  ExecutionState,
  ExecutionSnapshot,
  ToolCallRecord,
  ToolCallStatus,
  ExecutionStats,
  ThinkingContent
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
 * 执行流管理器
 * 管理 Agent 执行过程中的状态、工具调用、统计信息
 */
export class ExecutionStreamManager implements ExecutionEventEmitter {
  private handlers: Set<(event: ExecutionEvent) => void> = new Set();
  private snapshot: ExecutionSnapshot;
  private phraseIndex = 0;
  private phraseInterval?: ReturnType<typeof setInterval>;

  constructor() {
    this.snapshot = this.createInitialSnapshot();
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

  on(handler: (event: ExecutionEvent) => void): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  emit(event: ExecutionEvent): void {
    this.handlers.forEach(handler => handler(event));
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
    this.emit({ type: 'execution:complete', stats: this.snapshot.stats });
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

  completeThinking(): void {
    if (this.snapshot.thinking) {
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

      this.emit({ type: 'tool:complete', toolCall: record });
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
    };
  }

  // ==================== 重置 ====================

  reset(): void {
    this.stopPhraseRotation();
    this.snapshot = this.createInitialSnapshot();
  }
}
```

## 3. 结果摘要生成器

```typescript
// packages/core/src/core/execution/summaryGenerators.ts

import type { ToolResultSummaryGenerator, SummaryGeneratorRegistry } from './types.js';

/**
 * 内置的摘要生成器
 */
export const defaultSummaryGenerators: SummaryGeneratorRegistry = {
  // 读取文件
  ReadFile: (_, params, result) => {
    const lines = result?.lines || result?.content?.split('\n').length || 0;
    const path = params.file_path || params.path || 'file';
    return `Read ${lines} lines from ${path}`;
  },

  Read: (_, params, result) => {
    const lines = result?.lines || result?.content?.split('\n').length || 0;
    const path = params.file_path || params.path || 'file';
    return `Read ${lines} lines from ${path}`;
  },

  // Glob 搜索
  Glob: (_, params, result) => {
    const count = Array.isArray(result) ? result.length : 0;
    return `Found ${count} files matching ${params.pattern}`;
  },

  // Grep 搜索
  Grep: (_, params, result) => {
    const matches = result?.matches || result?.length || 0;
    return `Found ${matches} matches for "${params.pattern}"`;
  },

  // Bash 命令
  Bash: (_, params, result) => {
    const exitCode = result?.exitCode ?? 0;
    const status = exitCode === 0 ? 'completed' : `failed (exit ${exitCode})`;
    return `Command ${status}`;
  },

  // 写入文件
  WriteFile: (_, params) => {
    const path = params.file_path || params.path || 'file';
    return `Wrote to ${path}`;
  },

  Write: (_, params) => {
    const path = params.file_path || params.path || 'file';
    return `Wrote to ${path}`;
  },

  // 编辑文件
  Edit: (_, params) => {
    const path = params.file_path || params.path || 'file';
    return `Edited ${path}`;
  },

  // 列出文件
  ListFiles: (_, params, result) => {
    const count = Array.isArray(result) ? result.length : 0;
    const path = params.path || params.directory || '.';
    return `Listed ${count} items in ${path}`;
  },

  // 默认
  default: (toolName, _, result) => {
    if (result?.success === false) return `${toolName} failed`;
    return `${toolName} completed`;
  },
};

/**
 * 生成工具结果摘要
 */
export function generateSummary(
  toolName: string,
  params: Record<string, any>,
  result: any,
  customGenerators?: SummaryGeneratorRegistry
): string {
  const generators = { ...defaultSummaryGenerators, ...customGenerators };
  const generator = generators[toolName] || generators.default;
  return generator(toolName, params, result);
}

/**
 * 生成参数摘要
 */
export function generateParamsSummary(
  toolName: string,
  params: Record<string, any>
): string {
  // 根据工具类型提取主要参数
  switch (toolName) {
    case 'Read':
    case 'ReadFile':
    case 'Write':
    case 'WriteFile':
    case 'Edit':
      return params.file_path || params.path || '';

    case 'Glob':
      return params.pattern || '';

    case 'Grep':
      return params.pattern || '';

    case 'Bash':
      const cmd = params.command || '';
      return cmd.length > 30 ? cmd.slice(0, 30) + '...' : cmd;

    case 'ListFiles':
      return params.path || params.directory || '.';

    default:
      // 尝试找到第一个字符串参数
      const firstString = Object.values(params).find(
        v => typeof v === 'string'
      );
      if (firstString && typeof firstString === 'string') {
        return firstString.length > 30
          ? firstString.slice(0, 30) + '...'
          : firstString;
      }
      return '';
  }
}
```

## 4. 索引导出

```typescript
// packages/core/src/core/execution/index.ts

export * from './types.js';
export * from './events.js';
export { ExecutionStreamManager } from './ExecutionStreamManager.js';
export {
  defaultSummaryGenerators,
  generateSummary,
  generateParamsSummary
} from './summaryGenerators.js';
```

## 5. 与 Agent 集成示例

```typescript
// 在 Agent 执行时使用
import { ExecutionStreamManager, generateSummary, generateParamsSummary } from './execution/index.js';

class Agent {
  private executionStream: ExecutionStreamManager;

  constructor() {
    this.executionStream = new ExecutionStreamManager();
  }

  async run(userInput: string) {
    // 开始执行
    this.executionStream.start();

    try {
      // 开始思考
      this.executionStream.startThinking();

      // LLM 返回思考内容时
      // this.executionStream.appendThinking(thinkingDelta);

      // 思考完成
      this.executionStream.completeThinking();

      // 工具调用
      const toolCallRecord = this.executionStream.startToolCall({
        id: 'tool-1',
        toolName: 'Read',
        toolCategory: 'filesystem',
        params: { file_path: 'src/app.tsx' },
        paramsSummary: generateParamsSummary('Read', { file_path: 'src/app.tsx' }),
      });

      // 执行工具...
      const result = await this.executeTool('Read', { file_path: 'src/app.tsx' });

      // 完成工具调用
      this.executionStream.completeToolCall(
        toolCallRecord.id,
        result,
        generateSummary('Read', { file_path: 'src/app.tsx' }, result)
      );

      // 更新 Token 统计
      this.executionStream.updateStats({
        inputTokens: 500,
        outputTokens: 200,
      });

      // 完成执行
      this.executionStream.complete();

    } catch (error) {
      this.executionStream.error(error.message);
    }
  }

  // 获取执行流事件发射器供 CLI 订阅
  getExecutionStream(): ExecutionStreamManager {
    return this.executionStream;
  }
}
```
