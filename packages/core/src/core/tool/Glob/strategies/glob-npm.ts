/**
 * Glob npm 包策略
 *
 * 使用 glob npm 包实现文件搜索。
 * 这是通用的稳定方案，在所有环境下都能工作。
 *
 * 优势：
 * - 一次性返回路径和元数据，避免额外的 stat 调用
 * - 成熟稳定的 npm 包
 * - 支持符号链接安全控制
 */

import { glob } from 'glob';
import { GlobFileItem, GlobStrategyOptions, GLOB_DEFAULTS } from '../types.js';
import { searchLogger } from '../../../../utils/logUtils.js';

/**
 * 使用 glob npm 包搜索文件
 *
 * @param pattern - glob 模式
 * @param cwd - 工作目录
 * @param options - 选项
 * @returns 文件列表
 */
export async function globWithNpmPackage(
  pattern: string,
  cwd: string,
  options?: GlobStrategyOptions
): Promise<GlobFileItem[]> {
  const limit = options?.limit ?? GLOB_DEFAULTS.LIMIT;

  // 使用 glob 包，一次性获取路径和元数据
  const results = await glob(pattern, {
    cwd,
    withFileTypes: true,
    stat: true,
    nodir: true,
    follow: false, // ⚠️ 不跟随符号链接（安全）
    ignore: GLOB_DEFAULTS.EXCLUDE_DIRS.map((dir) => `**/${dir}/**`),
    signal: options?.signal,
  });

  // 转换为统一格式
  const files: GlobFileItem[] = [];
  for (const entry of results) {
    if (files.length >= limit) {
      break;
    }

    try {
      files.push({
        path: entry.fullpath(),
        mtime: entry.mtimeMs ?? 0,
      });
    } catch (error: unknown) {
      // 错误抑制：记录但继续处理
      const errorCode = isNodeError(error) ? error.code || 'UNKNOWN' : 'UNKNOWN';
      const errorMessage = error instanceof Error ? error.message : String(error);
      searchLogger.suppressed('glob-npm', entry.fullpath(), errorCode, errorMessage);
    }
  }

  // 智能排序（24小时优先）
  sortByRecentFirst(files);

  return files;
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
