/**
 * 异步存储模块
 * 提供非阻塞的文件写入功能，避免 I/O 操作阻塞主线程
 */

import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';
import type { SessionType } from '@reason-code/core';
import type { Message } from '../context/store.js';
import type { SessionCheckpoint } from './storage.js';
import { logger } from './logger.js';

// ============================================================
// 路径常量
// ============================================================

const STORAGE_DIR = join(homedir(), '.reason-code');
const SESSIONS_DIR = join(STORAGE_DIR, 'sessions');

const getSessionDir = (sessionId: string) => join(SESSIONS_DIR, sessionId);
const getHistoryPath = (sessionId: string) => join(getSessionDir(sessionId), 'history.json');
const getCheckpointPath = (sessionId: string) => join(getSessionDir(sessionId), 'checkpoint.json');

// ============================================================
// 写入队列（防止并发写入冲突）
// ============================================================

/** 写入队列：每个文件路径对应一个 Promise */
const writeQueue = new Map<string, Promise<void>>();

/** 待处理的写入任务 */
const pendingWrites = new Set<string>();

/**
 * 确保目录存在（异步）
 */
async function ensureDir(dirPath: string): Promise<void> {
  if (!existsSync(dirPath)) {
    await mkdir(dirPath, { recursive: true });
  }
}

/**
 * 排队写入文件（避免并发冲突）
 */
async function queuedWrite(filePath: string, data: string): Promise<void> {
  // 等待之前的写入完成
  const prev = writeQueue.get(filePath);
  if (prev) {
    try {
      await prev;
    } catch {
      // 忽略之前的错误，继续写入
    }
  }

  // 执行写入操作
  const doWrite = async (): Promise<void> => {
    try {
      // 确保目录存在
      await ensureDir(dirname(filePath));
      // 写入文件
      await writeFile(filePath, data, 'utf-8');
    } finally {
      // 写入完成后从队列移除
      writeQueue.delete(filePath);
      pendingWrites.delete(filePath);
    }
  };

  // 创建写入 Promise 并加入队列
  const writePromise = doWrite();
  writeQueue.set(filePath, writePromise);
  pendingWrites.add(filePath);

  return writePromise;
}

// ============================================================
// 异步保存函数
// ============================================================

/**
 * 异步保存会话历史
 * 不阻塞主线程，适合在消息完成后调用
 */
export async function asyncSaveSession(session: SessionType, messages: Message[]): Promise<void> {
  const filePath = getHistoryPath(session.id);
  const data = JSON.stringify({ session, messages }, null, 2);

  try {
    await queuedWrite(filePath, data);
    logger.debug(`Session ${session.id} saved asynchronously`);
  } catch (error) {
    logger.error(`Failed to save session ${session.id} asynchronously`, { error });
    throw error;
  }
}

/**
 * 异步保存检查点
 * 不阻塞主线程，适合在压缩完成后调用
 */
export async function asyncSaveCheckpoint(
  sessionId: string,
  checkpoint: SessionCheckpoint
): Promise<void> {
  const filePath = getCheckpointPath(sessionId);
  const data = JSON.stringify(checkpoint, null, 2);

  try {
    await queuedWrite(filePath, data);
    logger.debug(`Checkpoint for session ${sessionId} saved asynchronously`);
  } catch (error) {
    logger.error(`Failed to save checkpoint for session ${sessionId} asynchronously`, { error });
    throw error;
  }
}

/**
 * 触发异步保存（不等待完成）
 * 返回 void，让调用方可以继续执行
 */
export function triggerAsyncSave(session: SessionType, messages: Message[]): void {
  // 不等待，直接触发
  asyncSaveSession(session, messages).catch((error) => {
    logger.error(`Background save failed for session ${session.id}`, { error });
  });
}

/**
 * 触发异步保存检查点（不等待完成）
 */
export function triggerAsyncSaveCheckpoint(sessionId: string, checkpoint: SessionCheckpoint): void {
  asyncSaveCheckpoint(sessionId, checkpoint).catch((error) => {
    logger.error(`Background checkpoint save failed for session ${sessionId}`, { error });
  });
}

// ============================================================
// 等待所有写入完成
// ============================================================

/**
 * 等待所有待处理的写入完成
 * 在程序退出前调用，确保数据不丢失
 */
export async function flushAllWrites(): Promise<void> {
  const pending = Array.from(writeQueue.values());
  if (pending.length > 0) {
    logger.debug(`Flushing ${pending.length} pending writes...`);
    await Promise.allSettled(pending);
    logger.debug('All writes flushed');
  }
}

/**
 * 检查是否有待处理的写入
 */
export function hasPendingWrites(): boolean {
  return pendingWrites.size > 0;
}

/**
 * 获取待处理写入数量
 */
export function getPendingWriteCount(): number {
  return pendingWrites.size;
}
