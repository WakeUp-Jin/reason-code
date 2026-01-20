import { Session, type SessionMetadata } from '@reason-code/core';
import { configManager } from '../config/manager.js';
import { logger } from '../util/logger.js';
import { restoreFromStorage } from '../util/messageUtils.js';
import type { Message } from '../context/store.js';
import type { ReasonCliConfig } from '../config/schema.js';

/**
 * 加载的数据结构
 */
export interface LoadedData {
  config: ReasonCliConfig;
  sessions: SessionMetadata[];
  messages: Record<string, Message[]>;
  currentSessionId: string | null;
}

/**
 * 加载所有数据（配置 + 会话）
 * 使用 Core Session API 加载会话和消息
 * @returns 加载的数据
 */
export async function loadAllData(): Promise<LoadedData> {
  logger.info('Loading all data from disk...');

  // 1. 加载配置
  const config = await configManager.loadConfig();

  // 2. 加载所有会话（使用 Core Session API）
  const sessions = await Session.list();

  // 3. 加载每个会话的消息
  const messages: Record<string, Message[]> = {};
  for (const session of sessions) {
    try {
      const storedMessages = await Session.loadMessages(session.id);
      // 将 StoredMessage 转换为 CLI Message
      messages[session.id] = storedMessages.map(restoreFromStorage);
    } catch (error) {
      logger.error(`Failed to load messages for session ${session.id}`, { error });
      messages[session.id] = [];
    }
  }

  // 4. 不恢复任何会话，总是创建新会话
  const currentSessionId: string | null = null;

  logger.info(`Loaded ${sessions.length} sessions, current session: none (will create new)`);

  return {
    config,
    sessions,
    messages,
    currentSessionId,
  };
}

/**
 * 加载配置（用于快速启动）
 * 会话数据将在后台异步加载
 */
export async function loadConfigOnly(): Promise<ReasonCliConfig> {
  return configManager.loadConfig();
}
