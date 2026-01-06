/**
 * useAgent Hook
 * 管理 Agent 实例，处理初始化、模型切换和工具确认
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { Agent } from '@reason-cli/core';
import type { ConfirmDetails, ConfirmOutcome, ApprovalMode } from '@reason-cli/core';
import { configManager } from '../config/manager.js';
import { getModelTokenLimit } from '../config/tokenLimits.js';
import { logger } from '../util/logger.js';
import { agentLogger } from '../util/logUtils.js';
import { useExecutionState } from '../context/execution.js';
import { useAppStore } from '../context/store.js';
import { convertToCoreMsgs } from '../util/messageConverter.js';

/** sendMessage 选项 */
interface SendMessageOptions {
  /** 工具确认回调（由调用方提供） */
  onConfirmRequired?: (callId: string, toolName: string, details: ConfirmDetails) => Promise<ConfirmOutcome>;
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

export function useAgent(): UseAgentReturn {
  const agentRef = useRef<Agent | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentModel, setCurrentModel] = useState<{ provider: string; model: string } | null>(
    null
  );
  const { bindManager } = useExecutionState();

  // 从 store 获取 approvalMode
  const approvalMode = useAppStore((state) => state.config.approvalMode);

  // 初始化 Agent
  useEffect(() => {
    const initAgent = async () => {
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

        // 创建 Agent
        const agent = new Agent({
          provider,
          model,
          apiKey: providerConfig.apiKey,
          baseURL: providerConfig.baseUrl,
          systemPrompt: 'You are a helpful AI assistant.',
        });

        await agent.init();

        agentRef.current = agent;

        // 绑定执行流管理器
        bindManager(agent.getExecutionStream());

        setCurrentModel({ provider, model });
        setIsReady(true);

        // 记录 Agent 初始化
        const sessionId = useAppStore.getState().currentSessionId || 'none';
        agentLogger.init(provider, model, sessionId);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        setError(errorMessage);
        logger.error('Failed to initialize Agent', { error: err });
      } finally {
        setIsLoading(false);
      }
    };

    initAgent();
  }, [bindManager]);

  // 发送消息（集成历史加载）
  const sendMessage = useCallback(
    async (message: string, options?: SendMessageOptions): Promise<string | null> => {
      if (!agentRef.current || !isReady) {
        logger.warn('Agent not ready');
        return null;
      }

      try {
        setIsLoading(true);

        // 1. 获取当前 session 的历史消息
        const { currentSessionId, messages } = useAppStore.getState();
        const historyMessages = currentSessionId ? messages[currentSessionId] || [] : [];

        // 2. 转换为 Core 格式并加载历史
        const coreHistory = convertToCoreMsgs(historyMessages);
        agentRef.current.loadHistory(coreHistory, {
          clearExisting: true,
          skipSystemPrompt: true,
        });

        // 记录历史加载（DEBUG 级别）
        logger.debug(`Loaded ${coreHistory.length} history messages for session ${currentSessionId || 'none'}`);

        // 3. 获取当前模型的 Token 限制
        const modelLimit = currentModel ? getModelTokenLimit(currentModel.model) : undefined;

        // 4. 将 CLI 层的 approvalMode 转换为 Core 层枚举
        let coreApprovalMode: ApprovalMode
        if (approvalMode === 'default') {
          coreApprovalMode = 'default' as ApprovalMode
        } else if (approvalMode === 'auto_edit') {
          coreApprovalMode = 'autoEdit' as ApprovalMode
        } else {
          coreApprovalMode = 'yolo' as ApprovalMode
        }

        // 5. 执行 Agent，使用传入的确认回调
        const result = await agentRef.current.run(message, {
          modelLimit,
          onConfirmRequired: options?.onConfirmRequired,  // ← 使用调用方传入的回调
          approvalMode: coreApprovalMode,
        });

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
    if (!agentRef.current) {
      logger.warn('Agent not initialized');
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      // 获取新 provider 的配置
      const config = configManager.loadConfig();
      const providerConfig = config.providers?.[provider];

      await agentRef.current.setModel(provider, model, providerConfig?.apiKey);
      setCurrentModel({ provider, model });
      agentLogger.switch(provider, model);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(errorMessage);
      logger.error('Failed to switch model', { error: err });
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    isReady,
    isLoading,
    error,
    sendMessage,
    switchModel,
    currentModel,
  };
}
