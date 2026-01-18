/**
 * 内存存储实现（用于测试和开发）
 */

import type { Session, SessionStorage } from '../types.js';

export class MemoryStorage implements SessionStorage {
  private sessions: Map<string, Session> = new Map();

  async save(session: Session): Promise<void> {
    this.sessions.set(session.id, { ...session });
  }

  async load(sessionId: string): Promise<Session | null> {
    const session = this.sessions.get(sessionId);
    return session ? { ...session } : null;
  }

  async loadAll(): Promise<Session[]> {
    return Array.from(this.sessions.values()).map(s => ({ ...s }));
  }

  async delete(sessionId: string): Promise<boolean> {
    return this.sessions.delete(sessionId);
  }

  async exists(sessionId: string): Promise<boolean> {
    return this.sessions.has(sessionId);
  }

  clear(): void {
    this.sessions.clear();
  }
}
