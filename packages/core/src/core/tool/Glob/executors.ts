/**
 * Glob 工具执行器
 *
 * 根据文件名模式搜索文件路径，不涉及文件内容。
 */

import { resolve, relative } from 'path';
import { existsSync } from 'fs';
import { GlobArgs, GlobResult, GLOB_DEFAULTS } from './types.js';
import { executeGlobStrategy } from './strategies/index.js';
import { searchLogger } from '../../../utils/logUtils.js';
import { InternalToolContext } from '../types.js';

/**
 * Glob 执行器
 *
 * @param args - Glob 参数
 * @param context - 工具上下文
 * @returns Glob 结果
 */
export async function globExecutor(args: GlobArgs, context?: InternalToolContext): Promise<GlobResult> {
  const startTime = Date.now();
  const cwd = context?.cwd || process.cwd();

  // 解析搜索路径
  let searchPath = args.path ? resolve(cwd, args.path) : cwd;

  // 检查目录是否存在
  if (!existsSync(searchPath)) {
    throw new Error(`目录不存在: ${searchPath}`);
  }

  // 执行搜索
  const { files, strategy } = await executeGlobStrategy(args.pattern, searchPath, {
    limit: GLOB_DEFAULTS.LIMIT,
    signal: context?.abortSignal,
  });

  // 计算是否截断
  const truncated = files.length >= GLOB_DEFAULTS.LIMIT;

  // 记录完成
  const duration = Date.now() - startTime;
  searchLogger.complete('Glob', strategy, files.length, duration);

  return {
    directory: searchPath,
    files,
    count: files.length,
    truncated,
    strategy,
  };
}

/**
 * 格式化 Glob 结果供 Assistant 使用
 *
 * @param result - Glob 结果
 * @returns 格式化后的字符串
 */
export function renderGlobResultForAssistant(result: GlobResult): string {
  const lines: string[] = [];

  if (result.count === 0) {
    lines.push('No files found');
  } else {
    // 输出文件路径列表
    for (const file of result.files) {
      lines.push(file.path);
    }

    if (result.truncated) {
      lines.push('');
      lines.push(`(Results are truncated at ${GLOB_DEFAULTS.LIMIT} files. Consider using a more specific path or pattern.)`);
    }
  }

  return lines.join('\n');
}

/**
 * 获取 Glob 结果的简短摘要
 *
 * @param result - Glob 结果
 * @returns 摘要字符串
 */
export function getGlobSummary(result: GlobResult): string {
  if (result.count === 0) {
    return 'No files found';
  }

  const truncatedNote = result.truncated ? ' (truncated)' : '';
  return `Found ${result.count} file(s)${truncatedNote}`;
}

