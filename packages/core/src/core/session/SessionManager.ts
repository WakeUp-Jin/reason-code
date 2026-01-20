/**
 * Core层会话管理器
 * 负责会话的创建、查询、更新、删除等核心业务逻辑
 */

import { logger } from '../../utils/logger.js';
import type {
  SessionMetadata,
  CreateSessionOptions,
  GetChildSessionsOptions,
  GetOrCreateSubSessionOptions,
  SessionStorage,
  StoredMessage,
  SessionCheckpoint,
  SessionData,
} from './types.js';

export class SessionManager {
  private sessions: Map<string, SessionMetadata> = new Map();
  private storage: SessionStorage;

  constructor(storage: SessionStorage) {
    this.storage = storage;
  }

  /**
   * 创建新会话
   */
  async createSession(options: CreateSessionOptions = {}): Promise<SessionMetadata> {
    const session: SessionMetadata = {
      id: this.generateId(),
      title: options.title || this.generateDefaultTitle(!!options.parentId),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      parentId: options.parentId,
      agentName: options.agentName,
      isSubSession: !!options.parentId,
    };

    this.sessions.set(session.id, session);
    await this.storage.save(session);

    logger.debug('Session created', { sessionId: session.id, parentId: options.parentId });
    return session;
  }

  /**
   * 获取会话
   */
  async getSession(sessionId: string): Promise<SessionMetadata | null> {
    // 先从内存查找
    const cachedSession = this.sessions.get(sessionId);
    if (cachedSession) {
      return cachedSession;
    }

    // 从存储加载
    const session = await this.storage.load(sessionId);
    if (session) {
      this.sessions.set(sessionId, session);
      return session;
    }

    return null;
  }

  /**
   * 更新会话
   */
  async updateSession(sessionId: string, updates: Partial<SessionMetadata>): Promise<SessionMetadata | null> {
    const session = await this.getSession(sessionId);
    if (!session) {
      return null;
    }

    const updatedSession = {
      ...session,
      ...updates,
      updatedAt: Date.now(),
    };

    this.sessions.set(sessionId, updatedSession);
    await this.storage.save(updatedSession);

    return updatedSession;
  }

  /**
   * 删除会话
   */
  async deleteSession(sessionId: string): Promise<boolean> {
    // 递归删除子会话
    const children = await this.getChildSessions({ parentId: sessionId });
    for (const child of children) {
      await this.deleteSession(child.id);
    }

    // 删除当前会话
    this.sessions.delete(sessionId);
    return await this.storage.delete(sessionId);
  }

  /**
   * 列出所有会话
   */
  async listSessions(): Promise<SessionMetadata[]> {
    const storedSessions = await this.storage.loadAll();

    // 更新内存缓存
    for (const session of storedSessions) {
      this.sessions.set(session.id, session);
    }

    return storedSessions;
  }

  /**
   * 获取子会话列表
   */
  async getChildSessions(options: GetChildSessionsOptions): Promise<SessionMetadata[]> {
    const allSessions = await this.listSessions();
    return allSessions.filter(s => s.parentId === options.parentId);
  }

  /**
   * 获取父会话
   */
  async getParentSession(sessionId: string): Promise<SessionMetadata | null> {
    const session = await this.getSession(sessionId);
    if (!session?.parentId) {
      return null;
    }
    return await this.getSession(session.parentId);
  }

  /**
   * 获取或创建子会话
   */
  async getOrCreateSubSession(options: GetOrCreateSubSessionOptions): Promise<SessionMetadata> {
    // 尝试复用现有会话
    if (options.sessionId) {
      const existing = await this.getSession(options.sessionId);
      if (existing) {
        logger.debug('Reusing existing sub-session', { sessionId: existing.id });
        return existing;
      }
    }

    // 查找是否已存在相同parentId和agentName的子会话
    if (options.parentId && options.agentName) {
      const childSessions = await this.getChildSessions({ parentId: options.parentId });
      const existingSubSession = childSessions.find(
        session => session.agentName === options.agentName
      );

      if (existingSubSession) {
        logger.debug('Reusing existing sub-session by parentId and agentName', {
          sessionId: existingSubSession.id,
          parentId: options.parentId,
          agentName: options.agentName
        });
        return existingSubSession;
      }
    }

    // 创建新子会话
    return this.createSession({
      title: options.title,
      parentId: options.parentId,
      agentName: options.agentName,
    });
  }

  /**
   * 生成会话ID
   */
  private generateId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 生成默认标题
   */
  private generateDefaultTitle(isChild = false): string {
    const now = new Date();
    const month = now.getMonth() + 1;
    const day = now.getDate();
    const hour = now.getHours();
    const minute = String(now.getMinutes()).padStart(2, '0');
    const prefix = isChild ? 'Subtask ' : '';
    return `${prefix}${month}/${day} ${hour}:${minute}`;
  }

  // ============================================================
  // Message 管理
  // ============================================================

  /**
   * 保存所有消息（完整重写）
   */
  async saveMessages(sessionId: string, messages: StoredMessage[]): Promise<void> {
    await this.storage.saveMessages(sessionId, messages);
  }

  /**
   * 加载所有消息
   */
  async loadMessages(sessionId: string): Promise<StoredMessage[]> {
    return await this.storage.loadMessages(sessionId);
  }

  // ============================================================
  // Checkpoint 管理
  // ============================================================

  /**
   * 保存检查点
   */
  async saveCheckpoint(sessionId: string, checkpoint: SessionCheckpoint): Promise<void> {
    await this.storage.saveCheckpoint(sessionId, checkpoint);
  }

  /**
   * 加载检查点
   */
  async loadCheckpoint(sessionId: string): Promise<SessionCheckpoint | null> {
    return await this.storage.loadCheckpoint(sessionId);
  }

  /**
   * 删除检查点
   */
  async deleteCheckpoint(sessionId: string): Promise<boolean> {
    return await this.storage.deleteCheckpoint(sessionId);
  }

  // ============================================================
  // 完整数据操作
  // ============================================================

  /**
   * 保存完整会话数据
   */
  async saveSessionData(sessionId: string, messages: StoredMessage[], checkpoint?: SessionCheckpoint): Promise<void> {
    const session = await this.getSession(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    await this.storage.saveSessionData({
      session,
      messages,
      checkpoint,
    });
  }

  /**
   * 加载完整会话数据
   */
  async loadSessionData(sessionId: string): Promise<SessionData | null> {
    return await this.storage.loadSessionData(sessionId);
  }
}
