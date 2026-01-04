/**
 * CLI Message <-> Core Message 转换器
 * 将 CLI 层的 Message 类型转换为 Core 层的 Message 类型
 */

import type { Message as CliMessage } from '../context/store.js';
import type { Message as CoreMessage } from '@reason-cli/core';

/**
 * CLI Message -> Core Message
 * 简单转换，复用 Core 层现有的 Message 类型
 *
 * @param cliMessage - CLI 层的消息
 * @returns Core 层的消息
 */
export function convertToCoreMessage(cliMessage: CliMessage): CoreMessage {
  const baseMessage: CoreMessage = {
    role: cliMessage.role === 'thinking' ? 'assistant' : (cliMessage.role as CoreMessage['role']),
    content: cliMessage.content,
  };

  // 如果是 assistant 消息且有 tool_calls，保留 tool_calls
  if (cliMessage.role === 'assistant' && cliMessage.tool_calls) {
    return {
      ...baseMessage,
      tool_calls: cliMessage.tool_calls,
    };
  }

  // 如果是工具消息，添加工具调用相关字段
  if (cliMessage.toolCall && cliMessage.role === 'tool') {
    return {
      ...baseMessage,
      tool_call_id: cliMessage.id,
      name: cliMessage.toolCall.toolName,
    };
  }

  return baseMessage;
}

/**
 * CLI Messages -> Core Messages
 * 批量转换，过滤掉 UI 专用的消息类型
 *
 * @param cliMessages - CLI 层的消息数组
 * @returns Core 层的消息数组
 */
export function convertToCoreMsgs(cliMessages: CliMessage[]): CoreMessage[] {
  return cliMessages
    .filter((msg) => msg.role !== 'thinking') // 过滤 UI 专用的 thinking 类型
    .filter((msg) => !msg.isStreaming) // 过滤流式消息（未完成）
    .map(convertToCoreMessage);
}

