import type { ReasonCliConfig } from './schema.js';

/**
 * 默认配置
 */
export const DEFAULT_CONFIG: ReasonCliConfig = {
  model: {
    current: 'deepseek/deepseek-chat',
    fallback: 'claude-sonnet-4',
  },
  providers: {
    deepseek: {
      apiKey: '${DEEPSEEK_API_KEY}',
      baseUrl: 'https://api.deepseek.com',
      timeout: 60000,
    },
    anthropic: {
      apiKey: '${ANTHROPIC_API_KEY}',
      baseUrl: 'https://api.anthropic.com',
      timeout: 60000,
    },
    openai: {
      apiKey: '${OPENAI_API_KEY}',
      baseUrl: 'https://api.openai.com/v1',
      timeout: 60000,
    },
    google: {
      apiKey: '${GOOGLE_API_KEY}',
      baseUrl: 'https://generativelanguage.googleapis.com',
      timeout: 60000,
    },
  },
  agent: {
    current: 'default',
  },
  ui: {
    theme: 'kanagawa',
    mode: 'dark',
  },
  session: {
    lastSessionId: undefined,
    autoSave: true,
    saveDebounce: 500,
  },
};

/**
 * 解析字符串中的环境变量
 * 支持格式：${ENV_VAR} 或 $ENV_VAR
 * @param str 输入字符串
 * @returns 解析后的字符串
 */
export function resolveEnvVars(str: string): string {
  // 匹配 ${VAR_NAME} 或 $VAR_NAME
  return str.replace(/\$\{([^}]+)\}|\$([A-Z_][A-Z0-9_]*)/g, (match, name1, name2) => {
    const varName = name1 || name2;
    return process.env[varName] || '';
  });
}

/**
 * 递归解析对象中的环境变量
 * @param obj 配置对象
 * @returns 解析后的对象
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

/**
 * 深度合并配置对象
 * @param target 目标对象
 * @param source 源对象
 * @returns 合并后的对象
 */
export function deepMerge<T extends Record<string, any>>(target: T, source: Partial<T>): T {
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
        result[key] = deepMerge(targetValue, sourceValue);
      } else if (sourceValue !== undefined) {
        result[key] = sourceValue as any;
      }
    }
  }

  return result;
}
