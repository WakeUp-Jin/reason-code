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
 */

import { GrepMatch, GrepStrategyOptions, GREP_DEFAULTS } from '../types.js';
import { Ripgrep } from '../../utils/ripgrep.js';
import { createAbortError } from '../../utils/error-utils.js';

/**
 * 使用 ripgrep 搜索文件内容
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

  const output = await Ripgrep.search({
    cwd,
    pattern,
    glob: options?.include,
    binDir: options?.binDir,
    signal: options?.signal,
  });

  if (!output) {
    return [];
  }

  // 解析输出
  const matches = parseRipgrepOutput(output, cwd);

  // 限制结果数量
  const limit = options?.limit ?? GREP_DEFAULTS.LIMIT;
  return matches.slice(0, limit);
}

/**
 * 解析 ripgrep 输出
 *
 * ripgrep 输出格式：文件路径|行号|行内容
 *
 * @param output - ripgrep 原始输出
 * @param cwd - 工作目录
 * @returns 匹配结果列表
 */
function parseRipgrepOutput(output: string, cwd: string): GrepMatch[] {
  const lines = output.trim().split(/\r?\n/);
  const matches: GrepMatch[] = [];

  for (const line of lines) {
    if (!line) continue;

    // 解析格式：文件路径|行号|行内容
    const [filePath, lineNumStr, ...lineTextParts] = line.split('|');
    if (!filePath || !lineNumStr || lineTextParts.length === 0) continue;

    const lineNum = parseInt(lineNumStr, 10);
    if (isNaN(lineNum)) continue;

    // 重新组合行内容（防止内容中有 |）
    let lineText = lineTextParts.join('|');

    // 截断过长的行
    if (lineText.length > GREP_DEFAULTS.MAX_LINE_LENGTH) {
      lineText = lineText.substring(0, GREP_DEFAULTS.MAX_LINE_LENGTH) + '...';
    }

    matches.push({
      filePath,
      lineNumber: lineNum,
      line: lineText,
    });
  }

  return matches;
}
