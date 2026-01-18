/**
 * SessionManager 单元测试
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { SessionManager } from '../SessionManager.js';
import { MemoryStorage } from '../storage/MemoryStorage.js';

describe('SessionManager', () => {
  let sessionManager: SessionManager;
  let storage: MemoryStorage;

  beforeEach(() => {
    storage = new MemoryStorage();
    sessionManager = new SessionManager(storage);
  });

  it('should create a session', async () => {
    const session = await sessionManager.createSession({ title: 'Test Session' });
    
    expect(session.id).toBeDefined();
    expect(session.title).toBe('Test Session');
    expect(session.createdAt).toBeDefined();
    expect(session.updatedAt).toBeDefined();
    expect(session.isSubSession).toBe(false);
  });

  it('should create a sub-session', async () => {
    const parent = await sessionManager.createSession({ title: 'Parent' });
    const child = await sessionManager.createSession({
      title: 'Child',
      parentId: parent.id,
      agentName: 'explore'
    });

    expect(child.parentId).toBe(parent.id);
    expect(child.agentName).toBe('explore');
    expect(child.isSubSession).toBe(true);
  });

  it('should get child sessions', async () => {
    const parent = await sessionManager.createSession({ title: 'Parent' });
    const child1 = await sessionManager.createSession({
      parentId: parent.id,
      agentName: 'explore'
    });
    const child2 = await sessionManager.createSession({
      parentId: parent.id,
      agentName: 'general'
    });

    const children = await sessionManager.getChildSessions({ parentId: parent.id });
    expect(children).toHaveLength(2);
    expect(children.map(c => c.id)).toContain(child1.id);
    expect(children.map(c => c.id)).toContain(child2.id);
  });

  it('should delete session with children', async () => {
    const parent = await sessionManager.createSession({ title: 'Parent' });
    const child = await sessionManager.createSession({
      parentId: parent.id,
      agentName: 'explore'
    });

    await sessionManager.deleteSession(parent.id);

    expect(await sessionManager.getSession(parent.id)).toBeNull();
    expect(await sessionManager.getSession(child.id)).toBeNull();
  });

  it('should get or create sub-session', async () => {
    const parent = await sessionManager.createSession({ title: 'Parent' });
    
    // 创建新子会话
    const child1 = await sessionManager.getOrCreateSubSession({
      parentId: parent.id,
      agentName: 'explore',
      title: 'Child 1'
    });

    expect(child1.parentId).toBe(parent.id);
    expect(child1.agentName).toBe('explore');

    // 复用现有子会话
    const child2 = await sessionManager.getOrCreateSubSession({
      sessionId: child1.id,
      parentId: parent.id,
      agentName: 'explore'
    });

    expect(child2.id).toBe(child1.id);
  });
});
