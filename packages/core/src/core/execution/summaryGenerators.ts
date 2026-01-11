/**
 * 工具结果摘要生成器
 * 为不同类型的工具生成人类可读的结果摘要
 */

import type { SummaryGeneratorRegistry } from './types.js';
import type { ToolResult } from '../tool/types.js';

/**
 * 生成警告后缀
 */
function getWarningSuffix(result: ToolResult<any>): string {
  if (result.warning) {
    return ` ⚠️ ${result.warning}`;
  }
  return '';
}

/**
 * 格式化文件大小（用于摘要）
 */
function formatSizeForSummary(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

/**
 * 内置的摘要生成器
 */
export const defaultSummaryGenerators: SummaryGeneratorRegistry = {
  // 读取文件
  ReadFile: (_, params, result) => {
    if (!result.success) {
      return `Failed: ${result.error}`;
    }
    const data = result.data;
    const lines = data?.lineCount ?? 0;
    const filePath = data?.filePath || params.file_path || params.path || params.filePath || 'file';
    return `Read ${lines} lines from ${filePath}${getWarningSuffix(result)}`;
  },

  Read: (_, params, result) => {
    if (!result.success) {
      return `Failed: ${result.error}`;
    }
    const data = result.data;
    const lines = data?.lineCount ?? 0;
    const filePath = data?.filePath || params.file_path || params.path || params.filePath || 'file';
    return `Read ${lines} lines from ${filePath}${getWarningSuffix(result)}`;
  },

  // Glob 搜索
  Glob: (_, params, result) => {
    if (!result.success) {
      return `Failed: ${result.error}`;
    }
    const count = result.data?.count ?? 0;
    return `Found ${count} files matching ${params.pattern}${getWarningSuffix(result)}`;
  },

  // Grep 搜索
  Grep: (_, params, result) => {
    if (!result.success) {
      return `Failed: ${result.error}`;
    }
    const count = result.data?.count ?? 0;
    return `Found ${count} matches for "${params.pattern}"${getWarningSuffix(result)}`;
  },

  // Bash 命令
  Bash: (_, _params, result) => {
    if (!result.success) {
      return `Command failed: ${result.error}`;
    }
    const exitCode = result.data?.exitCode ?? 0;
    const status = exitCode === 0 ? 'completed' : `failed (exit ${exitCode})`;
    return `Command ${status}${getWarningSuffix(result)}`;
  },

  // 写入文件
  WriteFile: (_, params, result) => {
    if (!result.success) {
      return `Failed: ${result.error}`;
    }
    const filePath =
      result.data?.filePath || params.file_path || params.path || params.filePath || 'file';
    return `Wrote to ${filePath}${getWarningSuffix(result)}`;
  },

  Write: (_, params, result) => {
    if (!result.success) {
      return `Failed: ${result.error}`;
    }
    const filePath =
      result.data?.filePath || params.file_path || params.path || params.filePath || 'file';
    return `Wrote to ${filePath}${getWarningSuffix(result)}`;
  },

  // 编辑文件
  Edit: (_, params, result) => {
    if (!result.success) {
      return `Failed: ${result.error}`;
    }
    const filePath =
      result.data?.filePath || params.file_path || params.path || params.filePath || 'file';
    return `Edited ${filePath}${getWarningSuffix(result)}`;
  },

  // 列出文件
  ListFiles: (_, params, result) => {
    if (!result.success) {
      return `Failed: ${result.error}`;
    }
    const count = result.data?.totalCount ?? result.data?.files?.length ?? 0;
    const dirPath = result.data?.directory || params.path || params.directory || '.';
    return `Listed ${count} items in ${dirPath}${getWarningSuffix(result)}`;
  },

  // TodoRead
  TodoRead: (_, _params, result) => {
    if (!result.success) {
      return `Failed: ${result.error}`;
    }
    const count = result.data?.todos?.length ?? 0;
    return `Read ${count} todos${getWarningSuffix(result)}`;
  },

  // TodoWrite
  TodoWrite: (_, _params, result) => {
    if (!result.success) {
      return `Failed: ${result.error}`;
    }
    const count = result.data?.todos?.length ?? 0;
    return `Updated ${count} todos${getWarningSuffix(result)}`;
  },

  // 批量读取文件
  ReadManyFiles: (_, _params, result) => {
    if (!result.success) {
      return `Failed: ${result.error}`;
    }
    const data = result.data;
    const fileCount = data?.totalFiles ?? 0;
    const errorCount = data?.errors?.length ?? 0;
    const totalSize = data?.totalSize ?? 0;
    const sizeStr = formatSizeForSummary(totalSize);

    if (errorCount > 0) {
      return `Read ${fileCount} files (${sizeStr}), ${errorCount} errors${getWarningSuffix(result)}`;
    }
    return `Read ${fileCount} files (${sizeStr})${getWarningSuffix(result)}`;
  },

  // 默认
  default: (toolName, _, result) => {
    if (!result.success) {
      return `${toolName} failed: ${result.error}`;
    }
    return `${toolName} completed${getWarningSuffix(result)}`;
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
export function generateParamsSummary(toolName: string, params: Record<string, any>): string {
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

    case 'ReadManyFiles': {
      const paths = params.paths;
      if (!paths || paths.length === 0) return '';
      if (paths.length === 1) return paths[0];
      return `${paths.length} files`;
    }

    default:
      // 尝试找到第一个字符串参数
      const firstString = Object.values(params).find((v) => typeof v === 'string');
      if (firstString && typeof firstString === 'string') {
        return firstString.length > 30 ? firstString.slice(0, 30) + '...' : firstString;
      }
      return '';
  }
}
