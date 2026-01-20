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
import {
  isAbortError,
  isTimeoutError,
  toErrorMessage,
  withTimeout,
  SEARCH_TIMEOUT_MS,
} from '../utils/error-utils.js';
import { GrepMatch } from './types.js';

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

  // 记录搜索开始（便于排查性能问题）
  searchLogger.start('Grep', searchPath, args.pattern, args.include);

  try {
    // 执行搜索（带超时控制）
    // 使用工厂函数模式，让超时时能够通过 signal 终止底层 ripgrep 进程
    const { matches, strategy, warning } = await withTimeout(
      (signal) =>
        executeGrepStrategy(args.pattern, searchPath, {
          include: args.include,
          binDir: binDirForRipgrep,
          signal, // 使用 withTimeout 提供的 signal，超时时会自动 abort
          limit: GREP_DEFAULTS.LIMIT, // 全局结果上限（同时用于 stdout 行数上限）
          maxCount: 100, // 🔑 限制每个文件最多 100 条匹配，防止输出过大
        }),
      SEARCH_TIMEOUT_MS,
      'Grep',
      context?.abortSignal
    );

    //填充文件修改时间并排序
    const sortedMatches=await sortMatchesByMtime(matches);

    // 记录完成
    const duration = Date.now() - startTime;
    searchLogger.complete('Grep', strategy, sortedMatches.length, duration);

    return {
      success: true,
      warning,
      data: {
        pattern: args.pattern,
        directory: searchPath,
        matches:sortedMatches,
        count: matches.length,
        strategy,
      },
    };
  } catch (error: unknown) {
    // 超时或中止不记录为错误
    if (!isAbortError(error) && !isTimeoutError(error)) {
      searchLogger.error('Grep', toErrorMessage(error), ['executor']);
    }

    // 超时返回特定错误信息
    if (isTimeoutError(error)) {
      return {
        success: false,
        error: toErrorMessage(error),
        data: null,
      };
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

  const warningNote = result.warning ? ' ⚠️' : '';
  return `Found ${data.count} match(es)${warningNote}`;
}


/**
 * 按照文件修改时间排序匹配结果
 * 
 */
async function sortMatchesByMtime(matches: GrepMatch[]): Promise<GrepMatch[]> {
  if(matches.length === 0) {
    return matches;
  }

  //1、收集所有唯一的文件路径
  const uniqueFiles=new Set<string>();
  for(const match of matches) {
    uniqueFiles.add(match.filePath);
  }

  //2、对每个文件路径获取修改时间
  const mtimeMap=new Map<string,number>();
  for(const filePath of uniqueFiles) {
    try {
      const stats=await Bun.file(filePath).stat();
      mtimeMap.set(filePath,stats.mtime.getTime());
    } catch (error) {
      //文件不存在或无法访问，设置为0
      mtimeMap.set(filePath,0);
    }
  }

  //3、填充每个匹配的mtime
  const matchesWithMtime=matches.map(match =>({
    ...match,
    mtime:mtimeMap.get(match.filePath) || 0,
  }))

  //4、按mtime排序
  matchesWithMtime.sort((a,b)=>(b.mtime || 0)-(a.mtime || 0));
  return matchesWithMtime;

}

