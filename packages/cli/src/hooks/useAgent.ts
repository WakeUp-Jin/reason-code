/**
 * useAgent Hook
 * 管理 Agent 实例，处理初始化和模型切换
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { Agent } from '@reason-cli/core';
import { configManager } from '../config/manager.js';
import { logger } from '../util/logger.js';

interface UseAgentReturn {
  /** Agent 是否已初始化 */
  isReady: boolean;
  /** 是否正在加载 */
  isLoading: boolean;
  /** 错误信息 */
  error: string | null;
  /** 发送消息给 Agent */
  sendMessage: (message: string) => Promise<string | null>;
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
  const [currentModel, setCurrentModel] = useState<{ provider: string; model: string } | null>(null);

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
          throw new Error(`API key not found for provider: ${provider}. Please set ${provider.toUpperCase()}_API_KEY in your environment or config file.`);
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
        setCurrentModel({ provider, model });
        setIsReady(true);
        logger.info(`Agent initialized with ${provider}/${model}`);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        setError(errorMessage);
        logger.error('Failed to initialize Agent', { error: err });
      } finally {
        setIsLoading(false);
      }
    };

    initAgent();
  }, []);

  // 发送消息
  const sendMessage = useCallback(async (message: string): Promise<string | null> => {
    if (!agentRef.current || !isReady) {
      logger.warn('Agent not ready');
      return null;
    }

    try {
      setIsLoading(true);
      const result = await agentRef.current.run(message);

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
  }, [isReady]);

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
      logger.info(`Switched to ${provider}/${model}`);
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
