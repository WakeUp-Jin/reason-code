/**
 * 工具可用性检测
 *
 * 用于检测各种搜索工具是否可用，以便选择最优的搜索策略。
 *
 * 检测优先级：
 * - Grep: ripgrep → git grep → system grep → JavaScript
 * - Glob: ripgrep (Bun环境) → glob npm 包
 */

import { existsSync, statSync } from 'fs';
import { spawn } from 'child_process';
import { join } from 'path';

/**
 * 缓存检测结果
 */
const _cache: {
  ripgrep?: boolean;
  git?: boolean;
  grep?: boolean;
} = {};

/**
 * 检测命令是否可用
 *
 * @param command - 命令名称
 * @param args - 检测参数（通常是 --version）
 * @returns 命令是否可用
 */
async function isCommandAvailable(command: string, args: string[] = ['--version']): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const proc = spawn(command, args, {
        stdio: ['ignore', 'ignore', 'ignore'],
        windowsHide: true,
      });

      proc.on('error', () => {
        resolve(false);
      });

      proc.on('close', (code) => {
        resolve(code === 0);
      });

      // 超时处理
      setTimeout(() => {
        proc.kill();
        resolve(false);
      }, 3000);
    } catch {
      resolve(false);
    }
  });
}

/**
 * 检测 ripgrep 是否可用
 *
 * 检测逻辑：
 * 1. 检查系统 PATH 中是否有 rg 命令
 * 2. 检查本地缓存目录是否有 rg 二进制
 *
 * @param localBinPath - 本地二进制缓存目录（可选）
 * @returns ripgrep 是否可用
 */
export async function canUseRipgrep(localBinPath?: string): Promise<boolean> {
  if (_cache.ripgrep !== undefined) {
    return _cache.ripgrep;
  }

  // 1. 检查系统 PATH
  const systemAvailable = await isCommandAvailable('rg');
  if (systemAvailable) {
    _cache.ripgrep = true;
    return true;
  }

  // 2. 检查本地缓存
  if (localBinPath) {
    const rgPath = join(localBinPath, process.platform === 'win32' ? 'rg.exe' : 'rg');
    if (existsSync(rgPath)) {
      try {
        const stats = statSync(rgPath);
        if (stats.isFile()) {
          _cache.ripgrep = true;
          return true;
        }
      } catch {
        // 忽略错误
      }
    }
  }

  _cache.ripgrep = false;
  return false;
}

/**
 * 检测是否是 Git 仓库
 *
 * @param path - 目录路径
 * @returns 是否是 Git 仓库
 */
export function isGitRepository(path: string): boolean {
  try {
    const gitDir = join(path, '.git');
    if (existsSync(gitDir)) {
      const stats = statSync(gitDir);
      return stats.isDirectory();
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * 检测 git 命令是否可用
 *
 * @returns git 是否可用
 */
export async function canUseGit(): Promise<boolean> {
  if (_cache.git !== undefined) {
    return _cache.git;
  }

  _cache.git = await isCommandAvailable('git');
  return _cache.git;
}

/**
 * 检测 git grep 是否可用
 *
 * 需要同时满足：
 * 1. git 命令可用
 * 2. 当前目录是 Git 仓库
 *
 * @param cwd - 当前工作目录
 * @returns git grep 是否可用
 */
export async function canUseGitGrep(cwd: string): Promise<boolean> {
  const gitAvailable = await canUseGit();
  if (!gitAvailable) {
    return false;
  }

  return isGitRepository(cwd);
}

/**
 * 检测系统 grep 命令是否可用
 *
 * @returns grep 是否可用
 */
export async function canUseSystemGrep(): Promise<boolean> {
  if (_cache.grep !== undefined) {
    return _cache.grep;
  }

  _cache.grep = await isCommandAvailable('grep');
  return _cache.grep;
}

/**
 * 重置缓存（仅用于测试）
 */
export function _resetDetectionCache(): void {
  delete _cache.ripgrep;
  delete _cache.git;
  delete _cache.grep;
}

/**
 * 获取所有工具的可用性状态
 *
 * @param cwd - 当前工作目录
 * @param localBinPath - 本地二进制缓存目录
 * @returns 工具可用性状态
 */
export async function getToolAvailability(
  cwd: string,
  localBinPath?: string
): Promise<{
  ripgrep: boolean;
  gitGrep: boolean;
  systemGrep: boolean;
  isGitRepo: boolean;
}> {
  const [ripgrep, gitGrep, systemGrep] = await Promise.all([
    canUseRipgrep(localBinPath),
    canUseGitGrep(cwd),
    canUseSystemGrep(),
  ]);

  return {
    ripgrep,
    gitGrep,
    systemGrep,
    isGitRepo: isGitRepository(cwd),
  };
}

