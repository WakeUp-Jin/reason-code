/**
 * 子代理会话管理测试
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { SessionManager } from '../SessionManager.js';
import { MemoryStorage } from '../storage/MemoryStorage.js';

describe('SessionManager - SubAgent Features', () => {
  let sessionManager: SessionManager;
  let storage: MemoryStorage;

  beforeEach(() => {
    storage = new MemoryStorage();
    sessionManager = new SessionManager(storage);
  });

  it('should handle complex parent-child relationships', async () => {
    // 创建主会话
    const mainSession = await sessionManager.createSession({ title: 'Main Session' });
    
    // 创建多个子会话
    const exploreSession = await sessionManager.createSession({
      title: 'Explore Task',
      parentId: mainSession.id,
      agentName: 'explore'
    });
    
    const generalSession = await sessionManager.createSession({
      title: 'General Task',
      parentId: mainSession.id,
      agentName: 'general'
    });

    // 验证子会话属性
    expect(exploreSession.isSubSession).toBe(true);
    expect(generalSession.isSubSession).toBe(true);
    expect(mainSession.isSubSession).toBe(false);

    // 获取子会话列表
    const children = await sessionManager.getChildSessions({ parentId: mainSession.id });
    expect(children).toHaveLength(2);
    
    // 验证父会话关系
    const parentOfExplore = await sessionManager.getParentSession(exploreSession.id);
    expect(parentOfExplore?.id).toBe(mainSession.id);
  });

  it('should handle nested sub-sessions', async () => {
    // 创建三层嵌套会话
    const level1 = await sessionManager.createSession({ title: 'Level 1' });
    const level2 = await sessionManager.createSession({
      title: 'Level 2',
      parentId: level1.id,
      agentName: 'explore'
    });
    const level3 = await sessionManager.createSession({
      title: 'Level 3',
      parentId: level2.id,
      agentName: 'general'
    });

    // 验证层级关系
    expect(level2.parentId).toBe(level1.id);
    expect(level3.parentId).toBe(level2.id);

    // 删除中间层，验证级联删除
    await sessionManager.deleteSession(level2.id);
    
    expect(await sessionManager.getSession(level2.id)).toBeNull();
    expect(await sessionManager.getSession(level3.id)).toBeNull();
    expect(await sessionManager.getSession(level1.id)).not.toBeNull();
  });

  it('should reuse existing sub-sessions correctly', async () => {
    const parent = await sessionManager.createSession({ title: 'Parent' });
    
    // 第一次调用创建新会话
    const session1 = await sessionManager.getOrCreateSubSession({
      parentId: parent.id,
      agentName: 'explore',
      title: 'Explore Task'
    });

    // 第二次调用复用现有会话
    const session2 = await sessionManager.getOrCreateSubSession({
      sessionId: session1.id,
      parentId: parent.id,
      agentName: 'explore'
    });

    expect(session1.id).toBe(session2.id);
    expect(session2.title).toBe('Explore Task');
  });

  it('should filter main sessions vs sub-sessions', async () => {
    // 创建混合会话
    const main1 = await sessionManager.createSession({ title: 'Main 1' });
    const main2 = await sessionManager.createSession({ title: 'Main 2' });
    const sub1 = await sessionManager.createSession({
      title: 'Sub 1',
      parentId: main1.id,
      agentName: 'explore'
    });
    const sub2 = await sessionManager.createSession({
      title: 'Sub 2',
      parentId: main2.id,
      agentName: 'general'
    });

    const allSessions = await sessionManager.listSessions();
    const mainSessions = allSessions.filter(s => !s.isSubSession);
    const subSessions = allSessions.filter(s => s.isSubSession);

    expect(allSessions).toHaveLength(4);
    expect(mainSessions).toHaveLength(2);
    expect(subSessions).toHaveLength(2);
    
    expect(mainSessions.map(s => s.title)).toContain('Main 1');
    expect(mainSessions.map(s => s.title)).toContain('Main 2');
    expect(subSessions.map(s => s.title)).toContain('Sub 1');
    expect(subSessions.map(s => s.title)).toContain('Sub 2');
  });
});
