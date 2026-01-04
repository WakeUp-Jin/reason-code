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
    // 优先使用 lineCount，回退到 lines，最后计算 content 行数
    const lines =
      result?.lineCount ??
      result?.lines ??
      (result?.content ? result.content.split('\n').length : 0);
    const filePath = params.file_path || params.path || params.filePath || 'file';
    return `Read ${lines} lines from ${filePath}`;
  },

  Read: (_, params, result) => {
    // 优先使用 lineCount，回退到 lines，最后计算 content 行数
    const lines =
      result?.lineCount ??
      result?.lines ??
      (result?.content ? result.content.split('\n').length : 0);
    const filePath = params.file_path || params.path || params.filePath || 'file';
    return `Read ${lines} lines from ${filePath}`;
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
    const filePath = params.file_path || params.path || params.filePath || 'file';
    return `Wrote to ${filePath}`;
  },

  Write: (_, params) => {
    const filePath = params.file_path || params.path || params.filePath || 'file';
    return `Wrote to ${filePath}`;
  },

  // 编辑文件
  Edit: (_, params) => {
    const filePath = params.file_path || params.path || params.filePath || 'file';
    return `Edited ${filePath}`;
  },

  // 列出文件
  ListFiles: (_, params, result) => {
    // 支持对象形式 {totalCount, files} 和数组形式
    const count =
      result?.totalCount ??
      result?.files?.length ??
      (Array.isArray(result) ? result.length : 0);
    const dirPath = params.path || params.directory || '.';
    return `Listed ${count} items in ${dirPath}`;
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
      return params.file_path || params.path || params.filePath || '';

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
