/**
 * 消息验证和清理工具
 *
 * 用于确保传给 LLM 的消息序列符合 API 规范：
 * - 每个 assistant 消息的 tool_calls 必须有对应的 tool 消息
 * - 每个 tool 消息必须有对应的 tool_call_id 在前面的 assistant.tool_calls 中
 *
 * 清理策略：
 * - 移除不完整的 assistant 消息（有 tool_calls 但缺少对应 tool 响应）
 * - 移除孤立的 tool 消息（没有对应的 tool_call_id）
 */

import { Message, ToolCall } from '../types.js';
import { logger } from '../../../utils/logger.js';

/**
 * 验证结果
 */
export interface SanitizeResult {
  /** 清理后的消息列表 */
  messages: Message[];
  /** 是否进行了清理 */
  sanitized: boolean;
  /** 移除的消息数量 */
  removedCount: number;
  /** 移除的消息详情（用于调试） */
  removedMessages: Array<{
    index: number;
    role: string;
    reason: string;
  }>;
}

/**
 * 获取 assistant 消息中的所有 tool_call_id
 */
function getToolCallIds(message: Message): Set<string> {
  const ids = new Set<string>();
  if (message.role === 'assistant' && message.tool_calls) {
    for (const toolCall of message.tool_calls) {
      ids.add(toolCall.id);
    }
  }
  return ids;
}

/**
 * 检查 assistant 消息的 tool_calls 是否都有对应的 tool 响应
 *
 * @param assistantMsg - assistant 消息
 * @param followingMessages - 该消息之后的所有消息
 * @returns 缺失的 tool_call_id 列表
 */
function findMissingToolResponses(
  assistantMsg: Message,
  followingMessages: Message[]
): string[] {
  if (!assistantMsg.tool_calls || assistantMsg.tool_calls.length === 0) {
    return [];
  }

  const expectedIds = getToolCallIds(assistantMsg);
  const foundIds = new Set<string>();

  // 只检查紧随其后的 tool 消息（直到遇到下一个非 tool 消息）
  for (const msg of followingMessages) {
    if (msg.role === 'tool' && msg.tool_call_id) {
      foundIds.add(msg.tool_call_id);
    } else if (msg.role !== 'tool') {
      // 遇到非 tool 消息，停止检查
      break;
    }
  }

  // 找出缺失的 tool_call_id
  const missing: string[] = [];
  for (const id of expectedIds) {
    if (!foundIds.has(id)) {
      missing.push(id);
    }
  }

  return missing;
}

/**
 * 查找孤立的 tool 消息（没有对应的 tool_call_id）
 *
 * @param messages - 消息列表
 * @returns 孤立 tool 消息的索引列表
 */
function findOrphanedToolMessages(messages: Message[]): number[] {
  const orphanedIndices: number[] = [];

  // 收集所有有效的 tool_call_id（从 assistant 消息中）
  const validToolCallIds = new Set<string>();
  for (const msg of messages) {
    if (msg.role === 'assistant' && msg.tool_calls) {
      for (const toolCall of msg.tool_calls) {
        validToolCallIds.add(toolCall.id);
      }
    }
  }

  // 检查每个 tool 消息是否有对应的 tool_call_id
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (msg.role === 'tool') {
      if (!msg.tool_call_id || !validToolCallIds.has(msg.tool_call_id)) {
        orphanedIndices.push(i);
      }
    }
  }

  return orphanedIndices;
}

/**
 * 清理消息列表，确保符合 LLM API 规范
 *
 * 规则：
 * 1. 每个带 tool_calls 的 assistant 消息后面必须紧跟对应的 tool 消息
 * 2. 每个 tool 消息必须有对应的 tool_call_id
 *
 * @param messages - 原始消息列表
 * @returns 清理结果
 */
export function sanitizeMessages(messages: Message[]): SanitizeResult {
  if (messages.length === 0) {
    return {
      messages: [],
      sanitized: false,
      removedCount: 0,
      removedMessages: [],
    };
  }

  const indicesToRemove = new Set<number>();
  const removedMessages: SanitizeResult['removedMessages'] = [];

  // 第一遍：找出不完整的 assistant 消息及其后续的孤立 tool 消息
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];

    if (msg.role === 'assistant' && msg.tool_calls && msg.tool_calls.length > 0) {
      const followingMessages = messages.slice(i + 1);
      const missingIds = findMissingToolResponses(msg, followingMessages);

      if (missingIds.length > 0) {
        // 标记这个 assistant 消息需要移除
        indicesToRemove.add(i);
        removedMessages.push({
          index: i,
          role: 'assistant',
          reason: `Missing tool responses for: ${missingIds.join(', ')}`,
        });

        // 同时移除这个 assistant 消息关联的所有 tool 消息
        const expectedIds = getToolCallIds(msg);
        for (let j = i + 1; j < messages.length; j++) {
          const followMsg = messages[j];
          if (followMsg.role === 'tool' && followMsg.tool_call_id) {
            if (expectedIds.has(followMsg.tool_call_id)) {
              indicesToRemove.add(j);
              removedMessages.push({
                index: j,
                role: 'tool',
                reason: `Associated with incomplete assistant message at index ${i}`,
              });
            }
          } else if (followMsg.role !== 'tool') {
            break;
          }
        }
      }
    }
  }

  // 第二遍：找出孤立的 tool 消息（在移除不完整 assistant 后可能产生）
  // 先构建临时消息列表（排除已标记移除的）
  const tempMessages = messages.filter((_, i) => !indicesToRemove.has(i));
  const orphanedInTemp = findOrphanedToolMessages(tempMessages);

  // 将临时索引映射回原始索引
  let tempIndex = 0;
  for (let i = 0; i < messages.length; i++) {
    if (!indicesToRemove.has(i)) {
      if (orphanedInTemp.includes(tempIndex)) {
        indicesToRemove.add(i);
        removedMessages.push({
          index: i,
          role: 'tool',
          reason: 'Orphaned tool message without corresponding tool_call_id',
        });
      }
      tempIndex++;
    }
  }

  // 构建最终的消息列表
  const sanitizedMessages = messages.filter((_, i) => !indicesToRemove.has(i));

  // 记录日志
  if (indicesToRemove.size > 0) {
    logger.warn('Messages sanitized', {
      removedCount: indicesToRemove.size,
      details: removedMessages,
    });
  }

  return {
    messages: sanitizedMessages,
    sanitized: indicesToRemove.size > 0,
    removedCount: indicesToRemove.size,
    removedMessages,
  };
}

/**
 * 验证消息列表是否符合 LLM API 规范（不修改，只检查）
 *
 * @param messages - 消息列表
 * @returns 是否有效
 */
export function validateMessages(messages: Message[]): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];

    // 检查 assistant 消息的 tool_calls
    if (msg.role === 'assistant' && msg.tool_calls && msg.tool_calls.length > 0) {
      const followingMessages = messages.slice(i + 1);
      const missingIds = findMissingToolResponses(msg, followingMessages);

      if (missingIds.length > 0) {
        errors.push(
          `Message[${i}]: assistant message has tool_calls but missing tool responses for: ${missingIds.join(', ')}`
        );
      }
    }

    // 检查 tool 消息的 tool_call_id
    if (msg.role === 'tool') {
      if (!msg.tool_call_id) {
        errors.push(`Message[${i}]: tool message missing tool_call_id`);
      }
    }
  }

  // 检查孤立的 tool 消息
  const orphaned = findOrphanedToolMessages(messages);
  for (const idx of orphaned) {
    errors.push(
      `Message[${idx}]: orphaned tool message with tool_call_id="${messages[idx].tool_call_id}"`
    );
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * 清理当前轮次的消息，保留已完成的部分
 *
 * 用于 ESC 中断时：
 * - 保留已完成的 assistant + tool 消息对
 * - 移除不完整的 assistant 消息（有 tool_calls 但缺少 tool 响应）
 *
 * @param messages - 当前轮次的消息
 * @returns 清理后的消息
 */
export function sanitizeCurrentTurn(messages: Message[]): SanitizeResult {
  return sanitizeMessages(messages);
}

