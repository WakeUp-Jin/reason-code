import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  unlinkSync,
  rmSync,
  statSync,
} from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import type { Session, Message } from '../context/store.js';
import { logger } from './logger.js';

// ============================================================
// 路径常量
// ============================================================

/** 存储根目录 */
const STORAGE_DIR = join(homedir(), '.reason-code');

/** 会话目录 */
const SESSIONS_DIR = join(STORAGE_DIR, 'sessions');

/** 配置文件路径 */
const CONFIG_FILE = join(STORAGE_DIR, 'config.json');

/** 获取会话目录路径 */
const getSessionDir = (sessionId: string) => join(SESSIONS_DIR, sessionId);

/** 获取历史文件路径 */
const getHistoryPath = (sessionId: string) => join(getSessionDir(sessionId), 'history.json');

/** 获取检查点文件路径 */
const getCheckpointPath = (sessionId: string) => join(getSessionDir(sessionId), 'checkpoint.json');

// ============================================================
// 类型定义
// ============================================================

/**
 * Session 数据结构（历史文件）
 */
export interface SessionData {
  session: Session;
  messages: Message[];
}

/**
 * 检查点数据结构
 */
export interface SessionCheckpoint {
  /** 压缩生成的摘要 */
  summary: string;
  /** 从这个消息 ID 之后开始加载 */
  loadAfterMessageId: string;
  /** 压缩时间戳 */
  compressedAt: number;
  /** 累计统计 */
  stats: {
    /** 累计费用（CNY） */
    totalCost: number;
  };
}

// ============================================================
// 目录管理
// ============================================================

/**
 * 确保存储目录存在
 */
export function ensureStorageDir(): void {
  if (!existsSync(STORAGE_DIR)) {
    mkdirSync(STORAGE_DIR, { recursive: true });
  }
  if (!existsSync(SESSIONS_DIR)) {
    mkdirSync(SESSIONS_DIR, { recursive: true });
  }
}

/**
 * 确保会话目录存在
 */
function ensureSessionDir(sessionId: string): void {
  ensureStorageDir();
  const sessionDir = getSessionDir(sessionId);
  if (!existsSync(sessionDir)) {
    mkdirSync(sessionDir, { recursive: true });
  }
}

// ============================================================
// 会话历史操作
// ============================================================

/**
 * 保存会话（同步）
 */
export function saveSession(session: Session, messages: Message[]): void {
  ensureSessionDir(session.id);

  const data: SessionData = { session, messages };
  const filePath = getHistoryPath(session.id);

  writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

/**
 * 加载会话
 */
export function loadSession(sessionId: string): SessionData | null {
  ensureStorageDir();

  const historyPath = getHistoryPath(sessionId);
  if (!existsSync(historyPath)) {
    return null;
  }

  try {
    const content = readFileSync(historyPath, 'utf-8');
    return JSON.parse(content) as SessionData;
  } catch (error) {
    logger.error(`Failed to load session ${sessionId}`, { error });
    return null;
  }
}

/**
 * 删除会话（包括检查点）
 */
export function deleteSession(sessionId: string): boolean {
  ensureStorageDir();

  const sessionDir = getSessionDir(sessionId);
  if (!existsSync(sessionDir)) {
    return false;
  }

  try {
    rmSync(sessionDir, { recursive: true });
    return true;
  } catch (error) {
    logger.error(`Failed to delete session ${sessionId}`, { error });
    return false;
  }
}

/**
 * 列出所有会话
 */
export function listSessions(): Session[] {
  ensureStorageDir();

  const items = readdirSync(SESSIONS_DIR);
  const sessions: Session[] = [];

  for (const item of items) {
    const itemPath = join(SESSIONS_DIR, item);
    const stat = statSync(itemPath);

    // 只处理目录
    if (stat.isDirectory()) {
      const historyPath = join(itemPath, 'history.json');
      if (existsSync(historyPath)) {
        try {
          const content = readFileSync(historyPath, 'utf-8');
          const data = JSON.parse(content) as SessionData;
          sessions.push(data.session);
        } catch (error) {
          logger.error(`Failed to read session ${item}`, { error });
        }
      }
    }
  }

  // 按更新时间排序（最新的在前）
  return sessions.sort((a, b) => b.updatedAt - a.updatedAt);
}

/**
 * 加载所有会话和消息
 */
export function loadAllSessions(): { sessions: Session[]; messages: Record<string, Message[]> } {
  ensureStorageDir();

  const items = readdirSync(SESSIONS_DIR);
  const sessions: Session[] = [];
  const messages: Record<string, Message[]> = {};

  for (const item of items) {
    const itemPath = join(SESSIONS_DIR, item);
    const stat = statSync(itemPath);

    // 只处理目录
    if (stat.isDirectory()) {
      const historyPath = join(itemPath, 'history.json');
      if (existsSync(historyPath)) {
        try {
          const content = readFileSync(historyPath, 'utf-8');
          const data = JSON.parse(content) as SessionData;
          sessions.push(data.session);
          messages[data.session.id] = data.messages;
        } catch (error) {
          logger.error(`Failed to read session ${item}`, { error });
        }
      }
    }
  }

  // 按更新时间排序（最新的在前）
  sessions.sort((a, b) => b.updatedAt - a.updatedAt);

  return { sessions, messages };
}

// ============================================================
// 检查点操作
// ============================================================

/**
 * 保存检查点
 */
export function saveCheckpoint(sessionId: string, checkpoint: SessionCheckpoint): void {
  ensureSessionDir(sessionId);

  const filePath = getCheckpointPath(sessionId);
  writeFileSync(filePath, JSON.stringify(checkpoint, null, 2), 'utf-8');
  logger.debug(`Checkpoint saved for session ${sessionId}`);
}

/**
 * 加载检查点
 */
export function loadCheckpoint(sessionId: string): SessionCheckpoint | null {
  const filePath = getCheckpointPath(sessionId);

  if (!existsSync(filePath)) {
    return null;
  }

  try {
    const content = readFileSync(filePath, 'utf-8');
    return JSON.parse(content) as SessionCheckpoint;
  } catch (error) {
    logger.error(`Failed to load checkpoint for session ${sessionId}`, { error });
    return null;
  }
}

/**
 * 清除检查点
 */
export function clearCheckpoint(sessionId: string): boolean {
  const filePath = getCheckpointPath(sessionId);

  if (!existsSync(filePath)) {
    return false;
  }

  try {
    unlinkSync(filePath);
    logger.debug(`Checkpoint cleared for session ${sessionId}`);
    return true;
  } catch (error) {
    logger.error(`Failed to clear checkpoint for session ${sessionId}`, { error });
    return false;
  }
}

/**
 * 检查是否有检查点
 */
export function hasCheckpoint(sessionId: string): boolean {
  return existsSync(getCheckpointPath(sessionId));
}

// ============================================================
// 加载会话完整数据（历史 + 检查点）
// ============================================================

/**
 * 加载会话完整数据
 */
export function loadSessionWithCheckpoint(sessionId: string): {
  history: SessionData | null;
  checkpoint: SessionCheckpoint | null;
} {
  return {
    history: loadSession(sessionId),
    checkpoint: loadCheckpoint(sessionId),
  };
}

// ============================================================
// 路径导出
// ============================================================

/**
 * 获取存储路径
 */
export function getStoragePath(): string {
  return STORAGE_DIR;
}

export { STORAGE_DIR, SESSIONS_DIR, CONFIG_FILE };
