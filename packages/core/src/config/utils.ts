/**
 * 配置工具函数
 */

import type { DeepPartial } from './types.js';

/**
 * 深度合并对象
 */
export function deepMerge<T extends Record<string, any>>(target: T, source: DeepPartial<T>): T {
  const result = { ...target };

  for (const key in source) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      const sourceValue = source[key];
      const targetValue = result[key];

      if (
        sourceValue !== null &&
        typeof sourceValue === 'object' &&
        !Array.isArray(sourceValue) &&
        targetValue !== null &&
        typeof targetValue === 'object' &&
        !Array.isArray(targetValue)
      ) {
        result[key] = deepMerge(targetValue, sourceValue as any);
      } else if (sourceValue !== undefined) {
        result[key] = sourceValue as any;
      }
    }
  }

  return result;
}

/**
 * 解析字符串中的环境变量
 * 支持格式：${ENV_VAR} 或 $ENV_VAR
 */
export function resolveEnvVars(str: string): string {
  return str.replace(/\$\{([^}]+)\}|\$([A-Z_][A-Z0-9_]*)/g, (match, name1, name2) => {
    const varName = name1 || name2;
    return process.env[varName] || '';
  });
}

/**
 * 递归解析对象中的环境变量
 */
export function resolveConfigEnvVars<T>(obj: T): T {
  if (typeof obj === 'string') {
    return resolveEnvVars(obj) as T;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => resolveConfigEnvVars(item)) as T;
  }

  if (obj !== null && typeof obj === 'object') {
    const result: any = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = resolveConfigEnvVars(value);
    }
    return result as T;
  }

  return obj;
}
