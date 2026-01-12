/**
 * Glob Tool Type Definitions
 */

import type { ToolResult } from '../types.js';

/**
 * Glob Strategy Enum
 */
export enum GlobStrategy {
  /** ripgrep + stat (preferred when ripgrep is available) */
  RIPGREP = 'ripgrep',
  /** glob npm package (fallback solution) */
  GLOB_NPM = 'glob-npm',
}

/**
 * Glob Tool Arguments
 */
export interface GlobArgs {
  /** Glob pattern, e.g. "*.ts", "**\/*.test.js" */
  pattern: string;
  /** Search directory, defaults to current working directory */
  path?: string;
}

/**
 * Single File Result
 */
export interface GlobFileItem {
  /** Full file path */
  path: string;
  /** File modification time (millisecond timestamp) */
  mtime: number;
}

/**
 * Glob 业务数据
 */
export interface GlobData {
  /** Search directory */
  directory: string;
  /** File list */
  files: GlobFileItem[];
  /** Total file count */
  count: number;
  /** Whether results are truncated */
  truncated: boolean;
  /** Strategy used */
  strategy: string;
}

/**
 * Glob Tool Result (统一结果接口)
 */
export type GlobResult = ToolResult<GlobData>;

/**
 * Glob Strategy Executor Function Type
 */
export type GlobStrategyExecutor = (
  pattern: string,
  cwd: string,
  options?: GlobStrategyOptions
) => Promise<GlobFileItem[]>;

/**
 * Glob Strategy Options
 */
export interface GlobStrategyOptions {
  /** Result count limit */
  limit?: number;
  /** Local binary cache directory (for ripgrep) */
  binDir?: string;
  /** AbortSignal */
  signal?: AbortSignal;
}

/**
 * Default Configuration
 */
export const GLOB_DEFAULTS = {
  /** Default result limit */
  LIMIT: 100,
  /** 24 hour threshold (milliseconds) for smart sorting */
  RECENT_THRESHOLD: 24 * 60 * 60 * 1000,
  /** Default excluded directories */
  EXCLUDE_DIRS: ['node_modules', '.git', 'dist', 'build', 'coverage', '.next', '.nuxt'],
} as const;
