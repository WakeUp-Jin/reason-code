import { appendFileSync, existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'fs'
import { join } from 'path'

/**
 * 日志级别
 */
export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR'

/**
 * Logger 配置
 */
export interface LoggerConfig {
  enabled: boolean // 是否启用日志
  minLevel: LogLevel // 最小日志级别
  retentionDays: number // 保留天数（0 = 永不清理）
  bufferSize: number // 缓冲区大小（条数）
}

/**
 * 默认配置
 */
const DEFAULT_CONFIG: LoggerConfig = {
  enabled: true,
  minLevel: 'INFO',
  retentionDays: 7,
  bufferSize: 100,
}

/**
 * 日志级别权重（用于比较）
 */
const LOG_LEVELS: Record<LogLevel, number> = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
}

/**
 * Logger 工具类 - 文件日志系统
 *
 * 功能：
 * - 文件日志（避免干扰终端 UI）
 * - Session-based 日志文件（每次 CLI 启动创建新文件）
 * - 4 个日志级别：DEBUG, INFO, WARN, ERROR
 * - 自动清理旧日志（可配置保留天数）
 * - 缓冲写入优化性能
 * - 优雅的错误处理（日志失败不影响 CLI 运行）
 *
 * 使用示例：
 * ```typescript
 * import { logger } from './util/logger.js'
 *
 * // 基本用法
 * logger.debug('Detailed info')
 * logger.info('User action', { userId: '123' })
 * logger.warn('Potential issue')
 * logger.error('Operation failed', error)
 *
 * // Session 管理
 * logger.createSession()  // CLI 启动时调用
 * logger.flush()          // CLI 退出时调用
 * ```
 */
class Logger {
  private static instance: Logger
  private currentLogFile: string | null = null
  private currentSessionId: string | null = null
  private buffer: string[] = []
  private config: LoggerConfig = { ...DEFAULT_CONFIG }
  private logsDir: string

  /**
   * 私有构造函数（单例模式）
   */
  private constructor() {
    // 日志目录在项目根目录
    this.logsDir = join(process.cwd(), 'logs')
  }

  /**
   * 获取 Logger 单例实例
   */
  static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger()
    }
    return Logger.instance
  }

  /**
   * 创建新的日志 Session
   * 在 CLI 启动时调用，创建新的日志文件
   */
  createSession(): void {
    try {
      // 确保日志目录存在
      this.ensureLogsDir()

      // 生成 session ID（时间戳）
      this.currentSessionId = this.generateSessionId()

      // 创建日志文件路径
      this.currentLogFile = join(this.logsDir, `${this.currentSessionId}.log`)

      // 写入 session 开始标记
      this.writeToFile(`${'='.repeat(80)}\n`)
      this.writeToFile(`Session started: ${new Date().toISOString()}\n`)
      this.writeToFile(`${'='.repeat(80)}\n`)

      // 清理旧日志
      this.cleanup()
    } catch (error) {
      this.handleError('Failed to create log session', error)
    }
  }

  /**
   * DEBUG 级别日志
   */
  debug(message: string, context?: any): void {
    this.write('DEBUG', message, context)
  }

  /**
   * INFO 级别日志
   */
  info(message: string, context?: any): void {
    this.write('INFO', message, context)
  }

  /**
   * WARN 级别日志
   */
  warn(message: string, context?: any): void {
    this.write('WARN', message, context)
  }

  /**
   * ERROR 级别日志
   */
  error(message: string, context?: any): void {
    this.write('ERROR', message, context)
  }

  /**
   * 刷新缓冲区，确保所有日志写入文件
   * 在 CLI 退出时调用
   */
  flush(): void {
    try {
      this.flushBuffer()
    } catch (error) {
      this.handleError('Failed to flush logs', error)
    }
  }

  /**
   * 清理旧日志文件
   * @param retentionDays 保留天数（可选，默认使用配置值）
   */
  cleanup(retentionDays?: number): void {
    try {
      const days = retentionDays ?? this.config.retentionDays
      if (days === 0) return // 0 表示永不清理

      const cutoffTime = Date.now() - days * 24 * 60 * 60 * 1000

      // 确保目录存在
      if (!existsSync(this.logsDir)) return

      // 读取所有 .log 文件
      const files = readdirSync(this.logsDir).filter((f) => f.endsWith('.log'))

      let deletedCount = 0
      for (const file of files) {
        const filePath = join(this.logsDir, file)
        const stats = statSync(filePath)

        // 删除超过保留期的文件
        if (stats.mtimeMs < cutoffTime) {
          unlinkSync(filePath)
          deletedCount++
        }
      }

      if (deletedCount > 0) {
        this.debug(`Cleaned up ${deletedCount} old log file(s)`)
      }
    } catch (error) {
      this.handleError('Failed to cleanup old logs', error)
    }
  }

  /**
   * 设置 Logger 配置
   */
  setConfig(config: Partial<LoggerConfig>): void {
    this.config = { ...this.config, ...config }
  }

  /**
   * 获取当前 session ID
   */
  getSessionId(): string | null {
    return this.currentSessionId
  }

  /**
   * 写入日志（内部方法）
   */
  private write(level: LogLevel, message: string, context?: any): void {
    try {
      // 检查是否启用
      if (!this.config.enabled) return

      // 检查日志级别
      if (!this.shouldLog(level)) return

      // 格式化日志条目
      const entry = this.formatEntry(level, message, context)

      // 添加到缓冲区
      this.buffer.push(entry)

      // 检查是否需要刷新缓冲区
      if (this.buffer.length >= this.config.bufferSize) {
        this.flushBuffer()
      }
    } catch (error) {
      this.handleError('Failed to write log', error)
    }
  }

  /**
   * 格式化日志条目
   */
  private formatEntry(level: LogLevel, message: string, context?: any): string {
    const timestamp = this.getTimestamp()
    const contextStr = context ? ` ${this.serializeContext(context)}` : ''
    return `[${timestamp}] [${level}] ${message}${contextStr}`
  }

  /**
   * 生成时间戳字符串
   * 格式: 2025-12-25 15:30:45.123
   */
  private getTimestamp(): string {
    const now = new Date()
    const year = now.getFullYear()
    const month = String(now.getMonth() + 1).padStart(2, '0')
    const day = String(now.getDate()).padStart(2, '0')
    const hours = String(now.getHours()).padStart(2, '0')
    const minutes = String(now.getMinutes()).padStart(2, '0')
    const seconds = String(now.getSeconds()).padStart(2, '0')
    const millis = String(now.getMilliseconds()).padStart(3, '0')

    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}.${millis}`
  }

  /**
   * 序列化上下文对象为 JSON 字符串
   */
  private serializeContext(context: any): string {
    try {
      // 特殊处理 Error 对象
      if (context instanceof Error) {
        return JSON.stringify({
          name: context.name,
          message: context.message,
          stack: context.stack,
        })
      }

      // 普通对象
      return JSON.stringify(context)
    } catch (error) {
      // 处理循环引用等序列化错误
      return String(context)
    }
  }

  /**
   * 判断是否应该记录该级别的日志
   */
  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVELS[level] >= LOG_LEVELS[this.config.minLevel]
  }

  /**
   * 刷新缓冲区到文件
   */
  private flushBuffer(): void {
    if (this.buffer.length === 0) return
    if (!this.currentLogFile) return

    try {
      const content = this.buffer.join('\n') + '\n'
      this.writeToFile(content)
      this.buffer = []
    } catch (error) {
      this.handleError('Failed to flush buffer', error)
    }
  }

  /**
   * 写入内容到日志文件
   */
  private writeToFile(content: string): void {
    if (!this.currentLogFile) return

    try {
      appendFileSync(this.currentLogFile, content, 'utf-8')
    } catch (error) {
      // 写入失败时禁用日志（避免持续报错）
      this.config.enabled = false
      process.stderr.write(`Logger disabled due to write error: ${error}\n`)
    }
  }

  /**
   * 确保日志目录存在
   */
  private ensureLogsDir(): void {
    if (!existsSync(this.logsDir)) {
      mkdirSync(this.logsDir, { recursive: true })
    }
  }

  /**
   * 生成 session ID（时间戳格式）
   * 格式: YYYY-MM-DD_HH-MM-SS
   */
  private generateSessionId(): string {
    const now = new Date()
    const year = now.getFullYear()
    const month = String(now.getMonth() + 1).padStart(2, '0')
    const day = String(now.getDate()).padStart(2, '0')
    const hours = String(now.getHours()).padStart(2, '0')
    const minutes = String(now.getMinutes()).padStart(2, '0')
    const seconds = String(now.getSeconds()).padStart(2, '0')

    return `${year}-${month}-${day}_${hours}-${minutes}-${seconds}`
  }

  /**
   * 错误处理（内部方法）
   * 日志系统的错误不应该影响 CLI 运行
   */
  private handleError(message: string, error: any): void {
    // 只输出到 stderr，不抛出异常
    process.stderr.write(`[Logger Error] ${message}: ${error}\n`)
  }
}

/**
 * 导出 Logger 单例实例
 */
export const logger = Logger.getInstance()
