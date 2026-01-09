import { mkdirSync } from 'fs';
import { homedir, tmpdir } from 'os';
import { join } from 'path';

function safeHomeDir(): string {
  const home = homedir();
  return home && home.trim() ? home : tmpdir();
}

/**
 * 获取 reason-code 的"数据根目录"。
 *
 * 统一使用 ~/.reason-code
 */
export function getReasonDataRootDir(): string {
  return join(safeHomeDir(), '.reason-code');
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

