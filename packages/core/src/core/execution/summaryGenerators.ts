/**
 * 工具结果摘要生成器
 * 为不同类型的工具生成人类可读的结果摘要
 */

import type { SummaryGeneratorRegistry } from './types.js';

/**
 * 内置的摘要生成器
 */
export const defaultSummaryGenerators: SummaryGeneratorRegistry = {
  // 读取文件
  ReadFile: (_, params, result) => {
    const lines = result?.lines || result?.content?.split('\n').length || 0;
    const path = params.file_path || params.path || 'file';
    return `Read ${lines} lines from ${path}`;
  },

  Read: (_, params, result) => {
    const lines = result?.lines || result?.content?.split('\n').length || 0;
    const path = params.file_path || params.path || 'file';
    return `Read ${lines} lines from ${path}`;
  },

  // Glob 搜索
  Glob: (_, params, result) => {
    const count = Array.isArray(result) ? result.length : 0;
    return `Found ${count} files matching ${params.pattern}`;
  },

  // Grep 搜索
  Grep: (_, params, result) => {
    const matches = result?.matches || result?.length || 0;
    return `Found ${matches} matches for "${params.pattern}"`;
  },

  // Bash 命令
  Bash: (_, params, result) => {
    const exitCode = result?.exitCode ?? 0;
    const status = exitCode === 0 ? 'completed' : `failed (exit ${exitCode})`;
    return `Command ${status}`;
  },

  // 写入文件
  WriteFile: (_, params) => {
    const path = params.file_path || params.path || 'file';
    return `Wrote to ${path}`;
  },

  Write: (_, params) => {
    const path = params.file_path || params.path || 'file';
    return `Wrote to ${path}`;
  },

  // 编辑文件
  Edit: (_, params) => {
    const path = params.file_path || params.path || 'file';
    return `Edited ${path}`;
  },

  // 列出文件
  ListFiles: (_, params, result) => {
    const count = Array.isArray(result) ? result.length : 0;
    const path = params.path || params.directory || '.';
    return `Listed ${count} items in ${path}`;
  },

  // 默认
  default: (toolName, _, result) => {
    if (result?.success === false) return `${toolName} failed`;
    return `${toolName} completed`;
  },
};

/**
 * 生成工具结果摘要
 */
export function generateSummary(
  toolName: string,
  params: Record<string, any>,
  result: any,
  customGenerators?: SummaryGeneratorRegistry
): string {
  const generators = { ...defaultSummaryGenerators, ...customGenerators };
  const generator = generators[toolName] || generators.default;
  return generator!(toolName, params, result);
}

/**
 * 生成参数摘要
 */
export function generateParamsSummary(
  toolName: string,
  params: Record<string, any>
): string {
  // 根据工具类型提取主要参数
  switch (toolName) {
    case 'Read':
    case 'ReadFile':
    case 'Write':
    case 'WriteFile':
    case 'Edit':
      return params.file_path || params.path || '';

    case 'Glob':
      return params.pattern || '';

    case 'Grep':
      return params.pattern || '';

    case 'Bash':
      const cmd = params.command || '';
      return cmd.length > 30 ? cmd.slice(0, 30) + '...' : cmd;

    case 'ListFiles':
      return params.path || params.directory || '.';

    default:
      // 尝试找到第一个字符串参数
      const firstString = Object.values(params).find(
        v => typeof v === 'string'
      );
      if (firstString && typeof firstString === 'string') {
        return firstString.length > 30
          ? firstString.slice(0, 30) + '...'
          : firstString;
      }
      return '';
  }
}
