import { logger } from './src/util/logger.js';

// 测试 logger 功能
console.log('Testing logger...');

// 创建 session
logger.createSession();
console.log('Session created. Session ID:', logger.getSessionId());

// 测试各种日志级别
logger.debug('This is a debug message', { test: 'data' });
logger.info('This is an info message', { user: 'test' });
logger.warn('This is a warning message');
logger.error('This is an error message', new Error('Test error'));

// 刷新缓冲区
logger.flush();

console.log('Logger test completed. Check logs/ directory for output.');
