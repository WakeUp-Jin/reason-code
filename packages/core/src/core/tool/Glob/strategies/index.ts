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
import { searchLogger } from '../../../../utils/logUtils.js';
import { globWithNpmPackage } from './glob-npm.js';
import { globWithRipgrepBun } from './ripgrep-bun.js';

/**
 * 选择最优 Glob 策略
 *
 * @param binDir - 本地二进制缓存目录
 * @returns 选择的策略
 */
export async function selectGlobStrategy(binDir?: string): Promise<GlobStrategy> {
  const hasRipgrep = await canUseRipgrep(binDir);

  // Bun 环境：优先使用 ripgrep
  if (isBun() && hasRipgrep) {
    return GlobStrategy.RIPGREP_BUN;
  }

  // 其他情况：使用 glob 包
  // - Node.js 环境（即使 ripgrep 可用）
  // - Bun 环境但 ripgrep 不可用
  return GlobStrategy.GLOB_NPM;
}

/**
 * 执行 Glob 搜索
 *
 * 自动选择最优策略并执行。
 *
 * @param pattern - glob 模式
 * @param cwd - 工作目录
 * @param options - 选项
 * @returns 文件列表和使用的策略
 */
export async function executeGlobStrategy(
  pattern: string,
  cwd: string,
  options?: GlobStrategyOptions
): Promise<{ files: GlobFileItem[]; strategy: string }> {
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
    // 如果 ripgrep 策略失败，降级到 glob npm
    if (strategy === GlobStrategy.RIPGREP_BUN) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      searchLogger.strategyFallback(GlobStrategy.RIPGREP_BUN, GlobStrategy.GLOB_NPM, errorMessage);

      files = await globWithNpmPackage(pattern, cwd, options);
      return { files, strategy: `${GlobStrategy.GLOB_NPM} (fallback)` };
    }

    // glob npm 策略失败，无法降级
    throw error;
  }
}

// 导出策略实现
export { globWithNpmPackage } from './glob-npm.js';
export { globWithRipgrepBun } from './ripgrep-bun.js';

