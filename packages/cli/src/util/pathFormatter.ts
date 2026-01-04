/**
 * CLI 层的路径格式化工具
 * 负责将绝对路径转换为用户友好的显示格式
 */

import path from 'node:path';

/**
 * 将绝对路径格式化为用户友好的显示格式
 *
 * 规则：
 * - 如果路径在工作目录内 → 显示完整的相对路径
 * - 如果路径在工作目录外 → 显示完整的绝对路径（不省略）
 *
 * @param absolutePath - 绝对路径
 * @param cwd - 用户工作目录，默认为 process.cwd()
 * @returns 格式化后的路径
 *
 * @example
 * ```typescript
 * // 工作目录：/Users/xjk/Desktop/ScriptCode/reason-cli
 *
 * // 路径在工作目录内 → 显示相对路径
 * formatPathForDisplay('/Users/xjk/Desktop/ScriptCode/reason-cli/packages/core/src/index.ts')
 * // => 'packages/core/src/index.ts'
 *
 * // 路径在工作目录外 → 显示绝对路径
 * formatPathForDisplay('/Users/xjk/Desktop/ScriptCode/other-project/file.js')
 * // => '/Users/xjk/Desktop/ScriptCode/other-project/file.js'
 *
 * // 当前目录
 * formatPathForDisplay('/Users/xjk/Desktop/ScriptCode/reason-cli')
 * // => '.'
 * ```
 */
export function formatPathForDisplay(
  absolutePath: string,
  cwd: string = process.cwd()
): string {
  // 规范化路径
  const normalizedPath = path.normalize(absolutePath);
  const normalizedCwd = path.normalize(cwd);

  // 计算相对路径
  const relativePath = path.relative(normalizedCwd, normalizedPath);

  // 如果相对路径为空，说明是当前目录
  if (relativePath === '') {
    return '.';
  }

  // 如果相对路径以 .. 开头或是绝对路径，说明不在工作目录内
  // 根据用户要求：显示完整的绝对路径（不省略）
  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    return normalizedPath;
  }

  // 否则，显示完整的相对路径
  return relativePath;
}

/**
 * 格式化工具参数摘要中的路径
 * 根据工具类型判断是否需要格式化路径
 *
 * @param toolName - 工具名称
 * @param summary - 参数摘要（可能包含路径）
 * @param cwd - 用户工作目录
 * @returns 格式化后的摘要
 */
export function formatToolSummary(
  toolName: string,
  summary: string,
  cwd?: string
): string {
  // 如果摘要为空，直接返回
  if (!summary) {
    return summary;
  }

  // 文件路径相关的工具：需要格式化路径
  const pathTools = ['Read', 'ReadFile', 'Write', 'WriteFile', 'Edit', 'ListFiles'];

  if (pathTools.includes(toolName)) {
    return formatPathForDisplay(summary, cwd);
  }

  // 其他工具：直接返回原始摘要
  return summary;
}
