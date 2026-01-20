/**
 * Grep 工具类型定义
 */

import type { ToolResult } from '../types.js';

/**
 * Grep 策略枚举
 */
export enum GrepStrategy {
  /** ripgrep（最快） */
  RIPGREP = 'ripgrep',
  /** git grep（Git 仓库中利用索引，次快） */
  GIT_GREP = 'git-grep',
  /** 系统 grep 命令（中等速度） */
  SYSTEM_GREP = 'system-grep',
  /** JavaScript 实现（保底，100% 可用） */
  JAVASCRIPT = 'javascript',
}

/**
 * Grep 工具参数
 */
export interface GrepArgs {
  /** 正则表达式搜索模式 */
  pattern: string;
  /** 搜索目录，默认为当前工作目录 */
  path?: string;
  /** 文件过滤模式，如 "*.ts" 或 "*.{js,jsx}" */
  include?: string;
}

/**
 * 单个匹配结果
 */
export interface GrepMatch {
  /** 文件路径 */
  filePath: string;
  /** 行号 */
  lineNumber: number;
  /** 匹配的行内容 */
  line: string;
  /** 文件修改时间（毫秒时间戳，可选） */
  mtime?: number;
}

/**
 * Grep 业务数据
 */
export interface GrepData {
  /** 搜索模式 */
  pattern: string;
  /** 搜索目录 */
  directory: string;
  /** 匹配结果列表 */
  matches: GrepMatch[];
  /** 匹配总数 */
  count: number;
  /** 使用的策略 */
  strategy: string;
}

/**
 * Grep 工具结果（统一结果接口）
 */
export type GrepResult = ToolResult<GrepData>;

/**
 * Grep 策略执行函数类型
 */
export type GrepStrategyExecutor = (
  pattern: string,
  cwd: string,
  options?: GrepStrategyOptions
) => Promise<GrepMatch[]>;

/**
 * Grep 策略选项
 */
export interface GrepStrategyOptions {
  /** 文件过滤 glob 模式 */
  include?: string;
  /** 结果数量限制 */
  limit?: number;
  /** 本地二进制缓存目录（用于 ripgrep） */
  binDir?: string;
  /** AbortSignal */
  signal?: AbortSignal;
  /** 每个文件的最大匹配数（ripgrep --max-count，默认 100） */
  maxCount?: number;
}

/**
 * 默认配置
 */
export const GREP_DEFAULTS = {
  /** 默认结果限制（流式读取下可以设置更大） */
  LIMIT: 1000,
  /** 单行最大长度 */
  MAX_LINE_LENGTH: 2000,
  /** 默认排除的目录 */
  EXCLUDE_DIRS: ['node_modules', '.git', 'dist', 'build', 'coverage', '.next', '.nuxt'],
} as const;

