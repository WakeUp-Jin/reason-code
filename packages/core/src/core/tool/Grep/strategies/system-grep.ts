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

import { spawn } from 'child_process';
import { GrepMatch, GrepStrategyOptions, GREP_DEFAULTS } from '../types.js';
import { searchLogger } from '../../../../utils/logUtils.js';
import { createAbortError } from '../../utils/error-utils.js';

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
  return new Promise((resolve, reject) => {
    const args = [
      '-r', // 递归搜索
      '-n', // 显示行号
      '-H', // 显示文件名
      '-E', // 扩展正则表达式
      '-i', // 忽略大小写
    ];

    // 排除常见目录
    for (const dir of GREP_DEFAULTS.EXCLUDE_DIRS) {
      args.push(`--exclude-dir=${dir}`);
    }

    // 添加文件过滤
    if (options?.include) {
      args.push(`--include=${options.include}`);
    }

    args.push(pattern);
    args.push('.');

    const proc = spawn('grep', args, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });

    let aborted = false;
    let stdout = '';
    const stderrChunks: string[] = [];

    proc.stdout.on('data', (chunk) => {
      stdout += chunk.toString('utf-8');
    });

    proc.stderr.on('data', (chunk) => {
      const stderrStr = chunk.toString('utf-8');

      // ⚠️ 错误抑制：忽略权限错误和目录错误
      if (stderrStr.includes('Permission denied')) {
        // 记录被抑制的错误
        const lines = stderrStr.split('\n');
        for (const line of lines) {
          if (line.includes('Permission denied')) {
            const match = line.match(/grep: (.+?): Permission denied/);
            if (match) {
              searchLogger.suppressed('system-grep', match[1], 'EACCES', 'Permission denied');
            }
          }
        }
        return;
      }

      if (/grep:.*: Is a directory/i.test(stderrStr)) {
        return;
      }

      stderrChunks.push(stderrStr);
    });

    proc.on('close', (code) => {
      if (aborted) {
        return;
      }

      if (code === 0) {
        const matches = parseSystemGrepOutput(stdout);
        const limit = options?.limit ?? GREP_DEFAULTS.LIMIT;
        resolve(matches.slice(0, limit));
      } else if (code === 1) {
        // 没有匹配
        resolve([]);
      } else {
        const stderr = stderrChunks.join('').trim();
        if (stderr) {
          reject(new Error(stderr));
        } else {
          // 退出码 > 1 但没有 stderr，可能是被抑制的错误
          resolve([]);
        }
      }
    });

    proc.on('error', (error) => {
      if (aborted) {
        return;
      }
      reject(error);
    });

    // 超时处理
    if (options?.signal) {
      options.signal.addEventListener(
        'abort',
        () => {
          aborted = true;
          proc.kill();
          reject(createAbortError());
        },
        { once: true }
      );
    }
  });
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
