/**
 * Grep 工具执行器
 *
 * 根据正则表达式模式搜索文件内容。
 */

import { resolve } from 'path';
import { existsSync } from 'fs';
import { GrepArgs, GrepResult, GREP_DEFAULTS } from './types.js';
import { executeGrepStrategy } from './strategies/index.js';
import { searchLogger } from '../../../utils/logUtils.js';
import { InternalToolContext } from '../types.js';

/**
 * Grep 执行器
 *
 * @param args - Grep 参数
 * @param context - 工具上下文
 * @returns Grep 结果
 */
export async function grepExecutor(args: GrepArgs, context?: InternalToolContext): Promise<GrepResult> {
  const startTime = Date.now();
  const cwd = context?.cwd || process.cwd();

  // 解析搜索路径
  let searchPath = args.path ? resolve(cwd, args.path) : cwd;

  // 检查目录是否存在
  if (!existsSync(searchPath)) {
    throw new Error(`目录不存在: ${searchPath}`);
  }

  // 执行搜索
  const { matches, strategy } = await executeGrepStrategy(args.pattern, searchPath, {
    include: args.include,
    limit: GREP_DEFAULTS.LIMIT,
    signal: context?.abortSignal,
  });

  // 计算是否截断
  const truncated = matches.length >= GREP_DEFAULTS.LIMIT;

  // 记录完成
  const duration = Date.now() - startTime;
  searchLogger.complete('Grep', strategy, matches.length, duration);

  return {
    pattern: args.pattern,
    directory: searchPath,
    matches,
    count: matches.length,
    truncated,
    strategy,
  };
}

/**
 * 格式化 Grep 结果供 Assistant 使用
 *
 * @param result - Grep 结果
 * @returns 格式化后的字符串
 */
export function renderGrepResultForAssistant(result: GrepResult): string {
  const lines: string[] = [];

  if (result.count === 0) {
    lines.push('No matches found');
  } else {
    // 按文件分组输出
    const byFile = new Map<string, typeof result.matches>();
    for (const match of result.matches) {
      const existing = byFile.get(match.filePath) || [];
      existing.push(match);
      byFile.set(match.filePath, existing);
    }

    for (const [filePath, fileMatches] of byFile) {
      lines.push(`${filePath}:`);
      for (const match of fileMatches) {
        lines.push(`  ${match.lineNumber}: ${match.line}`);
      }
      lines.push('');
    }

    if (result.truncated) {
      lines.push(`(Results are truncated at ${GREP_DEFAULTS.LIMIT} matches. Consider using a more specific pattern or path.)`);
    }
  }

  return lines.join('\n');
}

/**
 * 获取 Grep 结果的简短摘要
 *
 * @param result - Grep 结果
 * @returns 摘要字符串
 */
export function getGrepSummary(result: GrepResult): string {
  if (result.count === 0) {
    return 'No matches found';
  }

  const truncatedNote = result.truncated ? ' (truncated)' : '';
  return `Found ${result.count} match(es)${truncatedNote}`;
}

