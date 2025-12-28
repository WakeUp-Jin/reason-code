/**
 * 执行流事件定义
 * 用于 Core 层与 CLI 层之间的事件通信
 */

import type {
  ExecutionState,
  ToolCallRecord,
  ExecutionStats
} from './types.js';

/**
 * 执行流事件类型
 */
export type ExecutionEvent =
  // 生命周期事件
  | { type: 'execution:start'; timestamp: number }
  | { type: 'execution:complete'; stats: ExecutionStats }
  | { type: 'execution:error'; error: string }
  | { type: 'execution:cancel' }

  // 状态事件
  | { type: 'state:change'; state: ExecutionState; phrase: string }

  // 思考事件（推理模型）
  | { type: 'thinking:start' }
  | { type: 'thinking:delta'; delta: string }
  | { type: 'thinking:complete'; content: string }

  // 工具事件
  | { type: 'tool:start'; toolCall: ToolCallRecord }
  | { type: 'tool:output'; toolCallId: string; output: string }
  | { type: 'tool:complete'; toolCall: ToolCallRecord }
  | { type: 'tool:error'; toolCallId: string; error: string }

  // 流式输出事件
  | { type: 'content:delta'; delta: string }
  | { type: 'content:complete'; content: string }

  // Token 统计事件
  | { type: 'stats:update'; stats: Partial<ExecutionStats> };

/**
 * 事件处理器类型
 */
export type ExecutionEventHandler = (event: ExecutionEvent) => void;

/**
 * 执行流事件发射器接口
 */
export interface ExecutionEventEmitter {
  on(handler: ExecutionEventHandler): () => void;
  emit(event: ExecutionEvent): void;
}
