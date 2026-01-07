/**
 * Grep 策略选择器
 *
 * 根据运行环境和工具可用性自动选择最优策略。
 *
 * 四层降级策略：
 * 1. ripgrep：最快，需要安装
 * 2. git grep：Git 仓库中利用索引，次快
 * 3. system grep：系统自带，中等速度
 * 4. JavaScript：保底，100% 可用
 *
 * 性能对比（10000 个文件）：
 * | 策略       | 时间    | 说明                |
 * |------------|---------|---------------------|
 * | ripgrep    | ~50ms   | Rust 多线程         |
 * | git grep   | ~80ms   | 利用 git 索引       |
 * | system grep| ~200ms  | C 实现              |
 * | JavaScript | ~500ms  | 纯 JS，流式处理     |
 */

import { GrepStrategy, GrepMatch, GrepStrategyOptions } from '../types.js';
import { getRuntimeName } from '../../utils/runtime.js';
import { canUseRipgrep, canUseGitGrep, canUseSystemGrep } from '../../utils/tool-detection.js';
import { searchLogger } from '../../../../utils/logUtils.js';
import { grepWithRipgrep } from './ripgrep.js';
import { grepWithGit } from './git-grep.js';
import { grepWithSystemGrep } from './system-grep.js';
import { grepWithJavaScript } from './javascript.js';
import { isAbortError } from '../../utils/error-utils.js';

/**
 * 策略执行器映射
 */
const STRATEGY_EXECUTORS = {
  [GrepStrategy.RIPGREP]: grepWithRipgrep,
  [GrepStrategy.GIT_GREP]: grepWithGit,
  [GrepStrategy.SYSTEM_GREP]: grepWithSystemGrep,
  [GrepStrategy.JAVASCRIPT]: grepWithJavaScript,
};

/**
 * 获取可用策略列表（按优先级排序）
 *
 * @param cwd - 工作目录
 * @param binDir - 本地二进制缓存目录
 * @returns 可用策略列表
 */
export async function getAvailableStrategies(
  cwd: string,
  binDir?: string
): Promise<GrepStrategy[]> {
  const strategies: GrepStrategy[] = [];

  // 检测各工具可用性
  const [hasRipgrep, hasGitGrep, hasSystemGrep] = await Promise.all([
    canUseRipgrep(binDir),
    canUseGitGrep(cwd),
    canUseSystemGrep(),
  ]);

  // 按优先级添加策略
  // 如果传入了 binDir，则视为“允许使用本地缓存/尝试自动下载”，即使当前不存在 rg 也会尝试 ripgrep 策略。
  if (hasRipgrep || binDir) {
    strategies.push(GrepStrategy.RIPGREP);
  }
  if (hasGitGrep) {
    strategies.push(GrepStrategy.GIT_GREP);
  }
  if (hasSystemGrep) {
    strategies.push(GrepStrategy.SYSTEM_GREP);
  }

  // JavaScript 保底，总是可用
  strategies.push(GrepStrategy.JAVASCRIPT);

  return strategies;
}

/**
 * 选择最优 Grep 策略
 *
 * @param cwd - 工作目录
 * @param binDir - 本地二进制缓存目录
 * @returns 选择的策略
 */
export async function selectGrepStrategy(cwd: string, binDir?: string): Promise<GrepStrategy> {
  const strategies = await getAvailableStrategies(cwd, binDir);
  return strategies[0]; // 返回最高优先级的策略
}

/**
 * 策略执行结果
 */
export interface GrepStrategyResult {
  /** 匹配结果 */
  matches: GrepMatch[];
  /** 使用的策略 */
  strategy: string;
  /** 警告信息（如降级） */
  warning?: string;
}

/**
 * 执行 Grep 搜索
 *
 * 自动选择最优策略并执行。
 * 如果选择的策略失败，会自动降级到下一个策略。
 *
 * @param pattern - 正则表达式模式
 * @param cwd - 工作目录
 * @param options - 选项
 * @returns 匹配结果、使用的策略和可能的警告
 */
export async function executeGrepStrategy(
  pattern: string,
  cwd: string,
  options?: GrepStrategyOptions
): Promise<GrepStrategyResult> {
  const runtime = getRuntimeName();
  const strategies = await getAvailableStrategies(cwd, options?.binDir);
  const triedStrategies: string[] = [];
  const fallbackReasons: string[] = [];

  for (let i = 0; i < strategies.length; i++) {
    const strategy = strategies[i];
    triedStrategies.push(strategy);

    // 记录策略选择
    if (i === 0) {
      searchLogger.strategySelected('Grep', strategy, runtime);
    }

    try {
      const executor = STRATEGY_EXECUTORS[strategy];
      const matches = await executor(pattern, cwd, options);

      // 如果发生了降级，返回警告信息
      if (i > 0) {
        const warning = `从 ${triedStrategies[0]} 降级到 ${strategy}: ${fallbackReasons.join(' -> ')}`;
        return { matches, strategy, warning };
      }

      return { matches, strategy };
    } catch (error: unknown) {
      // 如果是 AbortError，直接抛出
      if (isAbortError(error)) {
        throw error;
      }

      const errorMessage = error instanceof Error ? error.message : String(error);

      // 如果还有下一个策略，降级
      if (i < strategies.length - 1) {
        const nextStrategy = strategies[i + 1];
        searchLogger.strategyFallback(strategy, nextStrategy, errorMessage);
        fallbackReasons.push(errorMessage);
        continue;
      }

      // 所有策略都失败了
      throw error;
    }
  }

  // 不应该到达这里
  throw new Error('No grep strategy available');
}

// 导出策略实现
export { grepWithRipgrep } from './ripgrep.js';
export { grepWithGit } from './git-grep.js';
export { grepWithSystemGrep } from './system-grep.js';
export { grepWithJavaScript } from './javascript.js';
