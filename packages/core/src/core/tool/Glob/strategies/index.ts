/**
 * Glob 策略选择器
 *
 * 根据运行环境和工具可用性自动选择最优策略。
 *
 * 策略矩阵：
 * | 环境     | ripgrep 可用 | 选择方案              | 性能        |
 * |----------|-------------|----------------------|-------------|
 * | Bun      | ✅          | ripgrep + Bun.stat() | ⭐⭐⭐⭐⭐ 62ms  |
 * | Bun      | ❌          | glob npm 包          | ⭐⭐⭐⭐ 103ms |
 * | Node.js  | ✅          | glob npm 包          | ⭐⭐⭐⭐ 103ms |
 * | Node.js  | ❌          | glob npm 包          | ⭐⭐⭐⭐ 103ms |
 *
 * 关键发现：
 * - Bun + ripgrep = 最快（62ms）
 * - Node.js 环境不使用 ripgrep（即使可用），避免慢速 stat
 */

import { GlobStrategy, GlobFileItem, GlobStrategyOptions } from '../types.js';
import { isBun, getRuntimeName } from '../../utils/runtime.js';
import { canUseRipgrep } from '../../utils/tool-detection.js';
import { searchLogger, ripgrepLogger } from '../../../../utils/logUtils.js';
import { globWithNpmPackage } from './glob-npm.js';
import { globWithRipgrepBun } from './ripgrep-bun.js';
import { isAbortError } from '../../utils/error-utils.js';
import { logger } from '../../../../utils/logger.js';

/**
 * 选择最优 Glob 策略
 *
 * @param binDir - 本地二进制缓存目录
 * @returns 选择的策略
 */
export async function selectGlobStrategy(binDir?: string): Promise<GlobStrategy> {
  const runtime = getRuntimeName();
  const isBunEnv = isBun();
  const hasRipgrep = await canUseRipgrep(binDir);

  // 记录策略选择的决策过程
  logger.debug(`🎯 [Glob:StrategySelection] Evaluating`, {
    runtime,
    isBunEnv,
    hasRipgrep,
    hasBinDir: !!binDir,
    binDir,
  });

  // Bun 环境：优先使用 ripgrep
  // 如果传入了 binDir，则视为"允许使用本地缓存/尝试自动下载"，即使当前不存在 rg 也会尝试 ripgrep-bun 策略。
  if (isBunEnv && (hasRipgrep || binDir)) {
    const reason = hasRipgrep
      ? 'Bun environment with ripgrep available'
      : 'Bun environment with binDir (will attempt download if needed)';
    logger.debug(`🎯 [Glob:StrategySelection] Chose ${GlobStrategy.RIPGREP_BUN}`, { reason });
    return GlobStrategy.RIPGREP_BUN;
  }

  // 其他情况：使用 glob 包
  // - Node.js 环境（即使 ripgrep 可用）
  // - Bun 环境但 ripgrep 不可用
  const reason = isBunEnv
    ? 'Bun environment but ripgrep not available and no binDir'
    : 'Node.js environment (prefer glob npm for better stat performance)';
  logger.debug(`🎯 [Glob:StrategySelection] Chose ${GlobStrategy.GLOB_NPM}`, { reason });
  return GlobStrategy.GLOB_NPM;
}

/**
 * 策略执行结果
 */
export interface GlobStrategyResult {
  /** 文件列表 */
  files: GlobFileItem[];
  /** 使用的策略 */
  strategy: string;
  /** 警告信息（如降级） */
  warning?: string;
}

/**
 * 执行 Glob 搜索
 *
 * 自动选择最优策略并执行。
 *
 * @param pattern - glob 模式
 * @param cwd - 工作目录
 * @param options - 选项
 * @returns 文件列表、使用的策略和可能的警告
 */
export async function executeGlobStrategy(
  pattern: string,
  cwd: string,
  options?: GlobStrategyOptions
): Promise<GlobStrategyResult> {
  // 选择策略
  const strategy = await selectGlobStrategy(options?.binDir);
  const runtime = getRuntimeName();

  // 记录策略选择
  searchLogger.strategySelected('Glob', strategy, runtime);

  let files: GlobFileItem[];

  try {
    switch (strategy) {
      case GlobStrategy.RIPGREP_BUN:
        files = await globWithRipgrepBun(pattern, cwd, options);
        break;

      case GlobStrategy.GLOB_NPM:
      default:
        files = await globWithNpmPackage(pattern, cwd, options);
        break;
    }

    return { files, strategy };
  } catch (error: unknown) {
    // 用户取消：不可恢复，不做降级
    if (isAbortError(error)) {
      throw error;
    }

    // 如果 ripgrep 策略失败，降级到 glob npm
    if (strategy === GlobStrategy.RIPGREP_BUN) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      searchLogger.strategyFallback(GlobStrategy.RIPGREP_BUN, GlobStrategy.GLOB_NPM, errorMessage);

      files = await globWithNpmPackage(pattern, cwd, options);
      return {
        files,
        strategy: GlobStrategy.GLOB_NPM,
        warning: `从 ${GlobStrategy.RIPGREP_BUN} 降级到 ${GlobStrategy.GLOB_NPM}: ${errorMessage}`,
      };
    }

    // glob npm 策略失败，无法降级
    throw error;
  }
}

// 导出策略实现
export { globWithNpmPackage } from './glob-npm.js';
export { globWithRipgrepBun } from './ripgrep-bun.js';
