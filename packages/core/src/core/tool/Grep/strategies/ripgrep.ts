/**
 * Ripgrep 搜索策略
 *
 * 使用 ripgrep 进行文件内容搜索。
 * 这是最快的搜索策略。
 *
 * 优势：
 * - Rust 实现，多线程并行搜索
 * - 智能跳过二进制文件
 * - 自动遵守 .gitignore
 * - 流式读取，内存安全
 */

import { GrepMatch, GrepStrategyOptions, GREP_DEFAULTS } from '../types.js';
import { Ripgrep } from '../../utils/ripgrep.js';
import { createAbortError } from '../../utils/error-utils.js';
import { logger } from '../../../../utils/logger.js';

/**
 * 使用 ripgrep 搜索文件内容
 *
 * 使用 search() 方法直接获取所有输出，避免 async generator 的问题。
 * Bun 的 async generator 在处理大量数据时会触发 "this.write" 错误。
 *
 * @param pattern - 正则表达式模式
 * @param cwd - 工作目录
 * @param options - 选项
 * @returns 匹配结果列表
 */
export async function grepWithRipgrep(
  pattern: string,
  cwd: string,
  options?: GrepStrategyOptions
): Promise<GrepMatch[]> {
  if (options?.signal?.aborted) {
    throw createAbortError();
  }

  // 🔑 使用 search() 而不是 searchStream()，避免 async generator 问题
  const output = await Ripgrep.search({
    cwd,
    pattern,
    glob: options?.include,
    binDir: options?.binDir,
    signal: options?.signal,
    maxCount: options?.maxCount,
    // 从读取阶段就限制输出规模：最多收集 limit 行，避免 stdout 爆炸导致 Bun 内部错误
    maxOutputLines: options?.limit ?? GREP_DEFAULTS.LIMIT,
  });

  const matches: GrepMatch[] = [];

  // 解析输出
  if (output) {
    const lines = output.trim().split(/\r?\n/);
    for (const line of lines) {
      const match = parseLine(line);
      if (match) {
        matches.push(match);
      }
    }
  }

  return matches;
}

/**
 * 解析单行 ripgrep 输出
 *
 * ripgrep 输出格式：文件路径|行号|行内容
 *
 * @param line - 单行输出
 * @returns 解析后的匹配对象，解析失败返回 null
 */
function parseLine(line: string): GrepMatch | null {
  if (!line) return null;

  // 解析格式：文件路径|行号|行内容
  const [filePath, lineNumStr, ...lineTextParts] = line.split('|');
  if (!filePath || !lineNumStr || lineTextParts.length === 0) return null;

  const lineNum = parseInt(lineNumStr, 10);
  if (isNaN(lineNum)) return null;

  // 重新组合行内容（防止内容中有 |）
  let lineText = lineTextParts.join('|');

  // 截断过长的行
  if (lineText.length > GREP_DEFAULTS.MAX_LINE_LENGTH) {
    lineText = lineText.substring(0, GREP_DEFAULTS.MAX_LINE_LENGTH) + '...';
  }

  return {
    filePath,
    lineNumber: lineNum,
    line: lineText,
  };
}
