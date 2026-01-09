/**
 * 运行时环境检测工具
 *
 * 用于检测当前运行环境（Bun/Node.js），以便选择最优的搜索策略。
 *
 * 关键洞察：
 * - Bun 的 file().stat() 比 Node.js 快约 12 倍（~0.1ms vs ~1.2ms）
 * - 因此在 Bun 环境下，ripgrep + Bun.stat() 组合性能最佳
 * - 在 Node.js 环境下，应避免大量 stat 调用，使用 glob 包一次性获取元数据更优
 */

/**
 * 运行时环境枚举
 */
export enum RuntimeEnvironment {
  BUN = 'bun',
  NODE = 'node',
  UNKNOWN = 'unknown',
}

/**
 * 缓存检测结果，避免重复检测
 */
let _cachedRuntime: RuntimeEnvironment | null = null;

/**
 * 检测当前运行时环境
 *
 * @returns 运行时环境类型
 */
export function detectRuntime(): RuntimeEnvironment {
  // 使用缓存结果
  if (_cachedRuntime !== null) {
    return _cachedRuntime;
  }

  _cachedRuntime = _detectRuntimeInternal();
  return _cachedRuntime;
}

/**
 * 内部检测逻辑
 */
function _detectRuntimeInternal(): RuntimeEnvironment {
  // 检测 Bun 环境
  // @ts-ignore - Bun 全局变量在 Node.js 环境下不存在
  if (typeof Bun !== 'undefined') {
    return RuntimeEnvironment.BUN;
  }

  // 检测 Node.js 环境
  if (typeof process !== 'undefined' && process.versions?.node) {
    return RuntimeEnvironment.NODE;
  }

  return RuntimeEnvironment.UNKNOWN;
}

/**
 * 检查是否是 Bun 环境
 *
 * @returns 是否是 Bun 环境
 */
export function isBun(): boolean {
  return detectRuntime() === RuntimeEnvironment.BUN;
}

/**
 * 检查是否是 Node.js 环境
 *
 * @returns 是否是 Node.js 环境
 */
export function isNode(): boolean {
  return detectRuntime() === RuntimeEnvironment.NODE;
}

/**
 * 获取运行时环境名称（用于日志）
 *
 * @returns 运行时环境名称
 */
export function getRuntimeName(): string {
  return detectRuntime();
}

/**
 * 重置缓存（仅用于测试）
 */
export function _resetRuntimeCache(): void {
  _cachedRuntime = null;
}

