/**
 * System Grep 搜索策略
 *
 * 使用系统 grep 命令进行文件内容搜索。
 * 作为 ripgrep 和 git grep 不可用时的降级方案。
 *
 * 优势：
 * - 大多数系统都预装了 grep
 * - C 实现，比 JavaScript 快数倍
 *
 * 限制：
 * - 比 ripgrep 和 git grep 慢
 * - Windows 系统可能没有 grep
 */

import { statSync } from 'fs';
import { dirname, basename } from 'path';
import { GrepMatch, GrepStrategyOptions, GREP_DEFAULTS } from '../types.js';
import { searchLogger } from '../../../../utils/logUtils.js';
import { runCommand } from '../../utils/spawn.js';
import { isAbortError } from '../../utils/error-utils.js';

/**
 * 使用系统 grep 搜索文件内容
 *
 * @param pattern - 正则表达式模式
 * @param cwd - 工作目录
 * @param options - 选项
 * @returns 匹配结果列表
 */
export async function grepWithSystemGrep(
  pattern: string,
  cwd: string,
  options?: GrepStrategyOptions
): Promise<GrepMatch[]> {
  // 检查搜索路径是文件还是目录
  // 如果是文件，使用其父目录作为 cwd，文件名作为搜索目标
  let processCwd = cwd;
  let searchTarget = '.';
  let isFile = false;

  try {
    const stat = statSync(cwd);
    if (stat.isFile()) {
      processCwd = dirname(cwd);
      searchTarget = basename(cwd);
      isFile = true;
    }
  } catch {
    // 如果 stat 失败，保持原样
  }

  const args = [
    '-n', // 显示行号
    '-H', // 显示文件名
    '-E', // 扩展正则表达式
    '-i', // 忽略大小写
  ];

  // 只有搜索目录时才需要递归和排除目录
  if (!isFile) {
    args.unshift('-r'); // 递归搜索
    // 排除常见目录
    for (const dir of GREP_DEFAULTS.EXCLUDE_DIRS) {
      args.push(`--exclude-dir=${dir}`);
    }
  }

  // 添加文件过滤（只在搜索目录时有效）
  if (!isFile && options?.include) {
    args.push(`--include=${options.include}`);
  }

  args.push(pattern);
  args.push(searchTarget);

  try {
    const result = await runCommand('grep', args, {
      cwd: processCwd,
      signal: options?.signal,
      // stderr 处理器：过滤权限错误和目录错误
      stderrHandler: (chunk) => {
        // 忽略权限错误
        if (chunk.includes('Permission denied')) {
          // 记录被抑制的错误
          const lines = chunk.split('\n');
          for (const line of lines) {
            if (line.includes('Permission denied')) {
              const match = line.match(/grep: (.+?): Permission denied/);
              if (match) {
                searchLogger.suppressed('system-grep', match[1], 'EACCES', 'Permission denied');
              }
            }
          }
          return null; // 过滤掉
        }

        // 忽略目录错误
        if (/grep:.*: Is a directory/i.test(chunk)) {
          return null; // 过滤掉
        }

        return chunk; // 保留其他错误
      },
    });

    // exitCode === 0: 有匹配
    // exitCode === 1: 没有匹配
    // exitCode > 1: 错误
    if (result.exitCode === 0) {
      const matches = parseSystemGrepOutput(result.stdout);
      const limit = options?.limit ?? GREP_DEFAULTS.LIMIT;
      return matches.slice(0, limit);
    } else if (result.exitCode === 1) {
      // 没有匹配
      return [];
    } else {
      const stderr = result.stderr.trim();
      if (stderr) {
        throw new Error(stderr);
      } else {
        // 退出码 > 1 但没有 stderr，可能是被抑制的错误
        return [];
      }
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
 * 解析 system grep 输出
 *
 * grep 输出格式：文件路径:行号:行内容
 *
 * @param output - grep 原始输出
 * @returns 匹配结果列表
 */
function parseSystemGrepOutput(output: string): GrepMatch[] {
  const lines = output.trim().split(/\r?\n/);
  const matches: GrepMatch[] = [];

  for (const line of lines) {
    if (!line) continue;

    // 解析格式：文件路径:行号:行内容
    // 注意：文件路径可能以 ./ 开头
    const match = line.match(/^(.+?):(\d+):(.*)$/);
    if (!match) continue;

    let [, filePath, lineNumStr, lineText] = match;
    const lineNum = parseInt(lineNumStr, 10);
    if (isNaN(lineNum)) continue;

    // 移除 ./ 前缀
    if (filePath.startsWith('./')) {
      filePath = filePath.substring(2);
    }

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
