/**
 * useExecutionMessages Hook
 * 监听执行事件，创建和更新 tool/thinking 消息
 */

import { useEffect, useRef } from 'react';
import { useExecutionState } from '../context/execution.js';
import { useAppStore, type ToolCallStatus, type Message } from '../context/store.js';
import {
  ToolCallStatus as CoreToolCallStatus,
  type ExecutionEvent,
  type TodoItem,
  type TodoWriteResult,
} from '@reason-cli/core';
import { logger } from '../util/logger.js';
import { safeJsonParse } from '../util/json.js';

interface UseExecutionMessagesOptions {
  /** 当前会话 ID */
  sessionId: string | null;
  /** 当前 assistant 占位消息 ID（用于 insertMessageBefore） */
  assistantPlaceholderId: string | null;
}

/**
 * 将 Core 的 ToolCallStatus 映射到 CLI 的 ToolCallStatus
 */
function mapToolCallStatus(status: CoreToolCallStatus): ToolCallStatus {
  switch (status) {
    case CoreToolCallStatus.Executing:
    case CoreToolCallStatus.Pending:
      return CoreToolCallStatus.Executing;
    case CoreToolCallStatus.Success:
      return CoreToolCallStatus.Success;
    case CoreToolCallStatus.Error:
    case CoreToolCallStatus.Cancelled:
      return CoreToolCallStatus.Error;
    default:
      return CoreToolCallStatus.Executing;
  }
}

export function useExecutionMessages(options: UseExecutionMessagesOptions) {
  const { sessionId, assistantPlaceholderId } = options;
  const { subscribe, setTodos } = useExecutionState();

  // Store actions - 使用 getState 获取最新的 actions，避免依赖变化
  const getStoreActions = () => {
    const state = useAppStore.getState();
    return {
      insertMessageBefore: state.insertMessageBefore,
      updateMessage: state.updateMessage,
      addMessage: state.addMessage,
      addNotice: state.addNotice,
      updateNotice: state.updateNotice,
    };
  };

  // 跟踪已创建的 tool 消息 ID（toolCallId -> messageId）
  const toolMessageMapRef = useRef<Map<string, string>>(new Map());
  // 跟踪当前执行中的 thinking 消息 ID
  const thinkingMessageIdRef = useRef<string | null>(null);
  // 跟踪当前压缩通知 ID（用于更新）
  const compressionNoticeIdRef = useRef<string | null>(null);
  // 存储最新的参数值
  const optionsRef = useRef(options);
  optionsRef.current = options;

  // 订阅执行事件 - 只在 subscribe 变化时重新订阅
  useEffect(() => {
    const handleEvent = (event: ExecutionEvent) => {
      const { sessionId, assistantPlaceholderId } = optionsRef.current;
      if (!sessionId) return;

      const { insertMessageBefore, updateMessage, addMessage, addNotice, updateNotice } = getStoreActions();

      switch (event.type) {
        case 'execution:start':
          // 重置追踪状态
          toolMessageMapRef.current.clear();
          thinkingMessageIdRef.current = null;
          compressionNoticeIdRef.current = null;
          logger.debug('Execution started, reset message tracking');
          break;

        case 'assistant:message': {
          // 保存 assistant 消息（包含 tool_calls）
          // 这个消息会在 tool 消息之前被添加，确保历史加载时序列合法
          const { content, tool_calls } = event;
          logger.debug('Assistant message event', {
            contentLength: content.length,
            toolCallsCount: tool_calls.length,
          });

          if (assistantPlaceholderId) {
            // 在 assistant 占位消息前插入
            insertMessageBefore(sessionId, assistantPlaceholderId, {
              role: 'assistant',
              content,
              tool_calls,
            });
          } else {
            // 没有占位消息，直接追加
            addMessage(sessionId, {
              role: 'assistant',
              content,
              tool_calls,
            });
          }
          break;
        }

        case 'tool:validating': {
          const { toolCall } = event;

          logger.debug('Tool validating event', {
            toolName: toolCall.toolName,
            toolCallId: toolCall.id,
          });

          // ✅ 创建 tool 消息（最早的状态）
          let message: Message;
          if (assistantPlaceholderId) {
            message = insertMessageBefore(sessionId, assistantPlaceholderId, {
              role: 'tool',
              content: '', // 暂时为空，等待 tool:complete 时填充
              // ✅ API 标准字段
              tool_call_id: toolCall.id, // 对应的 tool_call id
              name: toolCall.toolName, // 工具名称
              // CLI 自定义字段（用于 UI 显示）
              toolCall: {
                toolName: toolCall.toolName,
                toolCategory: toolCall.toolCategory,
                params: toolCall.params,
                paramsSummary: toolCall.paramsSummary,
                status: CoreToolCallStatus.Pending, // 使用枚举值
                thinkingContent: toolCall.thinkingContent,
              },
            });
          } else {
            message = addMessage(sessionId, {
              role: 'tool',
              content: '', // 暂时为空，等待 tool:complete 时填充
              // ✅ API 标准字段
              tool_call_id: toolCall.id, // 对应的 tool_call id
              name: toolCall.toolName, // 工具名称
              // CLI 自定义字段（用于 UI 显示）
              toolCall: {
                toolName: toolCall.toolName,
                toolCategory: toolCall.toolCategory,
                params: toolCall.params,
                paramsSummary: toolCall.paramsSummary,
                status: CoreToolCallStatus.Pending, // 使用枚举值
                thinkingContent: toolCall.thinkingContent,
              },
            });
          }

          // 记录映射（用于后续更新）
          toolMessageMapRef.current.set(toolCall.id, message.id);
          break;
        }

        case 'tool:awaiting_approval': {
          const { toolCallId } = event;
          const messageId = toolMessageMapRef.current.get(toolCallId);

          logger.debug('Tool awaiting approval event', { toolCallId, messageId });

          if (messageId) {
            // ✅ 更新消息状态为等待确认
            updateMessage(sessionId, messageId, {
              toolCall: {
                status: CoreToolCallStatus.Pending, // 使用枚举值
                resultSummary: 'waiting for approval...',
              },
            });
          }
          break;
        }

        case 'tool:executing': {
          const { toolCall } = event;
          const messageId = toolMessageMapRef.current.get(toolCall.id);

          logger.debug('Tool executing event', { toolCallId: toolCall.id, messageId });

          if (messageId) {
            // ✅ 更新消息状态为执行中（开始计时）
            updateMessage(sessionId, messageId, {
              toolCall: {
                status: CoreToolCallStatus.Executing, // 使用枚举值
                params: toolCall.params, // 更新完整参数
                resultSummary: undefined, // 清除之前的提示文本
              },
            });
          }
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
            // ✅ 更新 tool 消息状态和内容
            updateMessage(sessionId, messageId, {
              // ✅ API 标准字段：更新 content 为实际输出
              content: toolCall.result || toolCall.resultSummary || 'Tool execution completed',
              // CLI 自定义字段
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

          // ✅ TodoWrite 工具完成时，更新 ExecutionContext 的 todos 状态
          if (toolCall.toolName === 'TodoWrite') {
            const result = safeJsonParse<TodoWriteResult>(toolCall.result, {
              success: false,
              data: null,
            });
            if (result.data && result.data.todos.length > 0) {
              setTodos(result.data.todos);
              logger.debug('Updated todos from TodoWrite', { count: result.data.todos.length });
            }
          }
          break;
        }

        case 'tool:error': {
          const { toolCallId, error } = event;
          const messageId = toolMessageMapRef.current.get(toolCallId);

          logger.debug('Tool error event', { toolCallId, error, messageId });

          if (messageId) {
            // ✅ 更新 tool 消息状态为错误
            updateMessage(sessionId, messageId, {
              // ✅ API 标准字段：更新 content 为错误信息
              content: `Error: ${error}`,
              // CLI 自定义字段
              toolCall: {
                status: CoreToolCallStatus.Error, // 使用枚举值
                error,
              },
            });
          }
          break;
        }

        case 'tool:cancelled': {
          const { toolCallId, reason, toolName, toolCategory, paramsSummary } = event;
          const messageId = toolMessageMapRef.current.get(toolCallId);

          logger.debug('Tool cancelled event', { toolCallId, reason, messageId });

          if (messageId) {
            // ✅ 更新已存在的消息
            updateMessage(sessionId, messageId, {
              // ✅ API 标准字段：更新 content 为取消原因
              content: `Cancelled: ${reason}`,
              // CLI 自定义字段
              toolCall: {
                status: CoreToolCallStatus.Cancelled, // 使用枚举值
                error: reason,
                resultSummary: '已取消',
              },
            });
          } else {
            // 理论上不会发生（因为 validating 时已创建）
            logger.warn('Tool cancelled but message not found', { toolCallId });
          }
          break;
        }

        case 'tool:progress': {
          // 子代理工具进度事件（TaskTool 专用）
          const { toolCallId, progress } = event;
          const messageId = toolMessageMapRef.current.get(toolCallId);

          logger.debug('Tool progress event', {
            toolCallId,
            progressType: progress.type,
            subToolCallId: progress.subToolCallId,
            toolName: progress.toolName,
            status: progress.status,
          });

          if (!messageId) break;

          // 获取当前消息
          const messages = useAppStore.getState().messages[sessionId] || [];
          const currentMessage = messages.find((m) => m.id === messageId);
          if (!currentMessage?.toolCall) break;

          const currentSummary = currentMessage.toolCall.subAgentSummary || [];
          let newSummary: typeof currentSummary;

          if (progress.type === 'tool_start') {
            // 添加新的子工具
            newSummary = [
              ...currentSummary,
              {
                id: progress.subToolCallId,
                tool: progress.toolName,
                status: 'running' as const,
              },
            ];
          } else if (progress.type === 'tool_complete') {
            // 更新子工具状态
            newSummary = currentSummary.map((item) =>
              item.id === progress.subToolCallId
                ? { ...item, status: progress.status, title: progress.resultSummary }
                : item
            );
          } else {
            break;
          }

          // 更新消息
          updateMessage(sessionId, messageId, {
            toolCall: {
              subAgentSummary: newSummary,
            },
          });
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
          const { thinkingContent } = event;

          logger.debug('Thinking complete event', { contentLength: thinkingContent?.length || 0 });

          // 只有当有内容时才创建 thinking 消息（推理模型的长推理内容）
          if (thinkingContent && thinkingContent.trim().length > 0) {
            if (assistantPlaceholderId) {
              const message = insertMessageBefore(sessionId, assistantPlaceholderId, {
                role: 'thinking',
                content: thinkingContent,
              });
              thinkingMessageIdRef.current = message.id;
            } else {
              const message = addMessage(sessionId, {
                role: 'thinking',
                content: thinkingContent,
              });
              thinkingMessageIdRef.current = message.id;
            }
          }
          break;
        }

        case 'execution:complete': {
          // 保存 token 统计到最后一条 assistant 消息
          const { stats, cost: eventCost } = event as any;
          if (stats) {
            const sessionMessages = useAppStore.getState().messages[sessionId] || [];
            // 查找最后一条 assistant 消息
            const lastAssistantMsg = sessionMessages
              .slice()
              .reverse()
              .find((m) => m.role === 'assistant');

            if (lastAssistantMsg) {
              const currentModel = useAppStore.getState().currentModel;

              // 更新消息 metadata
              // cost 直接使用事件中传递的费用（CNY），如果没有则为 0
              updateMessage(sessionId, lastAssistantMsg.id, {
                metadata: {
                  tokenUsage: {
                    inputTokens: stats.inputTokens,
                    outputTokens: stats.outputTokens,
                    totalTokens: stats.totalTokens,
                    cacheHitTokens: stats.cacheHitTokens,
                    cacheMissTokens: stats.cacheMissTokens,
                    reasoningTokens: stats.reasoningTokens,
                  },
                  model: currentModel,
                  cost: eventCost ?? 0, // 单次费用（CNY）
                },
              });

              logger.info('✅ Saved token stats to assistant message', {
                messageId: lastAssistantMsg.id,
                tokens: stats.totalTokens,
                inputTokens: stats.inputTokens,
                outputTokens: stats.outputTokens,
                cacheHitTokens: stats.cacheHitTokens,
                cacheMissTokens: stats.cacheMissTokens,
                cost: eventCost,
                model: currentModel,
              });
            } else {
              logger.warn('⚠️ No assistant message found to save token stats');
            }
          } else {
            logger.warn('⚠️ No stats in execution:complete event');
          }

          // 清理追踪状态
          toolMessageMapRef.current.clear();
          thinkingMessageIdRef.current = null;
          compressionNoticeIdRef.current = null;
          break;
        }

        case 'compression:start': {
          const { tokenUsage } = event;

          // 获取最后一条【非 streaming】消息的 ID
          // 压缩触发时，当前 loop 之前的工具调用已经完成并添加到 messages
          // 但 assistant 占位消息（isStreaming=true）在最后，需要跳过它
          const sessionMessages = useAppStore.getState().messages[sessionId] || [];
          const nonStreamingMessages = sessionMessages.filter((m) => !m.isStreaming);
          const lastNonStreamingMsg = nonStreamingMessages[nonStreamingMessages.length - 1];

          logger.info('Compression start event', {
            tokenUsage,
            totalMessages: sessionMessages.length,
            nonStreamingMessages: nonStreamingMessages.length,
            afterMessageId: lastNonStreamingMsg?.id,
            afterMessageRole: lastNonStreamingMsg?.role,
          });

          // 创建压缩中通知，位置在最后一条非 streaming 消息之后
          const noticeId = addNotice({
            type: 'compression-pending',
            afterMessageId: lastNonStreamingMsg?.id,
            data: {
              isPending: true,
              tokenUsage,
            },
          });
          compressionNoticeIdRef.current = noticeId;
          break;
        }

        case 'compression:complete': {
          const { result } = event;
          logger.debug('Compression complete event', {
            originalTokens: result.originalTokens,
            compressedTokens: result.compressedTokens,
            savedPercentage: result.savedPercentage,
            retainedFiles: result.retainedFiles.length,
          });

          // 更新压缩通知为完成状态
          // 注意：不更新 afterMessageId，保持在压缩开始时的位置
          // 这样 Checkpoint 会出现在触发压缩的消息之后，而不是整个 loop 结束后
          if (compressionNoticeIdRef.current) {
            updateNotice(compressionNoticeIdRef.current, {
              type: 'compression-complete',
              data: {
                isPending: false,
                originalTokens: result.originalTokens,
                compressedTokens: result.compressedTokens,
                originalCount: result.originalCount,
                compressedCount: result.compressedCount,
                savedPercentage: result.savedPercentage,
                retainedFiles: result.retainedFiles,
              },
            });
            compressionNoticeIdRef.current = null;
          }
          break;
        }

        case 'execution:error':
        case 'execution:cancel':
          // 清理追踪状态
          toolMessageMapRef.current.clear();
          thinkingMessageIdRef.current = null;
          compressionNoticeIdRef.current = null;
          break;
      }
    };

    const unsubscribe = subscribe(handleEvent);
    return unsubscribe;
  }, [subscribe]);
}
