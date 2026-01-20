/**
 * 消息转换工具
 *
 * 用于 CLI Message 和 Core StoredMessage 之间的转换
 *
 * 📌 转换原则：
 * - CLI Message 包含运行时字段（isStreaming）
 * - Core StoredMessage 只包含持久化字段
 * - metadata 和 toolCall 自动兼容（结构相同，类型不同）
 */

import type { StoredMessage } from '@reason-code/core';
import type { Message } from '../context/store.js';

/**
 * 过滤掉 CLI 专用的瞬态字段，返回可持久化的消息
 *
 * CLI Message → Core StoredMessage（保存时用）
 *
 * @param message - CLI 运行时消息
 * @returns 可持久化的消息
 *
 * @example
 * const cliMessage: Message = {
 *   id: '1',
 *   sessionId: 'session_1',
 *   role: 'user',
 *   content: 'Hello',
 *   timestamp: Date.now(),
 *   isStreaming: false,  // ← 会被过滤掉
 *   metadata: { model: 'gpt-4' }
 * };
 *
 * const stored = filterForStorage(cliMessage);
 * // stored 不包含 isStreaming
 */
export function filterForStorage(message: Message): StoredMessage {
  // 解构出 CLI 专用的瞬态字段，其余作为持久化数据
  const { isStreaming, ...stored } = message;
  return stored;
}

/**
 * 从存储的消息恢复为 CLI 消息（添加默认值）
 *
 * Core StoredMessage → CLI Message（加载时用）
 *
 * @param stored - 持久化的消息
 * @returns CLI 运行时消息
 *
 * @example
 * const storedMessages = await Session.loadMessages(sessionId);
 * const cliMessages = storedMessages.map(restoreFromStorage);
 * // 每条消息都会添加 isStreaming: false
 */
export function restoreFromStorage(stored: StoredMessage): Message {
  return {
    ...stored,
    isStreaming: false,  // ← 添加默认值
  } as Message;  // ← 类型断言，因为 metadata 和 toolCall 类型不同但结构兼容
}
