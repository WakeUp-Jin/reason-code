/**
 * 执行流展示常量定义
 */

import type { ThemeColors } from '../../context/theme.js';
import { ToolCallStatus } from '@reason-cli/core';

/**
 * 工具状态图标
 */
export const TOOL_ICONS = {
  PENDING: '○',      // 空心圆 - 等待执行
  EXECUTING: '●',    // 实心圆 - 执行中（配合 Spinner）
  SUCCESS: '●',      // 实心圆 - 成功（绿色）
  ERROR: '●',        // 实心圆 - 失败（红色）
  CANCELLED: '○',    // 空心圆 - 已取消
} as const;

/**
 * 状态对应主题颜色键
 */
export const TOOL_STATUS_THEME_COLORS: Record<ToolCallStatus, keyof ThemeColors> = {
  [ToolCallStatus.Pending]: 'textMuted',
  [ToolCallStatus.Executing]: 'textMuted',
  [ToolCallStatus.Success]: 'success',
  [ToolCallStatus.Error]: 'error',
  [ToolCallStatus.Cancelled]: 'textMuted',
};

/**
 * 状态短语池（与 Core 层保持一致）
 */
export const STATUS_PHRASES = [
  'Thinking...',
  'Analyzing...',
  'Processing...',
  'Reasoning...',
  'Deciphering...',
  'Elucidating...',
  'Crunching...',
  'Computing...',
] as const;

/**
 * Tip 提示池
 */
export const TIPS = [
  'Press ctrl+t to show thinking process',
  'Press ctrl+d to hide/show todos',
  'Press esc to interrupt',
  'Hit shift+tab to cycle modes',
] as const;
