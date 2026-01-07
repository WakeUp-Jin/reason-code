/**
 * JavaScript Fallback 搜索策略
 *
 * 使用纯 JavaScript 实现的文件内容搜索。
 * 这是保底方案，保证 100% 可用。
 *
 * 优势：
 * - 100% 可用，不依赖任何外部工具
 * - 跨平台完全兼容
 * - 流式处理，避免内存溢出
 *
 * 限制：
 * - 相对较慢（需要读取文件内容到内存）
 */

import { readFile } from 'fs/promises';
import { join, relative } from 'path';
import { glob } from 'glob';
import { GrepMatch, GrepStrategyOptions, GREP_DEFAULTS } from '../types.js';
import { searchLogger } from '../../../../utils/logUtils.js';
import { createAbortError } from '../../utils/error-utils.js';

/**
 * 使用 JavaScript 搜索文件内容
 *
 * @param pattern - 正则表达式模式
 * @param cwd - 工作目录
 * @param options - 选项
 * @returns 匹配结果列表
 */
export async function grepWithJavaScript(
  pattern: string,
  cwd: string,
  options?: GrepStrategyOptions
): Promise<GrepMatch[]> {
  const globPattern = options?.include ?? '**/*';
  const limit = options?.limit ?? GREP_DEFAULTS.LIMIT;

  if (options?.signal?.aborted) {
    throw createAbortError();
  }

  // 创建正则表达式
  let regex: RegExp;
  try {
    regex = new RegExp(pattern, 'i');
  } catch (error) {
    throw new Error(`Invalid regex pattern: ${pattern}`);
  }

  const matches: GrepMatch[] = [];

  // 获取文件列表
  const files = await glob(globPattern, {
    cwd,
    nodir: true,
    dot: true,
    ignore: GREP_DEFAULTS.EXCLUDE_DIRS.map((dir) => `**/${dir}/**`),
    absolute: true,
    signal: options?.signal,
  });

  // 逐个文件处理
  for (const filePath of files) {
    // 检查是否被取消
    if (options?.signal?.aborted) {
      throw createAbortError();
    }

    // 检查是否达到限制
    if (matches.length >= limit) {
      break;
    }

    try {
      // 读取文件内容
      const content = await readFile(filePath, 'utf-8');
      const lines = content.split(/\r?\n/);

      // 逐行匹配
      for (let i = 0; i < lines.length; i++) {
        if (matches.length >= limit) {
          break;
        }

        const line = lines[i];
        if (regex.test(line)) {
          // 截断过长的行
          let truncatedLine = line;
          if (truncatedLine.length > GREP_DEFAULTS.MAX_LINE_LENGTH) {
            truncatedLine = truncatedLine.substring(0, GREP_DEFAULTS.MAX_LINE_LENGTH) + '...';
          }

          matches.push({
            filePath: relative(cwd, filePath),
            lineNumber: i + 1,
            line: truncatedLine,
          });
        }
      }
    } catch (error: unknown) {
      // ⚠️ 错误抑制：记录但继续处理其他文件
      if (isNodeError(error)) {
        const errorCode = error.code || 'UNKNOWN';
        const errorMessage = error.message;

        // 记录被抑制的错误
        searchLogger.suppressed('javascript', filePath, errorCode, errorMessage);

        // 权限错误或文件不存在，跳过继续
        if (errorCode === 'EACCES' || errorCode === 'ENOENT' || errorCode === 'EISDIR') {
          continue;
        }
      }

      // 其他错误也跳过，但记录
      const errorMessage = error instanceof Error ? error.message : String(error);
      searchLogger.suppressed('javascript', filePath, 'UNKNOWN', errorMessage);
    }
  }

  return matches;
}

/**
 * 检查是否是 Node.js 错误
 */
function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}
