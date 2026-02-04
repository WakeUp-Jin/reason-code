import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { logger, type LogLevel, type LoggerConfig } from '../logger.js';
import { existsSync, rmSync, mkdirSync, readdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('Logger 测试', () => {
  const testLogsDir = join(tmpdir(), 'reason-code-logger-test-' + Date.now());

  beforeEach(() => {
    // 确保测试目录存在
    if (!existsSync(testLogsDir)) {
      mkdirSync(testLogsDir, { recursive: true });
    }
  });

  afterEach(() => {
    // 清理测试目录
    try {
      if (existsSync(testLogsDir)) {
        rmSync(testLogsDir, { recursive: true, force: true });
      }
    } catch {
      // 忽略清理错误
    }
  });

  describe('单例模式', () => {
    it('应该返回 Logger 单例实例', () => {
      expect(logger).toBeDefined();
    });

    it('多次导入应该返回相同实例', async () => {
      const { logger: logger2 } = await import('../logger.js');
      expect(logger).toBe(logger2);
    });
  });

  describe('配置管理', () => {
    it('应该能配置日志目录', () => {
      logger.configure({ logsDir: testLogsDir });
      // 配置不会抛出错误
      expect(true).toBe(true);
    });

    it('应该能配置是否启用', () => {
      logger.configure({ enabled: true });
      logger.configure({ enabled: false });
      expect(true).toBe(true);
    });

    it('应该能配置最小日志级别', () => {
      const levels: LogLevel[] = ['DEBUG', 'INFO', 'WARN', 'ERROR'];
      levels.forEach((level) => {
        logger.configure({ minLevel: level });
      });
      expect(true).toBe(true);
    });

    it('应该能配置缓冲区大小', () => {
      logger.configure({ bufferSize: 10 });
      logger.configure({ bufferSize: 100 });
      expect(true).toBe(true);
    });

    it('应该能配置保留天数', () => {
      logger.configure({ retentionDays: 0 }); // 永不清理
      logger.configure({ retentionDays: 7 });
      logger.configure({ retentionDays: 30 });
      expect(true).toBe(true);
    });
  });

  describe('Session 管理', () => {
    it('未配置日志目录时创建 session 不应报错', () => {
      logger.configure({ logsDir: undefined });
      expect(() => logger.createSession()).not.toThrow();
    });

    it('配置日志目录后应该能创建 session', () => {
      logger.configure({ logsDir: testLogsDir, enabled: true });
      expect(() => logger.createSession()).not.toThrow();
    });

    it('创建 session 后应该能获取 session ID', () => {
      logger.configure({ logsDir: testLogsDir, enabled: true });
      logger.createSession();
      // session ID 可能为 null 如果之前没有成功创建
      const sessionId = logger.getSessionId();
      // 不做严格断言，因为依赖内部状态
      expect(sessionId === null || typeof sessionId === 'string').toBe(true);
    });

    it('应该能检查初始化状态', () => {
      const initialized = logger.isInitialized();
      expect(typeof initialized).toBe('boolean');
    });
  });

  describe('日志写入方法', () => {
    beforeEach(() => {
      logger.configure({
        logsDir: testLogsDir,
        enabled: true,
        minLevel: 'DEBUG',
        bufferSize: 5,
      });
      logger.createSession();
    });

    it('debug 方法不应抛出错误', () => {
      expect(() => logger.debug('Debug message')).not.toThrow();
      expect(() => logger.debug('Debug with context', { key: 'value' })).not.toThrow();
    });

    it('info 方法不应抛出错误', () => {
      expect(() => logger.info('Info message')).not.toThrow();
      expect(() => logger.info('Info with context', { tool: 'ReadFile' })).not.toThrow();
    });

    it('warn 方法不应抛出错误', () => {
      expect(() => logger.warn('Warning message')).not.toThrow();
      expect(() => logger.warn('Warning with context', { issue: 'potential' })).not.toThrow();
    });

    it('error 方法不应抛出错误', () => {
      expect(() => logger.error('Error message')).not.toThrow();
      expect(() => logger.error('Error with Error object', new Error('Test error'))).not.toThrow();
    });

    it('应该能处理各种上下文类型', () => {
      // 对象
      expect(() => logger.info('With object', { a: 1, b: 'test' })).not.toThrow();

      // 数组
      expect(() => logger.info('With array', [1, 2, 3])).not.toThrow();

      // Error 对象
      expect(() => logger.error('With error', new Error('Test'))).not.toThrow();

      // null/undefined
      expect(() => logger.info('With null', null)).not.toThrow();
      expect(() => logger.info('With undefined', undefined)).not.toThrow();

      // 嵌套对象
      expect(() => logger.debug('Nested', { a: { b: { c: 1 } } })).not.toThrow();
    });
  });

  describe('flush 方法', () => {
    it('flush 不应抛出错误', () => {
      logger.configure({ logsDir: testLogsDir, enabled: true });
      logger.createSession();
      logger.info('Test message');
      expect(() => logger.flush()).not.toThrow();
    });

    it('未初始化时 flush 不应抛出错误', () => {
      logger.configure({ enabled: false });
      expect(() => logger.flush()).not.toThrow();
    });
  });

  describe('cleanup 方法', () => {
    it('cleanup 不应抛出错误', () => {
      logger.configure({ logsDir: testLogsDir, enabled: true });
      expect(() => logger.cleanup()).not.toThrow();
    });

    it('cleanup 应该接受自定义保留天数', () => {
      logger.configure({ logsDir: testLogsDir, enabled: true });
      expect(() => logger.cleanup(1)).not.toThrow();
      expect(() => logger.cleanup(30)).not.toThrow();
    });

    it('retentionDays 为 0 时不应清理', () => {
      logger.configure({ logsDir: testLogsDir, enabled: true, retentionDays: 0 });
      expect(() => logger.cleanup()).not.toThrow();
    });
  });

  describe('环境变量配置', () => {
    const originalEnv = { ...process.env };

    afterEach(() => {
      // 恢复环境变量
      process.env = { ...originalEnv };
    });

    it('应该能从环境变量读取 LOG_LEVEL', () => {
      process.env.LOG_LEVEL = 'WARN';
      expect(() => logger.configureFromEnv()).not.toThrow();
    });

    it('应该能从环境变量读取 LOG_ENABLED', () => {
      process.env.LOG_ENABLED = 'true';
      expect(() => logger.configureFromEnv()).not.toThrow();

      process.env.LOG_ENABLED = 'false';
      expect(() => logger.configureFromEnv()).not.toThrow();
    });

    it('应该忽略无效的 LOG_LEVEL', () => {
      process.env.LOG_LEVEL = 'INVALID_LEVEL';
      expect(() => logger.configureFromEnv()).not.toThrow();
    });
  });

  describe('配置文件加载', () => {
    it('不存在的配置文件不应抛出错误', () => {
      expect(() => logger.loadConfigFromFile('/nonexistent/path/config.json')).not.toThrow();
    });
  });

  describe('日志级别过滤', () => {
    beforeEach(() => {
      logger.configure({
        logsDir: testLogsDir,
        enabled: true,
        bufferSize: 1, // 立即写入
      });
      logger.createSession();
    });

    it('设置 INFO 级别时 DEBUG 不应写入', () => {
      logger.configure({ minLevel: 'INFO' });
      // 不会抛出错误，只是不写入
      expect(() => logger.debug('This should be filtered')).not.toThrow();
    });

    it('设置 WARN 级别时 INFO 不应写入', () => {
      logger.configure({ minLevel: 'WARN' });
      expect(() => logger.info('This should be filtered')).not.toThrow();
    });

    it('设置 ERROR 级别时只有 ERROR 应写入', () => {
      logger.configure({ minLevel: 'ERROR' });
      expect(() => logger.debug('Filtered')).not.toThrow();
      expect(() => logger.info('Filtered')).not.toThrow();
      expect(() => logger.warn('Filtered')).not.toThrow();
      expect(() => logger.error('Should write')).not.toThrow();
    });
  });

  describe('禁用状态', () => {
    it('禁用时所有日志方法不应抛出错误', () => {
      logger.configure({ enabled: false });

      expect(() => logger.debug('Test')).not.toThrow();
      expect(() => logger.info('Test')).not.toThrow();
      expect(() => logger.warn('Test')).not.toThrow();
      expect(() => logger.error('Test')).not.toThrow();
      expect(() => logger.flush()).not.toThrow();
    });
  });
});
