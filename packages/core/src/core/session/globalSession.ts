/**
 * 全局Session模块
 * 参考opencode架构，Session作为独立的全局模块
 */

import { SessionManager } from './SessionManager.js';
import { MemoryStorage } from './storage/MemoryStorage.js';
import { FileSystemStorage } from './storage/FileSystemStorage.js';
import type { 
  Session as SessionType, 
  CreateSessionOptions, 
  GetChildSessionsOptions, 
  GetOrCreateSubSessionOptions 
} from './types.js';
import { logger } from '../../utils/logger.js';

// 全局SessionManager实例
let globalSessionManager: SessionManager | null = null;

/**
 * 初始化全局Session模块
 */
export function initializeSession(storageType: 'memory' | 'filesystem' = 'memory', storageDir?: string): void {
  if (globalSessionManager) {
    logger.warn('Session module already initialized');
    return;
  }

  const storage = storageType === 'filesystem' 
    ? new FileSystemStorage(storageDir)
    : new MemoryStorage();
    
  globalSessionManager = new SessionManager(storage);
  logger.debug('Session module initialized', { storageType, storageDir });
}

/**
 * 获取全局SessionManager实例
 */
function getSessionManager(): SessionManager {
  if (!globalSessionManager) {
    // 自动初始化为内存存储
    initializeSession('memory');
  }
  return globalSessionManager!;
}

/**
 * 全局Session命名空间（参考opencode）
 */
export namespace Session {
  /**
   * 创建会话
   */
  export async function create(options: CreateSessionOptions = {}): Promise<SessionType> {
    return getSessionManager().createSession(options);
  }

  /**
   * 获取会话
   */
  export async function get(sessionId: string): Promise<SessionType | null> {
    return getSessionManager().getSession(sessionId);
  }

  /**
   * 更新会话
   */
  export async function update(sessionId: string, updates: Partial<SessionType>): Promise<SessionType | null> {
    return getSessionManager().updateSession(sessionId, updates);
  }

  /**
   * 删除会话
   */
  export async function remove(sessionId: string): Promise<boolean> {
    return getSessionManager().deleteSession(sessionId);
  }

  /**
   * 列出所有会话
   */
  export async function list(): Promise<SessionType[]> {
    return getSessionManager().listSessions();
  }

  /**
   * 获取子会话列表
   */
  export async function children(parentId: string): Promise<SessionType[]> {
    return getSessionManager().getChildSessions({ parentId });
  }

  /**
   * 获取父会话
   */
  export async function parent(sessionId: string): Promise<SessionType | null> {
    return getSessionManager().getParentSession(sessionId);
  }

  /**
   * 获取或创建子会话
   */
  export async function getOrCreateSubSession(options: GetOrCreateSubSessionOptions): Promise<SessionType> {
    return getSessionManager().getOrCreateSubSession(options);
  }
}
