/**
 * useAgent Hook
 * 管理 Agent 实例，处理初始化、模型切换和工具确认
 *
 * 重要：
 * - Agent 实例使用模块级变量存储，跨 remount 持久化
 * - 采用内存优先架构：Core 维护运行时状态，文件异步持久化
 * - Token 从内存实时计算，Cost 累计保存到检查点
 */

import { useEffect, useState, useCallback } from 'react';
import { agentManager, Agent, Session, type SessionCheckpoint } from '@reason-code/core';
import type {
  ConfirmDetails,
  ConfirmOutcome,
  ApprovalMode,
  CompressionCompleteEvent,
  SystemPromptContext,
} from '@reason-code/core';
import os from 'os';
import { configManager } from '../config/manager.js';
import { getModelTokenLimit, getModelPricing } from '../config/tokenLimits.js';
import { logger } from '../util/logger.js';
import { agentLogger } from '../util/logUtils.js';
import { useExecutionState } from '../context/execution.js';
import { useAppStore } from '../context/store.js';
import { convertToCoreMsgs } from '../util/messageConverter.js';
import { filterForStorage } from '../util/messageUtils.js';

// ==================== 模块级变量（跨 remount 持久化）====================
let agentInstance: Agent | null = null;
let agentInitialized = false;
let agentInitFailed = false;
let agentInitError: string | null = null;
let agentInitPromise: Promise<void> | null = null;
let currentModelInfo: { provider: string; model: string } | null = null;

/** 当前会话是否已初始化上下文（避免重复加载） */
let contextInitializedForSession: string | null = null;

/** sendMessage 选项 */
interface SendMessageOptions {
  /** 工具确认回调（由调用方提供） */
  onConfirmRequired?: (
    callId: string,
    toolName: string,
    details: ConfirmDetails
  ) => Promise<ConfirmOutcome>;
}

interface UseAgentReturn {
  /** Agent 是否已初始化 */
  isReady: boolean;
  /** 是否正在加载 */
  isLoading: boolean;
  /** 错误信息 */
  error: string | null;
  /** 发送消息给 Agent */
  sendMessage: (message: string, options?: SendMessageOptions) => Promise<string | null>;
  /** 切换模型 */
  switchModel: (provider: string, model: string) => Promise<void>;
  /** 当前模型信息 */
  currentModel: { provider: string; model: string } | null;
  /** 中断当前执行 */
  abort: () => void;
  /** 是否正在执行 */
  isRunning: () => boolean;
}

/**
 * 解析模型 ID
 * 格式：provider/model 或 model（默认 deepseek）
 */
function parseModelId(modelId: string): { provider: string; model: string } {
  if (modelId.includes('/')) {
    const [provider, model] = modelId.split('/');
    return { provider, model };
  }
  // 默认使用 deepseek
  return { provider: 'deepseek', model: modelId };
}

/**
 * 构建 LLM 上下文
 * 如果有检查点，使用摘要 + 部分历史；否则使用完整历史
 */
function buildContextForLLM(
  sessionId: string,
  messages: any[]
): { needsInit: boolean; checkpoint: SessionCheckpoint | null } {
  // 检查是否需要初始化
  if (contextInitializedForSession === sessionId) {
    return { needsInit: false, checkpoint: null };
  }

  // 注意：这里返回 null，实际的 checkpoint 加载在 useAgent 中异步进行
  return { needsInit: true, checkpoint: null };
}

export function useAgent(): UseAgentReturn {
  // 从模块级变量初始化状态
  const [isReady, setIsReady] = useState(agentInitialized && agentInstance !== null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(agentInitError);
  const [currentModel, setCurrentModel] = useState<{ provider: string; model: string } | null>(
    currentModelInfo
  );
  const { bindManager } = useExecutionState();

  // 从 store 获取配置
  const approvalMode = useAppStore((state) => state.config.approvalMode);
  const exchangeRate = useAppStore((state) => state.config.exchangeRate);

  // 内部初始化函数
  const initAgentInternal = useCallback(async (): Promise<void> => {
    try {
      setIsLoading(true);
      setError(null);

      // 加载配置
      const config = configManager.loadConfig();
      const { provider, model } = parseModelId(config.model.current);

      // 获取 provider 配置
      const providerConfig = config.providers?.[provider];
      if (!providerConfig?.apiKey) {
        throw new Error(
          `API key not found for provider: ${provider}. Please set ${provider.toUpperCase()}_API_KEY in your environment or config file.`
        );
      }

      // 配置 AgentManager
      agentManager.configure({
        apiKey: providerConfig.apiKey,
        baseURL: providerConfig.baseUrl,
      });

      // 创建 Agent（传递模型配置）
      const agent = agentManager.createAgent('build', {
        model: { provider, model },
      });

      // 构建系统提示词上下文
      const promptContext: SystemPromptContext = {
        workingDirectory: process.cwd(),
        modelName: model,
        osInfo: `${os.type()} ${os.release()} (${os.arch()})`,
        currentDate: new Date().toLocaleDateString('zh-CN', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          weekday: 'long',
        }),
      };

      // 获取当前会话信息
      const { currentSessionId, messages } = useAppStore.getState();
      const historyMessages = currentSessionId ? messages[currentSessionId] || [] : [];
      const coreHistory = convertToCoreMsgs(historyMessages);

      // 检查是否有检查点（使用 Core Session API）
      const checkpoint = currentSessionId ? await Session.loadCheckpoint(currentSessionId) : null;

      if (checkpoint) {
        // 有检查点：从检查点恢复
        logger.info('Initializing Agent with checkpoint', {
          sessionId: currentSessionId,
          loadAfterMessageId: checkpoint.loadAfterMessageId,
        });

        // 找到分割点
        const splitIndex = historyMessages.findIndex(
          (msg) => msg.id === checkpoint.loadAfterMessageId
        );

        if (splitIndex === -1) {
          // 消息 ID 找不到，清除检查点，使用完整历史
          logger.warn('Checkpoint message ID not found, clearing checkpoint');
          if (currentSessionId) {
            await Session.deleteCheckpoint(currentSessionId);
          }
          await agent.init({ promptContext });
          agent.loadHistory(coreHistory, { clearExisting: true, skipSystemPrompt: true });
        } else {
          // 使用 initWithCheckpoint
          const partialHistory = coreHistory.slice(splitIndex + 1);
          await agent.initWithCheckpoint(
            partialHistory,
            {
              summary: checkpoint.summary,
              loadAfterMessageId: checkpoint.loadAfterMessageId,
              compressedAt: checkpoint.compressedAt,
              stats: checkpoint.stats,
            },
            { promptContext }
          );
        }
      } else {
        // 无检查点：正常初始化 + 加载完整历史
        await agent.init({ promptContext });
        if (coreHistory.length > 0) {
          agent.loadHistory(coreHistory, { clearExisting: true, skipSystemPrompt: true });
        }
      }

      // 设置模型定价
      const pricing = getModelPricing(model);
      if (pricing) {
        agent.setModelPricing(pricing);
      }
      agent.setExchangeRate(exchangeRate);

      // 从历史消息累加费用（用于会话恢复）
      // 兼容两种格式：数字（新）和对象（旧）
      const historyCostCNY = historyMessages.reduce((sum, msg) => {
        const cost = msg.metadata?.cost;
        if (typeof cost === 'number') {
          return sum + cost;
        } else if (cost && typeof cost === 'object' && 'totalCost' in cost) {
          // 兼容旧格式：{ inputCost, outputCost, totalCost }
          const totalCost = (cost as any).totalCost;
          return sum + (typeof totalCost === 'number' ? totalCost : 0);
        }
        return sum;
      }, 0);

      // 存入 Store（让 useAgentStats 能立即获取）
      useAppStore.getState().setSessionTotalCost(historyCostCNY);

      // 同时初始化 SessionStats（用于后续累加）
      if (historyCostCNY > 0) {
        agent.getSessionStats().initFromHistory(historyCostCNY);
        logger.info('Restored history cost', { historyCostCNY });
      }

      // 标记当前会话已初始化上下文
      contextInitializedForSession = currentSessionId;

      // 保存到模块级变量
      agentInstance = agent;
      agentInitialized = true;
      agentInitFailed = false;
      agentInitError = null;
      currentModelInfo = { provider, model };

      // 绑定执行流管理器
      bindManager(agent.getExecutionStream());

      // 更新组件状态
      setCurrentModel(currentModelInfo);
      setIsReady(true);

      // 记录 Agent 初始化
      agentLogger.init(provider, model, currentSessionId || 'none');

      logger.info('Agent initialized successfully', {
        provider,
        model,
        hasCheckpoint: !!checkpoint,
        historyCount: coreHistory.length,
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);

      // 更新模块级状态
      agentInitFailed = true;
      agentInitError = errorMessage;
      agentInstance = null;
      agentInitialized = false;

      // 更新组件状态
      setError(errorMessage);
      logger.error('Failed to initialize Agent', { error: err });
    } finally {
      setIsLoading(false);
      agentInitPromise = null;
    }
  }, [bindManager, exchangeRate]);

  // 初始化 Agent（处理各种情况）
  useEffect(() => {
    // 情况 1：已成功初始化，直接复用
    if (agentInitialized && agentInstance) {
      logger.debug('Reusing existing Agent instance after remount');
      setIsReady(true);
      setCurrentModel(currentModelInfo);
      setError(null);
      // 重新绑定执行流管理器（remount 后需要重新绑定）
      bindManager(agentInstance.getExecutionStream());
      return;
    }

    // 情况 2：之前失败过，自动重试
    if (agentInitFailed && !agentInstance) {
      logger.info('Retrying Agent initialization after previous failure');
      agentInitFailed = false;
      agentInitError = null;
      agentInitPromise = initAgentInternal();
      return;
    }

    // 情况 3：正在初始化，等待完成
    if (agentInitPromise) {
      logger.debug('Waiting for ongoing Agent initialization');
      agentInitPromise.then(() => {
        if (agentInstance) {
          setIsReady(true);
          setCurrentModel(currentModelInfo);
          bindManager(agentInstance.getExecutionStream());
        } else if (agentInitError) {
          setError(agentInitError);
        }
      });
      return;
    }

    // 情况 4：首次初始化
    logger.info('Starting Agent initialization');
    agentInitPromise = initAgentInternal();
  }, [bindManager, initAgentInternal]);

  // 发送消息（内存优先，不再每次重新加载历史）
  const sendMessage = useCallback(
    async (message: string, options?: SendMessageOptions): Promise<string | null> => {
      if (!agentInstance || !isReady) {
        logger.warn('Agent not ready');
        return null;
      }

      try {
        setIsLoading(true);

        const { currentSessionId, messages, sessions } = useAppStore.getState();
        const currentSession = sessions.find((s) => s.id === currentSessionId);

        // 检查是否需要重新初始化上下文（会话切换时）
        if (currentSessionId && contextInitializedForSession !== currentSessionId) {
          logger.info('Session changed, reinitializing context', {
            from: contextInitializedForSession,
            to: currentSessionId,
          });

          const historyMessages = messages[currentSessionId] || [];
          const coreHistory = convertToCoreMsgs(historyMessages);
          const checkpoint = await Session.loadCheckpoint(currentSessionId);

          if (checkpoint) {
            const splitIndex = historyMessages.findIndex(
              (msg) => msg.id === checkpoint.loadAfterMessageId
            );
            if (splitIndex !== -1) {
              const partialHistory = coreHistory.slice(splitIndex + 1);
              agentInstance.getContextManager().loadWithSummary(checkpoint.summary, partialHistory);
              agentInstance.getSessionStats().restore(checkpoint.stats);
            } else {
              await Session.deleteCheckpoint(currentSessionId);
              agentInstance.loadHistory(coreHistory, {
                clearExisting: true,
                skipSystemPrompt: true,
              });
            }
          } else {
            agentInstance.loadHistory(coreHistory, { clearExisting: true, skipSystemPrompt: true });
          }

          // 从历史消息累加费用
          // 兼容两种格式：数字（新）和对象（旧）
          const historyCostCNY = historyMessages.reduce((sum, msg) => {
            const cost = msg.metadata?.cost;
            if (typeof cost === 'number') {
              return sum + cost;
            } else if (cost && typeof cost === 'object' && 'totalCost' in cost) {
              // 兼容旧格式：{ inputCost, outputCost, totalCost }
              const totalCost = (cost as { totalCost?: number }).totalCost;
              return sum + (typeof totalCost === 'number' ? totalCost : 0);
            }
            return sum;
          }, 0);

          // 存入 Store（让 useAgentStats 能立即获取）
          useAppStore.getState().setSessionTotalCost(historyCostCNY);

          // 同时初始化 SessionStats（用于后续累加）
          if (historyCostCNY > 0) {
            agentInstance.getSessionStats().initFromHistory(historyCostCNY);
            logger.info('Restored history cost on session switch', { historyCostCNY });
          }

          contextInitializedForSession = currentSessionId;
        }

        // 获取当前模型的 Token 限制
        const modelLimit = currentModel ? getModelTokenLimit(currentModel.model) : undefined;

        // 转换 approvalMode
        let coreApprovalMode: ApprovalMode;
        if (approvalMode === 'default') {
          coreApprovalMode = 'default' as ApprovalMode;
        } else if (approvalMode === 'auto_edit') {
          coreApprovalMode = 'autoEdit' as ApprovalMode;
        } else {
          coreApprovalMode = 'yolo' as ApprovalMode;
        }

        // 压缩完成回调
        const handleCompressionComplete = (event: CompressionCompleteEvent) => {
          if (!currentSessionId) return;

          const historyMessages = useAppStore.getState().messages[currentSessionId] || [];

          // 计算被压缩的最后一条消息的 ID
          const compressedCount = event.compressedCount;
          if (compressedCount > 0 && compressedCount <= historyMessages.length) {
            const lastCompressedMsg = historyMessages[compressedCount - 1];

            const checkpoint: SessionCheckpoint = {
              summary: event.summary,
              loadAfterMessageId: lastCompressedMsg.id,
              compressedAt: Date.now(),
              stats: agentInstance!.getSessionStats().toCheckpoint(),
            };

            // 异步保存检查点（使用 Core Session API）
            Session.saveCheckpoint(currentSessionId, checkpoint).catch((error) => {
              logger.error('Failed to save checkpoint', { error, sessionId: currentSessionId });
            });

            logger.info('Compression complete, checkpoint saved', {
              sessionId: currentSessionId,
              compressedCount: event.compressedCount,
              preservedCount: event.preservedCount,
            });
          }
        };

        // 执行 Agent
        const result = await agentInstance.run(message, {
          modelLimit,
          sessionId: currentSessionId || 'none',
          onConfirmRequired: options?.onConfirmRequired,
          approvalMode: coreApprovalMode,
          onCompressionComplete: handleCompressionComplete,
        });

        // 异步保存历史（不阻塞，使用 Core Session API）
        if (currentSession && currentSessionId) {
          const latestMessages = useAppStore.getState().messages[currentSessionId] || [];
          const storedMessages = latestMessages.map(filterForStorage);
          Session.saveData(currentSessionId, storedMessages).catch((error) => {
            logger.error('Failed to save session data', { error, sessionId: currentSessionId });
          });
        }

        if (result.success) {
          return result.finalResponse;
        } else {
          setError(result.error || 'Unknown error');
          return null;
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        setError(errorMessage);
        logger.error('Failed to send message', { error: err });
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [isReady, approvalMode, currentModel]
  );

  // 切换模型
  const switchModel = useCallback(async (provider: string, model: string): Promise<void> => {
    if (!agentInstance) {
      logger.warn('Agent not initialized');
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      // 获取新 provider 的配置
      const config = configManager.loadConfig();
      const providerConfig = config.providers?.[provider];

      await agentInstance.setModel(provider, model, providerConfig?.apiKey);

      // 更新定价
      const pricing = getModelPricing(model);
      if (pricing) {
        agentInstance.setModelPricing(pricing);
      }

      // 更新模块级和组件级状态
      currentModelInfo = { provider, model };
      setCurrentModel(currentModelInfo);
      agentLogger.switch(provider, model);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(errorMessage);
      logger.error('Failed to switch model', { error: err });
    } finally {
      setIsLoading(false);
    }
  }, []);

  // 中断当前执行
  const abort = useCallback(() => {
    if (agentInstance) {
      agentInstance.abort();
      logger.info('Agent execution aborted by user');
    }
  }, []);

  // 检查是否正在执行
  const isRunning = useCallback(() => {
    if (!agentInstance) return false;
    return agentInstance.isRunning();
  }, []);

  return {
    isReady,
    isLoading,
    error,
    sendMessage,
    switchModel,
    currentModel,
    abort,
    isRunning,
  };
}
