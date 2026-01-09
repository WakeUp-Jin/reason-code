import { mkdirSync } from 'fs';
import { homedir, tmpdir } from 'os';
import { join } from 'path';

function safeHomeDir(): string {
  const home = homedir();
  return home && home.trim() ? home : tmpdir();
}

/**
 * 获取 reason 的“数据根目录”。
 *
 * 路径选择策略（折中方案）：
 * - Linux：遵循 XDG 生态（默认 ~/.local/share）
 * - macOS/Windows：使用 ~/.reason（更直观、更一致）
 */
export function getReasonDataRootDir(): string {
  if (process.platform === 'linux') {
    const xdgDataHome = process.env.XDG_DATA_HOME || join(safeHomeDir(), '.local', 'share');
    return join(xdgDataHome, 'reason');
  }

  return join(safeHomeDir(), '.reason');
}

/**
 * 获取 reason 的二进制目录（用于缓存下载的 rg/rg.exe）。
 */
export function getReasonBinDir(): string {
  return join(getReasonDataRootDir(), 'bin');
}

/**
 * 确保 reason 的二进制目录存在，并返回该路径。
 */
export function ensureReasonBinDir(): string {
  const dir = getReasonBinDir();
  mkdirSync(dir, { recursive: true });
  return dir;
}

