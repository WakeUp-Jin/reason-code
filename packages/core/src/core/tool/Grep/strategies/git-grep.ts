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

import { spawn } from 'child_process';
import { GrepMatch, GrepStrategyOptions, GREP_DEFAULTS } from '../types.js';
import { searchLogger } from '../../../../utils/logUtils.js';

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
  return new Promise((resolve, reject) => {
    const args = [
      'grep',
      '--untracked', // 包括未追踪的文件
      '-n', // 显示行号
      '-E', // 扩展正则表达式
      '--ignore-case', // 忽略大小写
      pattern,
    ];

    // 添加文件过滤
    if (options?.include) {
      args.push('--', options.include);
    }

    const proc = spawn('git', args, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (chunk) => {
      stdout += chunk.toString('utf-8');
    });

    proc.stderr.on('data', (chunk) => {
      stderr += chunk.toString('utf-8');
    });

    proc.on('close', (code) => {
      if (code === 0) {
        const matches = parseGitGrepOutput(stdout);
        const limit = options?.limit ?? GREP_DEFAULTS.LIMIT;
        resolve(matches.slice(0, limit));
      } else if (code === 1) {
        // 没有匹配
        resolve([]);
      } else {
        const errorMessage = stderr || `git grep exited with code ${code}`;
        searchLogger.error('Grep', errorMessage, ['git-grep']);
        reject(new Error(errorMessage));
      }
    });

    proc.on('error', (error) => {
      searchLogger.error('Grep', error.message, ['git-grep']);
      reject(error);
    });

    // 超时处理
    if (options?.signal) {
      options.signal.addEventListener('abort', () => {
        proc.kill();
        reject(new Error('AbortError'));
      });
    }
  });
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

