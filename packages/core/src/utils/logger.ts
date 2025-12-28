/**
 * Core 日志系统
 *
 * 设计原则：
 * - 日志写入文件，不输出到终端（避免干扰 TUI）
 * - 支持 4 个日志级别：DEBUG, INFO, WARN, ERROR
 * - 缓冲写入优化性能
 * - 优雅的错误处理（日志失败不影响 Core 运行）
 * - 支持由上层（CLI/Web）配置日志目录
 *
 * 使用示例：
 * ```typescript
 * import { logger } from './utils/logger.js'
 *
 * // 基本用法
 * logger.debug('Detailed info')
 * logger.info('Tool executed', { tool: 'ReadFile' })
 * logger.warn('Potential issue')
 * logger.error('Operation failed', error)
 *
 * // 配置（通常由 CLI 层调用）
 * logger.configure({ logsDir: '/path/to/logs', enabled: true })
 * logger.createSession()
 * logger.flush()
 * ```
 */

import { appendFileSync, existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'fs';
import { join } from 'path';

/**
 * 日志级别
 */
export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

/**
 * Logger 配置
 */
export interface LoggerConfig {
  /** 是否启用日志 */
  enabled: boolean;
  /** 最小日志级别 */
  minLevel: LogLevel;
  /** 保留天数（0 = 永不清理） */
  retentionDays: number;
  /** 缓冲区大小（条数） */
  bufferSize: number;
  /** 日志目录（由上层注入） */
  logsDir?: string;
}

/**
 * 默认配置
 */
const DEFAULT_CONFIG: LoggerConfig = {
  enabled: false, // 默认禁用，等待上层配置
  minLevel: 'INFO',
  retentionDays: 7,
  bufferSize: 1, // 减小缓冲区，确保日志及时写入
  logsDir: undefined,
};

/**
 * 日志级别权重
 */
const LOG_LEVELS: Record<LogLevel, number> = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
};

/**
 * Logger 类 - Core 包文件日志系统
 */
class Logger {
  private static instance: Logger;
  private currentLogFile: string | null = null;
  private currentSessionId: string | null = null;
  private buffer: string[] = [];
  private config: LoggerConfig = { ...DEFAULT_CONFIG };
  private initialized = false;

  private constructor() {}

  /**
   * 获取单例实例
   */
  static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  /**
   * 配置 Logger
   * 由上层（CLI/Web）调用，注入日志目录等配置
   */
  configure(config: Partial<LoggerConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * 创建新的日志 Session
   * 在应用启动时调用
   */
  createSession(): void {
    if (!this.config.logsDir) {
      // 没有配置日志目录，静默忽略
      return;
    }

    try {
      this.ensureLogsDir();
      this.currentSessionId = this.generateSessionId();
      this.currentLogFile = join(this.config.logsDir, `core-${this.currentSessionId}.log`);

      // 写入 session 开始标记
      this.writeToFile(`${'='.repeat(80)}\n`);
      this.writeToFile(`[Core] Session started: ${new Date().toISOString()}\n`);
      this.writeToFile(`${'='.repeat(80)}\n`);

      this.initialized = true;
      this.cleanup();
    } catch (error) {
      this.handleError('Failed to create log session', error);
    }
  }

  /**
   * DEBUG 级别日志
   */
  debug(message: string, context?: any): void {
    this.write('DEBUG', message, context);
  }

  /**
   * INFO 级别日志
   */
  info(message: string, context?: any): void {
    this.write('INFO', message, context);
  }

  /**
   * WARN 级别日志
   */
  warn(message: string, context?: any): void {
    this.write('WARN', message, context);
  }

  /**
   * ERROR 级别日志
   */
  error(message: string, context?: any): void {
    this.write('ERROR', message, context);
    // ERROR 级别立即 flush，确保错误日志不丢失
    this.flush();
  }

  /**
   * 刷新缓冲区
   */
  flush(): void {
    try {
      this.flushBuffer();
    } catch (error) {
      this.handleError('Failed to flush logs', error);
    }
  }

  /**
   * 清理旧日志文件
   */
  cleanup(retentionDays?: number): void {
    if (!this.config.logsDir) return;

    try {
      const days = retentionDays ?? this.config.retentionDays;
      if (days === 0) return;

      const cutoffTime = Date.now() - days * 24 * 60 * 60 * 1000;

      if (!existsSync(this.config.logsDir)) return;

      const files = readdirSync(this.config.logsDir).filter(
        (f) => f.startsWith('core-') && f.endsWith('.log')
      );

      let deletedCount = 0;
      for (const file of files) {
        const filePath = join(this.config.logsDir, file);
        const stats = statSync(filePath);
        if (stats.mtimeMs < cutoffTime) {
          unlinkSync(filePath);
          deletedCount++;
        }
      }

      if (deletedCount > 0) {
        this.debug(`Cleaned up ${deletedCount} old core log file(s)`);
      }
    } catch (error) {
      this.handleError('Failed to cleanup old logs', error);
    }
  }

  /**
   * 获取当前 session ID
   */
  getSessionId(): string | null {
    return this.currentSessionId;
  }

  /**
   * 检查是否已初始化
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * 写入日志
   */
  private write(level: LogLevel, message: string, context?: any): void {
    // 未配置或未启用时静默忽略
    if (!this.config.enabled || !this.initialized) return;
    if (!this.shouldLog(level)) return;

    try {
      const entry = this.formatEntry(level, message, context);
      this.buffer.push(entry);

      if (this.buffer.length >= this.config.bufferSize) {
        this.flushBuffer();
      }
    } catch (error) {
      this.handleError('Failed to write log', error);
    }
  }

  /**
   * 格式化日志条目
   */
  private formatEntry(level: LogLevel, message: string, context?: any): string {
    const timestamp = this.getTimestamp();
    const contextStr = context ? ` ${this.serializeContext(context)}` : '';
    return `[${timestamp}] [${level}] ${message}${contextStr}`;
  }

  /**
   * 生成时间戳
   */
  private getTimestamp(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    const millis = String(now.getMilliseconds()).padStart(3, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}.${millis}`;
  }

  /**
   * 序列化上下文
   */
  private serializeContext(context: any): string {
    try {
      if (context instanceof Error) {
        return JSON.stringify({
          name: context.name,
          message: context.message,
          stack: context.stack,
        });
      }
      return JSON.stringify(context);
    } catch {
      return String(context);
    }
  }

  /**
   * 判断是否应该记录
   */
  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVELS[level] >= LOG_LEVELS[this.config.minLevel];
  }

  /**
   * 刷新缓冲区到文件
   */
  private flushBuffer(): void {
    if (this.buffer.length === 0) return;
    if (!this.currentLogFile) return;

    try {
      const content = this.buffer.join('\n') + '\n';
      this.writeToFile(content);
      this.buffer = [];
    } catch (error) {
      this.handleError('Failed to flush buffer', error);
    }
  }

  /**
   * 写入内容到文件
   */
  private writeToFile(content: string): void {
    if (!this.currentLogFile) return;

    try {
      appendFileSync(this.currentLogFile, content, 'utf-8');
    } catch (error) {
      // 写入失败时禁用日志
      this.config.enabled = false;
    }
  }

  /**
   * 确保日志目录存在
   */
  private ensureLogsDir(): void {
    if (!this.config.logsDir) return;
    if (!existsSync(this.config.logsDir)) {
      mkdirSync(this.config.logsDir, { recursive: true });
    }
  }

  /**
   * 生成 session ID
   */
  private generateSessionId(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    return `${year}-${month}-${day}_${hours}-${minutes}-${seconds}`;
  }

  /**
   * 错误处理
   */
  private handleError(_message: string, _error: any): void {
    // 日志系统的错误静默处理，不影响 Core 运行
    // 不输出到 stderr，避免干扰 TUI
  }
}

/**
 * 导出 Logger 单例
 */
export const logger = Logger.getInstance();
