/**
 * 全局Session模块测试
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { Session, initializeSession } from '../globalSession.js';

describe('Global Session Module', () => {
  beforeEach(() => {
    // 重新初始化为内存存储
    initializeSession('memory');
  });

  it('should create session using global API', async () => {
    const session = await Session.create({ title: 'Test Session' });
    
    expect(session.id).toBeDefined();
    expect(session.title).toBe('Test Session');
    expect(session.createdAt).toBeDefined();
    expect(session.updatedAt).toBeDefined();
  });

  it('should get session using global API', async () => {
    const created = await Session.create({ title: 'Test Session' });
    const retrieved = await Session.get(created.id);
    
    expect(retrieved?.id).toBe(created.id);
    expect(retrieved?.title).toBe('Test Session');
  });

  it('should create sub-session using global API', async () => {
    const parent = await Session.create({ title: 'Parent Session' });
    const child = await Session.getOrCreateSubSession({
      parentId: parent.id,
      agentName: 'explore',
      title: 'Child Session'
    });
    
    expect(child.parentId).toBe(parent.id);
    expect(child.agentName).toBe('explore');
    expect(child.isSubSession).toBe(true);
  });

  it('should list sessions using global API', async () => {
    await Session.create({ title: 'Session 1' });
    await Session.create({ title: 'Session 2' });
    
    const sessions = await Session.list();
    expect(sessions.length).toBeGreaterThanOrEqual(2);
  });

  it('should remove session using global API', async () => {
    const session = await Session.create({ title: 'To Delete' });
    const removed = await Session.remove(session.id);
    
    expect(removed).toBe(true);
    
    const retrieved = await Session.get(session.id);
    expect(retrieved).toBeNull();
  });
});
