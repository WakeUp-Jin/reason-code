/**
 * useExecutionMessages Hook
 * 监听执行事件，创建和更新 tool/thinking 消息
 */

import { useEffect, useRef } from 'react';
import { useExecution } from '../context/execution.js';
import { useAppStore, type ToolCallStatus, type Message } from '../context/store.js';
import type { ExecutionEvent } from '@reason-cli/core';
import { logger } from '../util/logger.js';

interface UseExecutionMessagesOptions {
  /** 当前会话 ID */
  sessionId: string | null;
  /** 当前 assistant 占位消息 ID（用于 insertMessageBefore） */
  assistantPlaceholderId: string | null;
}

/**
 * 将 Core 的 ToolCallStatus 映射到 CLI 的 ToolCallStatus
 */
function mapToolCallStatus(status: string): ToolCallStatus {
  switch (status) {
    case 'executing':
    case 'pending':
      return 'executing';
    case 'success':
      return 'success';
    case 'error':
    case 'cancelled':
      return 'error';
    default:
      return 'executing';
  }
}

export function useExecutionMessages(options: UseExecutionMessagesOptions) {
  const { sessionId, assistantPlaceholderId } = options;
  const { subscribe } = useExecution();

  // Store actions - 使用 getState 获取最新的 actions，避免依赖变化
  const getStoreActions = () => {
    const state = useAppStore.getState();
    return {
      insertMessageBefore: state.insertMessageBefore,
      updateMessage: state.updateMessage,
      addMessage: state.addMessage,
    };
  };

  // 跟踪已创建的 tool 消息 ID（toolCallId -> messageId）
  const toolMessageMapRef = useRef<Map<string, string>>(new Map());
  // 跟踪当前执行中的 thinking 消息 ID
  const thinkingMessageIdRef = useRef<string | null>(null);
  // 存储最新的参数值
  const optionsRef = useRef(options);
  optionsRef.current = options;

  // 订阅执行事件 - 只在 subscribe 变化时重新订阅
  useEffect(() => {
    const handleEvent = (event: ExecutionEvent) => {
      const { sessionId, assistantPlaceholderId } = optionsRef.current;
      if (!sessionId) return;

      const { insertMessageBefore, updateMessage, addMessage } = getStoreActions();

      switch (event.type) {
        case 'execution:start':
          // 重置追踪状态
          toolMessageMapRef.current.clear();
          thinkingMessageIdRef.current = null;
          logger.debug('Execution started, reset message tracking');
          break;

        case 'tool:start': {
          const { toolCall } = event;
          logger.debug('Tool start event', {
            toolName: toolCall.toolName,
            toolCallId: toolCall.id,
            thinkingContent: toolCall.thinkingContent?.slice(0, 50),
          });

          // 创建 tool 消息
          let message: Message;
          if (assistantPlaceholderId) {
            // 在 assistant 占位消息前插入
            message = insertMessageBefore(sessionId, assistantPlaceholderId, {
              role: 'tool',
              content: '',
              toolCall: {
                toolName: toolCall.toolName,
                toolCategory: toolCall.toolCategory,
                params: toolCall.params,
                paramsSummary: toolCall.paramsSummary,
                status: 'executing',
                thinkingContent: toolCall.thinkingContent,
              },
            });
          } else {
            // 没有占位消息，直接追加
            message = addMessage(sessionId, {
              role: 'tool',
              content: '',
              toolCall: {
                toolName: toolCall.toolName,
                toolCategory: toolCall.toolCategory,
                params: toolCall.params,
                paramsSummary: toolCall.paramsSummary,
                status: 'executing',
                thinkingContent: toolCall.thinkingContent,
              },
            });
          }

          // 记录映射
          toolMessageMapRef.current.set(toolCall.id, message.id);
          break;
        }

        case 'tool:complete': {
          const { toolCall } = event;
          const messageId = toolMessageMapRef.current.get(toolCall.id);

          logger.debug('Tool complete event', {
            toolName: toolCall.toolName,
            toolCallId: toolCall.id,
            messageId,
          });

          if (messageId) {
            // 更新 tool 消息状态
            updateMessage(sessionId, messageId, {
              toolCall: {
                toolName: toolCall.toolName,
                toolCategory: toolCall.toolCategory,
                params: toolCall.params,
                paramsSummary: toolCall.paramsSummary,
                status: mapToolCallStatus(toolCall.status),
                resultSummary: toolCall.resultSummary,
                duration: toolCall.duration,
              },
            });
          }
          break;
        }

        case 'tool:error': {
          const { toolCallId, error } = event;
          const messageId = toolMessageMapRef.current.get(toolCallId);

          logger.debug('Tool error event', { toolCallId, error, messageId });

          if (messageId) {
            // 更新 tool 消息状态为错误
            updateMessage(sessionId, messageId, {
              toolCall: {
                status: 'error',
                error,
              },
            });
          }
          break;
        }

        case 'thinking:start': {
          // thinking:start 不创建消息
          // 推理模型的内容会在 thinking:complete 时一次性创建
          logger.debug('Thinking start event');
          break;
        }

        case 'thinking:delta': {
          // 暂不支持流式 thinking 显示
          // TODO: 后续支持流式推理内容显示
          break;
        }

        case 'thinking:complete': {
          const { content } = event;

          logger.debug('Thinking complete event', { contentLength: content?.length || 0 });

          // 只有当有内容时才创建 thinking 消息（推理模型的长推理内容）
          if (content && content.trim().length > 0) {
            if (assistantPlaceholderId) {
              const message = insertMessageBefore(sessionId, assistantPlaceholderId, {
                role: 'thinking',
                content,
              });
              thinkingMessageIdRef.current = message.id;
            } else {
              const message = addMessage(sessionId, {
                role: 'thinking',
                content,
              });
              thinkingMessageIdRef.current = message.id;
            }
          }
          break;
        }

        case 'execution:complete':
        case 'execution:error':
        case 'execution:cancel':
          // 清理追踪状态
          toolMessageMapRef.current.clear();
          thinkingMessageIdRef.current = null;
          break;
      }
    };

    const unsubscribe = subscribe(handleEvent);
    return unsubscribe;
  }, [subscribe]);
}
