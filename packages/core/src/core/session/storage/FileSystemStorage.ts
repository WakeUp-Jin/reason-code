/**
 * 文件系统存储实现
 * 支持会话数据的持久化到JSON文件
 */

import { promises as fs } from 'fs';
import path from 'path';
import type { Session, SessionStorage } from '../types.js';
import { logger } from '../../../utils/logger.js';

export class FileSystemStorage implements SessionStorage {
  private storageDir: string;

  constructor(storageDir: string = './.sessions') {
    this.storageDir = storageDir;
  }

  /**
   * 确保存储目录存在
   */
  private async ensureStorageDir(): Promise<void> {
    try {
      await fs.mkdir(this.storageDir, { recursive: true });
    } catch (error) {
      logger.error('Failed to create storage directory', { error, dir: this.storageDir });
      throw error;
    }
  }

  /**
   * 获取会话文件路径
   */
  private getSessionPath(sessionId: string): string {
    return path.join(this.storageDir, `${sessionId}.json`);
  }

  /**
   * 保存会话到文件
   */
  async save(session: Session): Promise<void> {
    await this.ensureStorageDir();
    
    const filePath = this.getSessionPath(session.id);
    try {
      await fs.writeFile(filePath, JSON.stringify(session, null, 2), 'utf-8');
      logger.debug('Session saved to file', { sessionId: session.id, filePath });
    } catch (error) {
      logger.error('Failed to save session', { error, sessionId: session.id, filePath });
      throw error;
    }
  }

  /**
   * 从文件加载会话
   */
  async load(sessionId: string): Promise<Session | null> {
    const filePath = this.getSessionPath(sessionId);
    
    try {
      const data = await fs.readFile(filePath, 'utf-8');
      const session = JSON.parse(data) as Session;
      logger.debug('Session loaded from file', { sessionId, filePath });
      return session;
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        // 文件不存在，返回null
        return null;
      }
      logger.error('Failed to load session', { error, sessionId, filePath });
      throw error;
    }
  }

  /**
   * 加载所有会话
   */
  async loadAll(): Promise<Session[]> {
    try {
      await this.ensureStorageDir();
      const files = await fs.readdir(this.storageDir);
      const sessionFiles = files.filter(file => file.endsWith('.json'));
      
      const sessions: Session[] = [];
      for (const file of sessionFiles) {
        try {
          const filePath = path.join(this.storageDir, file);
          const data = await fs.readFile(filePath, 'utf-8');
          const session = JSON.parse(data) as Session;
          sessions.push(session);
        } catch (error) {
          logger.warn('Failed to load session file', { error, file });
          // 继续加载其他文件
        }
      }
      
      // 按创建时间排序（最新的在前）
      sessions.sort((a, b) => b.createdAt - a.createdAt);
      
      logger.debug('All sessions loaded', { count: sessions.length });
      return sessions;
    } catch (error) {
      logger.error('Failed to load all sessions', { error });
      return [];
    }
  }

  /**
   * 删除会话文件
   */
  async delete(sessionId: string): Promise<boolean> {
    const filePath = this.getSessionPath(sessionId);
    
    try {
      await fs.unlink(filePath);
      logger.debug('Session file deleted', { sessionId, filePath });
      return true;
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        // 文件不存在，认为删除成功
        return true;
      }
      logger.error('Failed to delete session file', { error, sessionId, filePath });
      return false;
    }
  }

  /**
   * 检查会话文件是否存在
   */
  async exists(sessionId: string): Promise<boolean> {
    const filePath = this.getSessionPath(sessionId);
    
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 清理所有会话文件（用于测试）
   */
  async clear(): Promise<void> {
    try {
      const files = await fs.readdir(this.storageDir);
      const sessionFiles = files.filter(file => file.endsWith('.json'));
      
      for (const file of sessionFiles) {
        const filePath = path.join(this.storageDir, file);
        await fs.unlink(filePath);
      }
      
      logger.debug('All session files cleared', { count: sessionFiles.length });
    } catch (error) {
      logger.error('Failed to clear session files', { error });
    }
  }

  /**
   * 获取存储目录路径
   */
  getStorageDir(): string {
    return this.storageDir;
  }
}
