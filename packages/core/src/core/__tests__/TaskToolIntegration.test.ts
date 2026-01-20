/**
 * TaskTool与全局Session模块集成测试
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { Session, initializeSession } from '../session/globalSession.js';
import { TaskTool } from '../tool/Task/executors.js';

describe('TaskTool Integration with Global Session', () => {
  beforeEach(() => {
    // 重新初始化为内存存储
    initializeSession('memory');
  });

  it('should create sub-session through TaskTool', async () => {
    // 创建父会话
    const parentSession = await Session.create({ title: 'Parent Session' });
    
    // 模拟TaskTool的使用场景
    const subSession = await Session.getOrCreateSubSession({
      parentId: parentSession.id,
      agentName: 'explore',
      title: 'Sub Agent Session'
    });
    
    expect(subSession.parentId).toBe(parentSession.id);
    expect(subSession.agentName).toBe('explore');
    expect(subSession.isSubSession).toBe(true);
    expect(subSession.title).toBe('Sub Agent Session');
  });

  it('should reuse existing sub-session', async () => {
    // 创建父会话
    const parentSession = await Session.create({ title: 'Parent Session' });
    
    // 第一次创建子会话
    const subSession1 = await Session.getOrCreateSubSession({
      parentId: parentSession.id,
      agentName: 'explore'
    });
    
    // 第二次应该返回相同的子会话
    const subSession2 = await Session.getOrCreateSubSession({
      parentId: parentSession.id,
      agentName: 'explore'
    });
    
    expect(subSession1.id).toBe(subSession2.id);
  });

  it('should handle multiple agent types', async () => {
    // 创建父会话
    const parentSession = await Session.create({ title: 'Parent Session' });
    
    // 创建不同类型的子会话
    const exploreSession = await Session.getOrCreateSubSession({
      parentId: parentSession.id,
      agentName: 'explore'
    });
    
    const buildSession = await Session.getOrCreateSubSession({
      parentId: parentSession.id,
      agentName: 'build'
    });
    
    expect(exploreSession.id).not.toBe(buildSession.id);
    expect(exploreSession.agentName).toBe('explore');
    expect(buildSession.agentName).toBe('build');
  });
});
