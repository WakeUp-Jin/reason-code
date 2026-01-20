/**
 * FileSystemStorage 测试
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { promises as fs } from 'fs';
import path from 'path';
import { FileSystemStorage } from '../storage/FileSystemStorage.js';
import type { Session } from '../types.js';

describe('FileSystemStorage', () => {
  let storage: FileSystemStorage;
  const testDir = './test-sessions';

  beforeEach(() => {
    storage = new FileSystemStorage(testDir);
  });

  afterEach(async () => {
    // 清理测试文件
    try {
      await storage.clear();
      await fs.rmdir(testDir);
    } catch {
      // 忽略清理错误
    }
  });

  it('should save and load session', async () => {
    const session: Session = {
      id: 'test-session-1',
      title: 'Test Session',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await storage.save(session);
    const loaded = await storage.load(session.id);

    expect(loaded).not.toBeNull();
    expect(loaded?.id).toBe(session.id);
    expect(loaded?.title).toBe(session.title);
  });

  it('should return null for non-existent session', async () => {
    const loaded = await storage.load('non-existent');
    expect(loaded).toBeNull();
  });

  it('should load all sessions', async () => {
    const sessions: Session[] = [
      {
        id: 'session-1',
        title: 'Session 1',
        createdAt: Date.now() - 1000,
        updatedAt: Date.now() - 1000,
      },
      {
        id: 'session-2',
        title: 'Session 2',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ];

    for (const session of sessions) {
      await storage.save(session);
    }

    const loaded = await storage.loadAll();
    expect(loaded).toHaveLength(2);
    
    // 应该按创建时间排序（最新的在前）
    expect(loaded[0].id).toBe('session-2');
    expect(loaded[1].id).toBe('session-1');
  });

  it('should delete session', async () => {
    const session: Session = {
      id: 'test-session-delete',
      title: 'Delete Test',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await storage.save(session);
    expect(await storage.exists(session.id)).toBe(true);

    const deleted = await storage.delete(session.id);
    expect(deleted).toBe(true);
    expect(await storage.exists(session.id)).toBe(false);
  });

  it('should handle delete of non-existent session', async () => {
    const deleted = await storage.delete('non-existent');
    expect(deleted).toBe(true); // 应该返回true（认为删除成功）
  });

  it('should check session existence', async () => {
    const session: Session = {
      id: 'test-exists',
      title: 'Exists Test',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    expect(await storage.exists(session.id)).toBe(false);
    
    await storage.save(session);
    expect(await storage.exists(session.id)).toBe(true);
  });

  it('should handle sub-sessions correctly', async () => {
    const parent: Session = {
      id: 'parent-session',
      title: 'Parent Session',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const child: Session = {
      id: 'child-session',
      title: 'Child Session',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      parentId: parent.id,
      agentName: 'explore',
      isSubSession: true,
    };

    await storage.save(parent);
    await storage.save(child);

    const loadedParent = await storage.load(parent.id);
    const loadedChild = await storage.load(child.id);

    expect(loadedParent?.isSubSession).toBeUndefined();
    expect(loadedChild?.isSubSession).toBe(true);
    expect(loadedChild?.parentId).toBe(parent.id);
    expect(loadedChild?.agentName).toBe('explore');
  });
});
