import { loadAllSessions, ensureStorageDir } from '../util/storage.js';
import { configManager } from '../config/manager.js';
import { logger } from '../util/logger.js';
import type { Session, Message } from '../context/store.js';
import type { ReasonCliConfig } from '../config/schema.js';

/**
 * 加载的数据结构
 */
export interface LoadedData {
  config: ReasonCliConfig;
  sessions: Session[];
  messages: Record<string, Message[]>;
  currentSessionId: string | null;
}

/**
 * 加载所有数据（配置 + 会话）
 * @returns 加载的数据
 */
export function loadAllData(): LoadedData {
  logger.info('Loading all data from disk...');

  // 确保存储目录存在
  ensureStorageDir();

  // 1. 加载配置
  const config = configManager.loadConfig();

  // 2. 加载所有会话和消息
  const { sessions, messages } = loadAllSessions();

  // 3. 确定当前会话 ID
  let currentSessionId: string | null = null;

  if (sessions.length > 0) {
    // 优先使用配置中保存的 lastSessionId
    const lastSessionId = config.session.lastSessionId;
    if (lastSessionId && sessions.find((s) => s.id === lastSessionId)) {
      currentSessionId = lastSessionId;
    } else {
      // 否则使用最新的会话
      currentSessionId = sessions[0].id;
    }
  }

  logger.info(`Loaded ${sessions.length} sessions, current session: ${currentSessionId || 'none'}`);

  return {
    config,
    sessions,
    messages,
    currentSessionId,
  };
}
