/**
 * Glob 策略选择器
 *
 * 简化的策略选择逻辑：
 * - ripgrep 可用 → 使用 ripgrep
 * - ripgrep 不可用 → fallback 到 glob npm 包
 *
 * 策略矩阵：
 * | ripgrep 可用 | 选择方案     | 说明                           |
 * |-------------|-------------|--------------------------------|
 * | ✅          | ripgrep     | 使用 ripgrep 列出文件 + stat   |
 * | ❌          | glob npm    | fallback 到 glob npm 包        |
 */

import { GlobStrategy, GlobFileItem, GlobStrategyOptions } from '../types.js';
import { getRuntimeName } from '../../utils/runtime.js';
import { canUseRipgrep } from '../../utils/tool-detection.js';
import { searchLogger } from '../../../../utils/logUtils.js';
import { globWithNpmPackage } from './glob-npm.js';
import { globWithRipgrep } from './ripgrep.js';
import { isAbortError } from '../../utils/error-utils.js';
import { logger } from '../../../../utils/logger.js';

/**
 * 选择最优 Glob 策略
 *
 * 简化逻辑：ripgrep 可用就用 ripgrep，否则用 glob npm 包
 *
 * @param binDir - 本地二进制缓存目录
 * @returns 选择的策略
 */
export async function selectGlobStrategy(binDir?: string): Promise<GlobStrategy> {
  const runtime = getRuntimeName();
  const hasRipgrep = await canUseRipgrep(binDir);

  // 记录策略选择的决策过程
  logger.debug(`🎯 [Glob:StrategySelection] Evaluating`, {
    runtime,
    hasRipgrep,
    hasBinDir: !!binDir,
    binDir,
  });

  // ripgrep 可用（系统已安装或有 binDir 可供下载）→ 使用 ripgrep
  if (hasRipgrep || binDir) {
    const reason = hasRipgrep
      ? 'ripgrep available in system'
      : 'binDir provided (will attempt download if needed)';
    logger.debug(`🎯 [Glob:StrategySelection] Chose ${GlobStrategy.RIPGREP}`, { reason });
    return GlobStrategy.RIPGREP;
  }

  // ripgrep 不可用 → fallback 到 glob npm 包
  const reason = 'ripgrep not available and no binDir for download';
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
      case GlobStrategy.RIPGREP:
        files = await globWithRipgrep(pattern, cwd, options);
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
    if (strategy === GlobStrategy.RIPGREP) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      searchLogger.strategyFallback(GlobStrategy.RIPGREP, GlobStrategy.GLOB_NPM, errorMessage);

      files = await globWithNpmPackage(pattern, cwd, options);
      return {
        files,
        strategy: GlobStrategy.GLOB_NPM,
        warning: `从 ${GlobStrategy.RIPGREP} 降级到 ${GlobStrategy.GLOB_NPM}: ${errorMessage}`,
      };
    }

    // glob npm 策略失败，无法降级
    throw error;
  }
}

// 导出策略实现
export { globWithNpmPackage } from './glob-npm.js';
export { globWithRipgrep } from './ripgrep.js';
