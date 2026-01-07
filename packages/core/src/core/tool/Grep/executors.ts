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
import { ensureReasonBinDir } from '../utils/reasonPaths.js';
import { RIPGREP_AUTO_DOWNLOAD_ENABLED } from '../utils/ripgrepPolicy.js';
import { isAbortError, toErrorMessage } from '../utils/error-utils.js';

/**
 * Grep 执行器
 *
 * @param args - Grep 参数
 * @param context - 工具上下文
 * @returns Grep 结果（统一结果接口）
 */
export async function grepExecutor(
  args: GrepArgs,
  context?: InternalToolContext
): Promise<GrepResult> {
  const startTime = Date.now();
  const cwd = context?.cwd || process.cwd();

  // Ripgrep 的本地缓存/下载目录策略：
  // - true：允许自动下载时，提供 reason 的 binDir（不存在则创建），供 ripgrep.ts 使用/下载
  // - false：不提供 binDir（undefined），ripgrep.ts 只会尝试系统 PATH，不会触发下载
  const binDirForRipgrep = RIPGREP_AUTO_DOWNLOAD_ENABLED ? ensureReasonBinDir() : undefined;

  // 解析搜索路径
  const searchPath = args.path ? resolve(cwd, args.path) : cwd;

  // 检查目录是否存在
  if (!existsSync(searchPath)) {
    return {
      success: false,
      error: `目录不存在: ${searchPath}`,
      data: null,
    };
  }

  try {
    // 执行搜索
    const { matches, strategy, warning } = await executeGrepStrategy(args.pattern, searchPath, {
      include: args.include,
      limit: GREP_DEFAULTS.LIMIT,
      binDir: binDirForRipgrep,
      signal: context?.abortSignal,
    });

    // 计算是否截断
    const truncated = matches.length >= GREP_DEFAULTS.LIMIT;

    // 记录完成
    const duration = Date.now() - startTime;
    searchLogger.complete('Grep', strategy, matches.length, duration);

    return {
      success: true,
      warning,
      data: {
        pattern: args.pattern,
        directory: searchPath,
        matches,
        count: matches.length,
        truncated,
        strategy,
      },
    };
  } catch (error: unknown) {
    if (!isAbortError(error)) {
      searchLogger.error('Grep', toErrorMessage(error), ['executor']);
    }

    return {
      success: false,
      error: isAbortError(error) ? 'AbortError' : toErrorMessage(error),
      data: null,
    };
  }
}

/**
 * 格式化 Grep 结果供 Assistant 使用
 *
 * @param result - Grep 结果
 * @returns 格式化后的字符串
 */
export function renderGrepResultForAssistant(result: GrepResult): string {
  const lines: string[] = [];

  // 失败时
  if (!result.success) {
    lines.push(`Error: ${result.error}`);
    return lines.join('\n');
  }

  const data = result.data;
  if (!data || data.count === 0) {
    lines.push('No matches found');
  } else {
    // 按文件分组输出
    const byFile = new Map<string, typeof data.matches>();
    for (const match of data.matches) {
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

    if (data.truncated) {
      lines.push(
        `(Results are truncated at ${GREP_DEFAULTS.LIMIT} matches. Consider using a more specific pattern or path.)`
      );
    }
  }

  // 警告信息
  if (result.warning) {
    lines.push('');
    lines.push(`Warning: ${result.warning}`);
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
  // 失败时
  if (!result.success) {
    return `Failed: ${result.error}`;
  }

  const data = result.data;
  if (!data || data.count === 0) {
    return 'No matches found';
  }

  const truncatedNote = data.truncated ? ' (truncated)' : '';
  const warningNote = result.warning ? ' ⚠️' : '';
  return `Found ${data.count} match(es)${truncatedNote}${warningNote}`;
}
