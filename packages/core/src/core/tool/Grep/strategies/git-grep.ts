/**
 * Git Grep 搜索策略
 *
 * 使用 git grep 进行文件内容搜索。
 * 在 Git 仓库中利用索引，速度非常快。
 *
 * 优势：
 * - 利用 git 索引，搜索速度极快
 * - 自动忽略 .gitignore 中的文件
 * - 不需要额外安装工具
 *
 * 限制：
 * - 只能在 Git 仓库中使用
 */

import { statSync } from 'fs';
import { dirname, basename } from 'path';
import { GrepMatch, GrepStrategyOptions, GREP_DEFAULTS } from '../types.js';
import { runCommand } from '../../utils/spawn.js';
import { isAbortError } from '../../utils/error-utils.js';

/**
 * 使用 git grep 搜索文件内容
 *
 * @param pattern - 正则表达式模式
 * @param cwd - 工作目录
 * @param options - 选项
 * @returns 匹配结果列表
 */
export async function grepWithGit(
  pattern: string,
  cwd: string,
  options?: GrepStrategyOptions
): Promise<GrepMatch[]> {
  // 检查搜索路径是文件还是目录
  // 如果是文件，使用其父目录作为 cwd，文件名作为搜索目标
  let processCwd = cwd;
  let searchTarget: string | null = null;

  try {
    const stat = statSync(cwd);
    if (stat.isFile()) {
      processCwd = dirname(cwd);
      searchTarget = basename(cwd);
    }
  } catch {
    // 如果 stat 失败，保持原样
  }

  const args = [
    'grep',
    '--untracked', // 包括未追踪的文件
    '-n', // 显示行号
    '-E', // 扩展正则表达式
    '--ignore-case', // 忽略大小写
    pattern,
  ];

  // 添加文件过滤或搜索目标
  if (searchTarget) {
    // 如果是单个文件，添加 -- 后跟文件名
    args.push('--', searchTarget);
  } else if (options?.include) {
    args.push('--', options.include);
  }

  try {
    const result = await runCommand('git', args, {
      cwd: processCwd,
      signal: options?.signal,
    });

    // exitCode === 0: 有匹配
    // exitCode === 1: 没有匹配
    // exitCode > 1: 错误
    if (result.exitCode === 0) {
      const matches = parseGitGrepOutput(result.stdout);
      const limit = options?.limit ?? GREP_DEFAULTS.LIMIT;
      return matches.slice(0, limit);
    } else if (result.exitCode === 1) {
      // 没有匹配
      return [];
    } else {
      const errorMessage = result.stderr || `git grep exited with code ${result.exitCode}`;
      throw new Error(errorMessage);
    }
  } catch (error) {
    // 重新抛出 AbortError
    if (isAbortError(error)) {
      throw error;
    }
    throw error;
  }
}

/**
 * 解析 git grep 输出
 *
 * git grep 输出格式：文件路径:行号:行内容
 *
 * @param output - git grep 原始输出
 * @returns 匹配结果列表
 */
function parseGitGrepOutput(output: string): GrepMatch[] {
  const lines = output.trim().split(/\r?\n/);
  const matches: GrepMatch[] = [];

  for (const line of lines) {
    if (!line) continue;

    // 解析格式：文件路径:行号:行内容
    const match = line.match(/^(.+?):(\d+):(.*)$/);
    if (!match) continue;

    const [, filePath, lineNumStr, lineText] = match;
    const lineNum = parseInt(lineNumStr, 10);
    if (isNaN(lineNum)) continue;

    // 截断过长的行
    let truncatedLine = lineText;
    if (truncatedLine.length > GREP_DEFAULTS.MAX_LINE_LENGTH) {
      truncatedLine = truncatedLine.substring(0, GREP_DEFAULTS.MAX_LINE_LENGTH) + '...';
    }

    matches.push({
      filePath,
      lineNumber: lineNum,
      line: truncatedLine,
    });
  }

  return matches;
}
