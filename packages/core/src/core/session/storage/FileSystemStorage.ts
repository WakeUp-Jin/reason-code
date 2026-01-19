/**
 * 文件系统存储实现
 * 支持会话数据的持久化，采用目录结构：
 * ~/.reason-code/sessions/{sessionId}/
 * ├── session.json      # Session 元数据
 * ├── history.jsonl     # Messages（JSONL 格式，每行一条消息）
 * └── checkpoint.json   # Checkpoint 数据
 *
 * 使用 Bun 原生 API 进行文件读写操作
 */

import { mkdir, readdir, rm, unlink } from 'fs/promises';
import path from 'path';
import os from 'os';
import type {
  SessionMetadata,
  SessionStorage,
  StoredMessage,
  SessionCheckpoint,
  SessionData,
} from '../types.js';
import { logger } from '../../../utils/logger.js';

export class FileSystemStorage implements SessionStorage {
  private storageDir: string;
  private writeQueue = new Map<string, Promise<void>>();

  constructor(storageDir: string = '~/.reason-code/sessions') {
    // 处理 ~ 路径
    this.storageDir = storageDir.startsWith('~')
      ? path.join(os.homedir(), storageDir.slice(1))
      : path.resolve(storageDir);
  }

  // ============================================================
  // 私有辅助方法
  // ============================================================

  /**
   * 获取会话目录路径
   */
  private getSessionDir(sessionId: string): string {
    return path.join(this.storageDir, sessionId);
  }

  /**
   * 获取 session.json 路径
   */
  private getSessionPath(sessionId: string): string {
    return path.join(this.getSessionDir(sessionId), 'session.json');
  }

  /**
   * 获取 history.jsonl 路径
   */
  private getHistoryPath(sessionId: string): string {
    return path.join(this.getSessionDir(sessionId), 'history.jsonl');
  }

  /**
   * 获取 checkpoint.json 路径
   */
  private getCheckpointPath(sessionId: string): string {
    return path.join(this.getSessionDir(sessionId), 'checkpoint.json');
  }

  /**
   * 确保目录存在
   */
  private async ensureDir(dirPath: string): Promise<void> {
    try {
      await mkdir(dirPath, { recursive: true });
    } catch (error) {
      logger.error('Failed to create directory', { error, dir: dirPath });
      throw error;
    }
  }

  /**
   * 排队写入（防止并发冲突）
   */
  private async queuedWrite(filePath: string, data: string): Promise<void> {
    // 等待之前的写入完成
    const prev = this.writeQueue.get(filePath);
    if (prev) {
      try {
        await prev;
      } catch {
        // 忽略之前的错误，继续写入
      }
    }

    // 执行写入操作（Bun.write 自带原子写入特性）
    const writePromise = this.doWrite(filePath, data);
    this.writeQueue.set(filePath, writePromise);

    try {
      await writePromise;
    } finally {
      this.writeQueue.delete(filePath);
    }
  }

  /**
   * 使用 Bun.write 进行写入
   * Bun.write 内部已实现原子写入，无需手动 tmp+rename
   */
  private async doWrite(filePath: string, data: string): Promise<void> {
    await this.ensureDir(path.dirname(filePath));
    await Bun.write(filePath, data);
  }

  // ============================================================
  // Session 管理
  // ============================================================

  /**
   * 保存会话元数据
   */
  async save(session: SessionMetadata): Promise<void> {
    const filePath = this.getSessionPath(session.id);
    try {
      await this.queuedWrite(filePath, JSON.stringify(session, null, 2));
      logger.debug('Session saved to file', { sessionId: session.id, filePath });
    } catch (error) {
      logger.error('Failed to save session', { error, sessionId: session.id, filePath });
      throw error;
    }
  }

  /**
   * 加载会话元数据
   */
  async load(sessionId: string): Promise<SessionMetadata | null> {
    const filePath = this.getSessionPath(sessionId);
    const file = Bun.file(filePath);

    try {
      const exists = await file.exists();
      if (!exists) {
        return null;
      }
      const session = (await file.json()) as SessionMetadata;
      logger.debug('Session loaded from file', { sessionId, filePath });
      return session;
    } catch (error: any) {
      logger.error('Failed to load session', { error, sessionId, filePath });
      throw error;
    }
  }

  /**
   * 加载所有会话元数据
   */
  async loadAll(): Promise<SessionMetadata[]> {
    try {
      await this.ensureDir(this.storageDir);
      const items = await readdir(this.storageDir, { withFileTypes: true });
      const sessions: SessionMetadata[] = [];

      for (const item of items) {
        // 只处理目录
        if (item.isDirectory()) {
          const sessionPath = path.join(this.storageDir, item.name, 'session.json');
          const file = Bun.file(sessionPath);
          try {
            const exists = await file.exists();
            if (exists) {
              const session = (await file.json()) as SessionMetadata;
              sessions.push(session);
            }
          } catch (error: any) {
            logger.warn('Failed to load session file', { error, sessionId: item.name });
            // 继续加载其他会话
          }
        }
      }

      // 按更新时间排序（最新的在前）
      sessions.sort((a, b) => b.updatedAt - a.updatedAt);

      logger.debug('All sessions loaded', { count: sessions.length });
      return sessions;
    } catch (error) {
      logger.error('Failed to load all sessions', { error });
      return [];
    }
  }

  /**
   * 删除会话（包括所有相关文件）
   */
  async delete(sessionId: string): Promise<boolean> {
    const sessionDir = this.getSessionDir(sessionId);

    try {
      await rm(sessionDir, { recursive: true, force: true });
      logger.debug('Session directory deleted', { sessionId, sessionDir });
      return true;
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return true;
      }
      logger.error('Failed to delete session directory', { error, sessionId, sessionDir });
      return false;
    }
  }

  /**
   * 检查会话是否存在
   */
  async exists(sessionId: string): Promise<boolean> {
    const filePath = this.getSessionPath(sessionId);
    return await Bun.file(filePath).exists();
  }

  // ============================================================
  // Message 管理（JSONL 格式）
  // ============================================================

  /**
   * 保存所有消息（完整重写）
   * 用于：初始化、迁移、重建
   */
  async saveMessages(sessionId: string, messages: StoredMessage[]): Promise<void> {
    const historyPath = this.getHistoryPath(sessionId);

    try {
      // 将消息数组转换为 JSONL 格式
      const jsonlContent =
        messages.length > 0
          ? messages.map((msg) => JSON.stringify(msg)).join('\n') + '\n'
          : '';

      await this.queuedWrite(historyPath, jsonlContent);
      logger.debug('Messages saved', { sessionId, count: messages.length });
    } catch (error) {
      logger.error('Failed to save messages', { error, sessionId });
      throw error;
    }
  }

  /**
   * 加载所有消息
   * 逐行解析 JSONL，单行损坏不影响其他消息
   */
  async loadMessages(sessionId: string): Promise<StoredMessage[]> {
    const historyPath = this.getHistoryPath(sessionId);
    const file = Bun.file(historyPath);

    try {
      const exists = await file.exists();
      if (!exists) {
        return [];
      }

      const content = await file.text();
      const messages: StoredMessage[] = [];
      const lines = content.split('\n');

      for (const line of lines) {
        if (line.trim()) {
          try {
            messages.push(JSON.parse(line));
          } catch (error) {
            // 单行损坏，跳过并记录
            logger.warn('Failed to parse message line', {
              sessionId,
              line: line.substring(0, 100),
            });
          }
        }
      }

      logger.debug('Messages loaded', { sessionId, count: messages.length });
      return messages;
    } catch (error: any) {
      logger.error('Failed to load messages', { error, sessionId });
      throw error;
    }
  }

  // ============================================================
  // Checkpoint 管理
  // ============================================================

  /**
   * 保存检查点
   */
  async saveCheckpoint(sessionId: string, checkpoint: SessionCheckpoint): Promise<void> {
    const checkpointPath = this.getCheckpointPath(sessionId);

    try {
      await this.queuedWrite(checkpointPath, JSON.stringify(checkpoint, null, 2));
      logger.debug('Checkpoint saved', { sessionId });
    } catch (error) {
      logger.error('Failed to save checkpoint', { error, sessionId });
      throw error;
    }
  }

  /**
   * 加载检查点
   */
  async loadCheckpoint(sessionId: string): Promise<SessionCheckpoint | null> {
    const checkpointPath = this.getCheckpointPath(sessionId);
    const file = Bun.file(checkpointPath);

    try {
      const exists = await file.exists();
      if (!exists) {
        return null;
      }
      const checkpoint = (await file.json()) as SessionCheckpoint;
      logger.debug('Checkpoint loaded', { sessionId });
      return checkpoint;
    } catch (error: any) {
      logger.error('Failed to load checkpoint', { error, sessionId });
      throw error;
    }
  }

  /**
   * 删除检查点
   */
  async deleteCheckpoint(sessionId: string): Promise<boolean> {
    const checkpointPath = this.getCheckpointPath(sessionId);

    try {
      await unlink(checkpointPath);
      logger.debug('Checkpoint deleted', { sessionId });
      return true;
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return true;
      }
      logger.error('Failed to delete checkpoint', { error, sessionId });
      return false;
    }
  }

  // ============================================================
  // 原子操作
  // ============================================================

  /**
   * 保存完整会话数据（Session + Messages + Checkpoint）
   */
  async saveSessionData(data: SessionData): Promise<void> {
    const { session, messages, checkpoint } = data;

    try {
      await Promise.all([
        this.save(session),
        this.saveMessages(session.id, messages),
        checkpoint ? this.saveCheckpoint(session.id, checkpoint) : Promise.resolve(),
      ]);
      logger.debug('Session data saved', { sessionId: session.id });
    } catch (error) {
      logger.error('Failed to save session data', { error, sessionId: session.id });
      throw error;
    }
  }

  /**
   * 加载完整会话数据（Session + Messages + Checkpoint）
   */
  async loadSessionData(sessionId: string): Promise<SessionData | null> {
    try {
      const [session, messages, checkpoint] = await Promise.all([
        this.load(sessionId),
        this.loadMessages(sessionId),
        this.loadCheckpoint(sessionId),
      ]);

      if (!session) {
        return null;
      }

      return {
        session,
        messages,
        checkpoint: checkpoint || undefined,
      };
    } catch (error) {
      logger.error('Failed to load session data', { error, sessionId });
      throw error;
    }
  }

  // ============================================================
  // 工具方法
  // ============================================================

  /**
   * 清理所有会话（用于测试）
   */
  async clear(): Promise<void> {
    try {
      const items = await readdir(this.storageDir, { withFileTypes: true });

      for (const item of items) {
        if (item.isDirectory()) {
          const sessionDir = path.join(this.storageDir, item.name);
          await rm(sessionDir, { recursive: true, force: true });
        }
      }

      logger.debug('All sessions cleared');
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        logger.error('Failed to clear sessions', { error });
      }
    }
  }

  /**
   * 获取存储目录路径
   */
  getStorageDir(): string {
    return this.storageDir;
  }
}
