/**
 * JSON 解析工具函数
 */

import { logger } from './logger.js';

/**
 * 安全解析 JSON 字符串
 * - 如果输入已经是对象，直接返回
 * - 如果解析失败，记录日志并返回 fallback 值
 *
 * @param input - JSON 字符串或对象
 * @param fallback - 解析失败时的默认值
 * @returns 解析后的对象或 fallback
 */
export function safeJsonParse<T>(input: unknown, fallback: T): T {
  if (typeof input !== 'string') {
    return (input as T) ?? fallback;
  }

  try {
    return JSON.parse(input) as T;
  } catch {
    logger.warn('JSON parse failed', { input: input.slice(0, 100) });
    return fallback;
  }
}

