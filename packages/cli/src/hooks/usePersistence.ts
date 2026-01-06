import { useCallback } from 'react';
import { useAppStore } from '../context/store.js';
import { saveSession, loadAllSessions } from '../util/storage.js';
import { configManager } from '../config/manager.js';
import { logger } from '../util/logger.js';
import { sessionLogger, configLogger } from '../util/logUtils.js';
import type { PartialConfig } from '../config/schema.js';

/**
 * 持久化 Hook
 * 提供显式的保存方法，让组件在关键时刻调用
 */
export function usePersistence() {
  /**
   * 保存当前会话
   * 使用 getState() 直接读取最新状态，避免闭包问题
   */
  const saveCurrentSession = useCallback(() => {
    // ✅ 直接从 store 读取最新状态，而不使用 Hook 的依赖
    const state = useAppStore.getState();
    const currentSessionId = state.currentSessionId;
    const sessions = state.sessions;
    const messages = state.messages;

    if (!currentSessionId) {
      logger.warn('No current session to save');
      return;
    }

    const session = sessions.find((s) => s.id === currentSessionId);
    if (!session) {
      logger.warn(`Session ${currentSessionId} not found`);
      return;
    }

    const sessionMessages = messages[currentSessionId] || [];

    try {
      // 统计消息
      const messagesWithMetadata = sessionMessages.filter(
        m => m.role === 'assistant' && m.metadata?.tokenUsage
      ).length;
      const totalAssistantMessages = sessionMessages.filter(m => m.role === 'assistant').length;

      // 记录会话保存
      sessionLogger.save(
        currentSessionId,
        sessionMessages.length,
        totalAssistantMessages,
        messagesWithMetadata
      );

      saveSession(session, sessionMessages);
    } catch (error) {
      logger.error(`Failed to save session ${currentSessionId}`, { error });
    }
  }, []); // ← 空依赖，函数不会重新创建，每次调用都读取最新的 store 状态

  /**
   * 保存所有会话
   * 使用 getState() 直接读取最新状态
   */
  const saveAllSessions = useCallback(() => {
    // ✅ 直接从 store 读取最新状态
    const state = useAppStore.getState();
    const sessions = state.sessions;
    const messages = state.messages;

    let savedCount = 0;
    let failedCount = 0;

    for (const session of sessions) {
      const sessionMessages = messages[session.id] || [];

      try {
        saveSession(session, sessionMessages);
        savedCount++;
      } catch (error) {
        logger.error(`Failed to save session ${session.id}`, { error });
        failedCount++;
      }
    }

    logger.info(`Saved ${savedCount} sessions, ${failedCount} failed`);
  }, []);

  /**
   * 保存配置
   * @param updates 要更新的配置项
   */
  const saveConfig = useCallback((updates: Partial<PartialConfig>) => {
    try {
      configManager.updateConfig(updates);
      configLogger.save(updates);
    } catch (error) {
      logger.error('Failed to save config', { error });
    }
  }, []);

  /**
   * 保存所有数据（退出时调用）
   */
  const saveAll = useCallback(() => {
    logger.info('Saving all data...');

    // 保存所有会话
    saveAllSessions();

    // 保存配置（仅保留 UI 配置）
    // ✅ 直接从 store 读取最新状态
    const state = useAppStore.getState();
    const currency = state.config.currency;
    const exchangeRate = state.config.exchangeRate;

    saveConfig({
      ui: {
        currency,
        exchangeRate,
      } as any, // 使用部分更新
    });

    logger.info('All data saved');
  }, [saveAllSessions, saveConfig]);

  return {
    saveCurrentSession,
    saveAllSessions,
    saveConfig,
    saveAll,
  };
}
