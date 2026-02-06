/**
 * MonitorFileOps - 监控文件操作工具类
 * 
 * 负责监控文件的：
 * - 路径管理（目录、文件命名）
 * - 状态转换（active/idle）
 * - 清理策略（过期文件删除）
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

/** 监控文件状态 */
export type MonitorStatus = 'active' | 'idle';

/** 解析后的文件名信息 */
export interface ParsedMonitorFileName {
  sessionId: string;
  status: MonitorStatus;
}

/** 清理结果 */
export interface CleanupResult {
  /** 已删除的文件 */
  deleted: string[];
  /** 已标记为 idle 的文件 */
  markedIdle: string[];
}

/**
 * 监控文件操作工具类
 */
export class MonitorFileOps {
  /** monitors 目录名 */
  private static readonly MONITORS_DIR = 'monitors';
  /** reason-code 配置目录名 */
  private static readonly CONFIG_DIR = '.reason-code';
  /** 默认超时时间（分钟） */
  private static readonly DEFAULT_TIMEOUT_MINUTES = 30;

  /**
   * 获取 monitors 目录路径
   * ~/.reason-code/monitors/
   */
  static getMonitorsDir(): string {
    const homeDir = os.homedir();
    return path.join(homeDir, this.CONFIG_DIR, this.MONITORS_DIR);
  }

  /**
   * 确保 monitors 目录存在
   */
  static ensureMonitorsDir(): void {
    const monitorsDir = this.getMonitorsDir();
    if (!fs.existsSync(monitorsDir)) {
      fs.mkdirSync(monitorsDir, { recursive: true });
    }
  }

  /**
   * 构建监控文件路径
   * @param sessionId - 会话 ID
   * @param status - 文件状态
   * @returns 完整文件路径
   */
  static buildFilePath(sessionId: string, status: MonitorStatus): string {
    const monitorsDir = this.getMonitorsDir();
    return path.join(monitorsDir, `session_${sessionId}_${status}.md`);
  }

  /**
   * 解析文件名，提取 sessionId 和 status
   * @param fileName - 文件名（不含路径）
   * @returns 解析结果，失败返回 null
   */
  static parseFileName(fileName: string): ParsedMonitorFileName | null {
    // 格式: session_{sessionId}_{status}.md
    const match = fileName.match(/^session_(.+)_(active|idle)\.md$/);
    if (!match) {
      return null;
    }

    return {
      sessionId: match[1],
      status: match[2] as MonitorStatus,
    };
  }

  /**
   * 查找会话的监控文件（不管状态）
   * @param sessionId - 会话 ID
   * @returns 文件完整路径，不存在返回 null
   */
  static findSessionFile(sessionId: string): string | null {
    const monitorsDir = this.getMonitorsDir();
    
    if (!fs.existsSync(monitorsDir)) {
      return null;
    }

    const files = fs.readdirSync(monitorsDir);
    const pattern = `session_${sessionId}_`;
    const found = files.find(f => f.startsWith(pattern) && f.endsWith('.md'));

    return found ? path.join(monitorsDir, found) : null;
  }

  /**
   * 设置文件状态（通过重命名）
   * @param sessionId - 会话 ID
   * @param newStatus - 新状态
   */
  static setStatus(sessionId: string, newStatus: MonitorStatus): void {
    const existingFile = this.findSessionFile(sessionId);
    if (!existingFile) {
      return;
    }

    const newPath = this.buildFilePath(sessionId, newStatus);

    if (existingFile !== newPath) {
      fs.renameSync(existingFile, newPath);
    }
  }

  /**
   * 获取文件当前状态
   * @param sessionId - 会话 ID
   * @returns 当前状态，文件不存在返回 null
   */
  static getStatus(sessionId: string): MonitorStatus | null {
    const existingFile = this.findSessionFile(sessionId);
    if (!existingFile) {
      return null;
    }

    const parsed = this.parseFileName(path.basename(existingFile));
    return parsed?.status ?? null;
  }

  /**
   * 列出所有活跃的监控文件
   * @returns 活跃文件的完整路径数组
   */
  static listActiveFiles(): string[] {
    const monitorsDir = this.getMonitorsDir();
    
    if (!fs.existsSync(monitorsDir)) {
      return [];
    }

    return fs.readdirSync(monitorsDir)
      .filter(f => f.endsWith('_active.md'))
      .map(f => path.join(monitorsDir, f));
  }

  /**
   * 列出所有空闲的监控文件
   * @returns 空闲文件的完整路径数组
   */
  static listIdleFiles(): string[] {
    const monitorsDir = this.getMonitorsDir();
    
    if (!fs.existsSync(monitorsDir)) {
      return [];
    }

    return fs.readdirSync(monitorsDir)
      .filter(f => f.endsWith('_idle.md'))
      .map(f => path.join(monitorsDir, f));
  }

  /**
   * 列出所有监控文件
   * @returns 所有监控文件的完整路径数组
   */
  static listAllFiles(): string[] {
    const monitorsDir = this.getMonitorsDir();
    
    if (!fs.existsSync(monitorsDir)) {
      return [];
    }

    return fs.readdirSync(monitorsDir)
      .filter(f => f.startsWith('session_') && f.endsWith('.md'))
      .map(f => path.join(monitorsDir, f));
  }

  /**
   * 清理过期文件
   * 
   * 清理规则：
   * 1. 昨天的 idle 文件 → 删除
   * 2. 昨天的 active 文件 → 标记为 idle（可能是异常退出）
   * 3. 今天超过 30 分钟无更新的 active 文件 → 标记为 idle
   * 
   * @param timeoutMinutes - 超时时间（分钟），默认 30
   * @returns 清理结果
   */
  static cleanupStaleFiles(timeoutMinutes = this.DEFAULT_TIMEOUT_MINUTES): CleanupResult {
    const monitorsDir = this.getMonitorsDir();
    const result: CleanupResult = {
      deleted: [],
      markedIdle: [],
    };

    if (!fs.existsSync(monitorsDir)) {
      return result;
    }

    const now = new Date();
    const today = now.toDateString();
    const files = fs.readdirSync(monitorsDir);

    for (const file of files) {
      const parsed = this.parseFileName(file);
      if (!parsed) {
        continue;
      }

      const filePath = path.join(monitorsDir, file);
      
      let stats: fs.Stats;
      try {
        stats = fs.statSync(filePath);
      } catch {
        // 文件可能已被删除
        continue;
      }

      const fileDate = stats.mtime.toDateString();

      // 规则 1: 删除昨天的 idle 文件
      if (fileDate !== today && parsed.status === 'idle') {
        try {
          fs.unlinkSync(filePath);
          result.deleted.push(file);
        } catch {
          // 忽略删除失败
        }
        continue;
      }

      // 规则 2: 昨天的 active 文件 → 标记为 idle（可能是异常退出）
      if (fileDate !== today && parsed.status === 'active') {
        this.setStatus(parsed.sessionId, 'idle');
        result.markedIdle.push(file);
        continue;
      }

      // 规则 3: 今天的 active 文件超过 timeout 分钟无更新 → 标记为 idle
      if (parsed.status === 'active') {
        const idleMinutes = (now.getTime() - stats.mtime.getTime()) / 1000 / 60;
        if (idleMinutes > timeoutMinutes) {
          this.setStatus(parsed.sessionId, 'idle');
          result.markedIdle.push(file);
        }
      }
    }

    return result;
  }

  /**
   * 删除指定会话的监控文件
   * @param sessionId - 会话 ID
   * @returns 是否成功删除
   */
  static deleteSessionFile(sessionId: string): boolean {
    const existingFile = this.findSessionFile(sessionId);
    if (!existingFile) {
      return false;
    }

    try {
      fs.unlinkSync(existingFile);
      return true;
    } catch {
      return false;
    }
  }
}
