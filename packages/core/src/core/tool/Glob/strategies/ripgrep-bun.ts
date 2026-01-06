/**
 * Ripgrep + Bun.stat 策略
 *
 * 使用 ripgrep 列出文件，然后使用 Bun.stat() 获取元数据。
 * 这是 Bun 环境下的最优方案。
 *
 * 优势：
 * - ripgrep 列出文件极快
 * - Bun.stat() 比 Node.js fs.stat() 快约 12 倍（~0.1ms vs ~1.2ms）
 * - 组合性能最佳
 *
 * 注意：
 * - 仅在 Bun 环境下使用
 * - Node.js 环境应使用 glob-npm 策略
 */

import { resolve } from 'path';
import { stat } from 'fs/promises';
import { GlobFileItem, GlobStrategyOptions, GLOB_DEFAULTS } from '../types.js';
import { Ripgrep } from '../../utils/ripgrep.js';
import { isBun } from '../../utils/runtime.js';
import { searchLogger } from '../../../../utils/logUtils.js';

/**
 * 使用 ripgrep + stat 搜索文件
 *
 * @param pattern - glob 模式
 * @param cwd - 工作目录
 * @param options - 选项
 * @returns 文件列表
 */
export async function globWithRipgrepBun(
  pattern: string,
  cwd: string,
  options?: GlobStrategyOptions
): Promise<GlobFileItem[]> {
  const limit = options?.limit ?? GLOB_DEFAULTS.LIMIT;
  const files: GlobFileItem[] = [];

  try {
    // 使用 ripgrep 快速列出文件
    for await (const file of Ripgrep.files({
      cwd,
      glob: [pattern],
      binDir: options?.binDir,
    })) {
      // 检查是否被取消
      if (options?.signal?.aborted) {
        throw new Error('AbortError');
      }

      if (files.length >= limit) {
        break;
      }

      const fullPath = resolve(cwd, file);

      // 获取文件元数据
      const mtime = await getFileMtime(fullPath);

      files.push({
        path: fullPath,
        mtime,
      });
    }

    // 智能排序（24小时优先）
    sortByRecentFirst(files);

    return files;
  } catch (error: unknown) {
    // 如果是 AbortError，直接抛出
    if (error instanceof Error && (error.name === 'AbortError' || error.message === 'AbortError')) {
      const abortError = new Error('AbortError');
      abortError.name = 'AbortError';
      throw abortError;
    }

    // 其他错误记录并抛出
    const errorMessage = error instanceof Error ? error.message : String(error);
    searchLogger.error('Glob', errorMessage, ['ripgrep-bun']);
    throw error;
  }
}

/**
 * 获取文件修改时间
 *
 * 在 Bun 环境下使用 Bun.file().stat()，否则使用 fs.stat()
 *
 * @param filePath - 文件路径
 * @returns 修改时间（毫秒时间戳）
 */
async function getFileMtime(filePath: string): Promise<number> {
  try {
    if (isBun()) {
      // @ts-ignore - Bun 全局变量
      const bunFile = Bun.file(filePath);
      const stats = await bunFile.stat();
      return stats.mtime.getTime();
    } else {
      // Node.js 环境
      const stats = await stat(filePath);
      return stats.mtimeMs;
    }
  } catch (error: unknown) {
    // 错误抑制：记录但返回 0
    const errorCode = isNodeError(error) ? error.code || 'UNKNOWN' : 'UNKNOWN';
    const errorMessage = error instanceof Error ? error.message : String(error);
    searchLogger.suppressed('ripgrep-bun', filePath, errorCode, errorMessage);
    return 0;
  }
}

/**
 * 智能排序：24小时内修改的文件优先
 *
 * @param files - 文件列表
 */
function sortByRecentFirst(files: GlobFileItem[]): void {
  const now = Date.now();

  files.sort((a, b) => {
    const aRecent = now - a.mtime < GLOB_DEFAULTS.RECENT_THRESHOLD;
    const bRecent = now - b.mtime < GLOB_DEFAULTS.RECENT_THRESHOLD;

    // 最近24小时的文件优先
    if (aRecent && !bRecent) return -1;
    if (!aRecent && bRecent) return 1;

    // 其他按修改时间降序
    return b.mtime - a.mtime;
  });
}

/**
 * 检查是否是 Node.js 错误
 */
function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}

