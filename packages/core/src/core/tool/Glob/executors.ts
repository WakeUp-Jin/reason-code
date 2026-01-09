/**
 * Glob 工具执行器
 *
 * 根据文件名模式搜索文件路径，不涉及文件内容。
 */

import { resolve } from 'path';
import { existsSync } from 'fs';
import { GlobArgs, GlobResult, GLOB_DEFAULTS } from './types.js';
import { executeGlobStrategy } from './strategies/index.js';
import { searchLogger } from '../../../utils/logUtils.js';
import { InternalToolContext } from '../types.js';
import { ensureReasonBinDir } from '../utils/reasonPaths.js';
import { RIPGREP_AUTO_DOWNLOAD_ENABLED } from '../utils/ripgrepPolicy.js';
import { isAbortError, toErrorMessage } from '../utils/error-utils.js';

/**
 * Glob 执行器
 *
 * @param args - Glob 参数
 * @param context - 工具上下文
 * @returns Glob 结果（统一结果接口）
 */
export async function globExecutor(
  args: GlobArgs,
  context?: InternalToolContext
): Promise<GlobResult> {
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
    const { files, strategy, warning } = await executeGlobStrategy(args.pattern, searchPath, {
      limit: GLOB_DEFAULTS.LIMIT,
      binDir: binDirForRipgrep,
      signal: context?.abortSignal,
    });

    // 计算是否截断
    const truncated = files.length >= GLOB_DEFAULTS.LIMIT;

    // 记录完成
    const duration = Date.now() - startTime;
    searchLogger.complete('Glob', strategy, files.length, duration);

    return {
      success: true,
      warning,
      data: {
        directory: searchPath,
        files,
        count: files.length,
        truncated,
        strategy,
      },
    };
  } catch (error: unknown) {
    if (!isAbortError(error)) {
      searchLogger.error('Glob', toErrorMessage(error), ['executor']);
    }

    return {
      success: false,
      error: isAbortError(error) ? 'AbortError' : toErrorMessage(error),
      data: null,
    };
  }
}

/**
 * 格式化 Glob 结果供 Assistant 使用
 *
 * @param result - Glob 结果
 * @returns 格式化后的字符串
 */
export function renderGlobResultForAssistant(result: GlobResult): string {
  const lines: string[] = [];

  // 失败时
  if (!result.success) {
    lines.push(`Error: ${result.error}`);
    return lines.join('\n');
  }

  const data = result.data;
  if (!data || data.count === 0) {
    lines.push('No files found');
  } else {
    // 输出文件路径列表
    for (const file of data.files) {
      lines.push(file.path);
    }

    if (data.truncated) {
      lines.push('');
      lines.push(
        `(Results are truncated at ${GLOB_DEFAULTS.LIMIT} files. Consider using a more specific path or pattern.)`
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
 * 获取 Glob 结果的简短摘要
 *
 * @param result - Glob 结果
 * @returns 摘要字符串
 */
export function getGlobSummary(result: GlobResult): string {
  // 失败时
  if (!result.success) {
    return `Failed: ${result.error}`;
  }

  const data = result.data;
  if (!data || data.count === 0) {
    return 'No files found';
  }

  const truncatedNote = data.truncated ? ' (truncated)' : '';
  const warningNote = result.warning ? ' ⚠️' : '';
  return `Found ${data.count} file(s)${truncatedNote}${warningNote}`;
}
