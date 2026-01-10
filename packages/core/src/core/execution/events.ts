/**
 * 执行流事件定义
 * 用于 Core 层与 CLI 层之间的事件通信
 */

import type { ExecutionState, ToolCallRecord, ExecutionStats } from './types.js';
import type { ConfirmDetails } from '../tool/types.js';

/**
 * 执行流事件类型
 */
export type ExecutionEvent =
  // 生命周期事件
  | { type: 'execution:start'; timestamp: number }
  | { type: 'execution:complete'; stats: ExecutionStats; cost?: number } // cost: 单次费用（CNY）
  | { type: 'execution:error'; error: string }
  | { type: 'execution:cancel'; reason?: string }

  // 状态事件
  | { type: 'state:change'; state: ExecutionState; phrase: string }

  // 思考事件（推理模型）
  | { type: 'thinking:start' }
  | { type: 'thinking:delta'; delta: string }
  | { type: 'thinking:complete'; thinkingContent: string }

  // Assistant 消息事件（用于同步包含 tool_calls 的消息）
  | {
      type: 'assistant:message';
      content: string;
      tool_calls: Array<{
        id: string;
        type: 'function';
        function: { name: string; arguments: string };
      }>;
    }

  // 工具事件
  | { type: 'tool:validating'; toolCall: ToolCallRecord } // ✅ 工具开始验证
  | { type: 'tool:executing'; toolCall: ToolCallRecord } // ✅ 工具进入执行状态
  | { type: 'tool:output'; toolCallId: string; output: string }
  | { type: 'tool:complete'; toolCall: ToolCallRecord }
  | { type: 'tool:error'; toolCallId: string; error: string }
  | {
      type: 'tool:awaiting_approval';
      toolCallId: string;
      toolName: string;
      confirmDetails: ConfirmDetails;
    }
  | {
      type: 'tool:cancelled';
      toolCallId: string;
      reason: string;
      // ✅ 新增：包含工具信息
      toolName: string;
      toolCategory: string;
      paramsSummary: string;
    }

  // 流式输出事件
  | { type: 'content:delta'; delta: string }
  | { type: 'content:complete'; content: string }

  // Token 统计事件
  | { type: 'stats:update'; stats: Partial<ExecutionStats>; totalCost?: number };

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
