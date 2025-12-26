import { useCallback } from 'react';
import { useAppStore } from '../context/store.js';
import { saveSession, loadAllSessions } from '../util/storage.js';
import { configManager } from '../config/manager.js';
import { logger } from '../util/logger.js';
import type { PartialConfig } from '../config/schema.js';

/**
 * 持久化 Hook
 * 提供显式的保存方法，让组件在关键时刻调用
 */
export function usePersistence() {
  const currentSessionId = useAppStore((state) => state.currentSessionId);
  const sessions = useAppStore((state) => state.sessions);
  const messages = useAppStore((state) => state.messages);

  /**
   * 保存当前会话
   */
  const saveCurrentSession = useCallback(() => {
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
      saveSession(session, sessionMessages);
      logger.info(`Session ${currentSessionId} saved`);
    } catch (error) {
      logger.error(`Failed to save session ${currentSessionId}`, { error });
    }
  }, [currentSessionId, sessions, messages]);

  /**
   * 保存所有会话
   */
  const saveAllSessions = useCallback(() => {
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
  }, [sessions, messages]);

  /**
   * 保存配置
   * @param updates 要更新的配置项
   */
  const saveConfig = useCallback((updates: Partial<PartialConfig>) => {
    try {
      configManager.updateConfig(updates);
      logger.info('Config saved', { updates });
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

    // 保存配置（当前会话 ID）
    if (currentSessionId) {
      saveConfig({
        session: {
          lastSessionId: currentSessionId,
          autoSave: true,
          saveDebounce: 500,
        },
      });
    }

    logger.info('All data saved');
  }, [currentSessionId, saveAllSessions, saveConfig]);

  return {
    saveCurrentSession,
    saveAllSessions,
    saveConfig,
    saveAll,
  };
}
