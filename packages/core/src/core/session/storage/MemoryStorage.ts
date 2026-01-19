/**
 * 内存存储实现（用于测试和开发）
 */

import type {
  SessionMetadata,
  SessionStorage,
  StoredMessage,
  SessionCheckpoint,
  SessionData,
} from '../types.js';

export class MemoryStorage implements SessionStorage {
  private sessions: Map<string, SessionMetadata> = new Map();
  private messages: Map<string, StoredMessage[]> = new Map();
  private checkpoints: Map<string, SessionCheckpoint> = new Map();

  // ============================================================
  // Session 管理
  // ============================================================

  async save(session: SessionMetadata): Promise<void> {
    this.sessions.set(session.id, { ...session });
  }

  async load(sessionId: string): Promise<SessionMetadata | null> {
    const session = this.sessions.get(sessionId);
    return session ? { ...session } : null;
  }

  async loadAll(): Promise<SessionMetadata[]> {
    return Array.from(this.sessions.values())
      .map((s) => ({ ...s }))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async delete(sessionId: string): Promise<boolean> {
    this.sessions.delete(sessionId);
    this.messages.delete(sessionId);
    this.checkpoints.delete(sessionId);
    return true;
  }

  async exists(sessionId: string): Promise<boolean> {
    return this.sessions.has(sessionId);
  }

  // ============================================================
  // Message 管理
  // ============================================================

  async saveMessages(sessionId: string, messages: StoredMessage[]): Promise<void> {
    this.messages.set(sessionId, messages.map((m) => ({ ...m })));
  }

  async loadMessages(sessionId: string): Promise<StoredMessage[]> {
    const msgs = this.messages.get(sessionId);
    return msgs ? msgs.map((m) => ({ ...m })) : [];
  }

  // ============================================================
  // Checkpoint 管理
  // ============================================================

  async saveCheckpoint(sessionId: string, checkpoint: SessionCheckpoint): Promise<void> {
    this.checkpoints.set(sessionId, { ...checkpoint });
  }

  async loadCheckpoint(sessionId: string): Promise<SessionCheckpoint | null> {
    const checkpoint = this.checkpoints.get(sessionId);
    return checkpoint ? { ...checkpoint } : null;
  }

  async deleteCheckpoint(sessionId: string): Promise<boolean> {
    return this.checkpoints.delete(sessionId);
  }

  // ============================================================
  // 原子操作
  // ============================================================

  async saveSessionData(data: SessionData): Promise<void> {
    const { session, messages, checkpoint } = data;
    await this.save(session);
    await this.saveMessages(session.id, messages);
    if (checkpoint) {
      await this.saveCheckpoint(session.id, checkpoint);
    }
  }

  async loadSessionData(sessionId: string): Promise<SessionData | null> {
    const session = await this.load(sessionId);
    if (!session) {
      return null;
    }

    const messages = await this.loadMessages(sessionId);
    const checkpoint = await this.loadCheckpoint(sessionId);

    return {
      session,
      messages,
      checkpoint: checkpoint || undefined,
    };
  }

  // ============================================================
  // 工具方法
  // ============================================================

  clear(): void {
    this.sessions.clear();
    this.messages.clear();
    this.checkpoints.clear();
  }
}
