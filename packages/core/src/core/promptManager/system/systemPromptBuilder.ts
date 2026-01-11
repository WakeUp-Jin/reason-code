/**
 * 系统提示词构建器
 * Core 层完全负责组装系统提示词，CLI 只传递动态参数
 */

import {
  ROLE_DEFINITION,
  CORE_CAPABILITIES,
  TOOL_USAGE_GUIDE,
  OUTPUT_STYLE_CONSTRAINTS,
  INSIGHT_FORMAT_GUIDE,
} from './agentPrompts.js';

/**
 * 系统提示词上下文（由 CLI 传入的动态参数）
 */
export interface SystemPromptContext {
  /** 工作目录 */
  workingDirectory: string;
  /** 模型名称 */
  modelName: string;
  /** 操作系统信息 */
  osInfo?: string;
  /** 当前日期 */
  currentDate?: string;
}

/**
 * 构建环境信息部分
 */
function buildEnvironmentInfo(context: SystemPromptContext): string {
  const lines = ['## 环境信息'];

  lines.push(`- 工作目录：${context.workingDirectory}`);
  lines.push(`- 当前模型：${context.modelName}`);

  if (context.osInfo) {
    lines.push(`- 操作系统：${context.osInfo}`);
  }

  if (context.currentDate) {
    lines.push(`- 当前日期：${context.currentDate}`);
  }

  return lines.join('\n');
}

/**
 * 构建完整的系统提示词
 *
 * @param context - 动态上下文参数
 * @returns 完整的系统提示词字符串
 */
export function buildSystemPrompt(context: SystemPromptContext): string {
  const sections = [
    ROLE_DEFINITION,
    CORE_CAPABILITIES,
    TOOL_USAGE_GUIDE,
    OUTPUT_STYLE_CONSTRAINTS,
    INSIGHT_FORMAT_GUIDE,
    buildEnvironmentInfo(context),
  ];

  return sections.filter(Boolean).join('\n\n');
}

/**
 * 构建简化版系统提示词（不含教育性洞察）
 *
 * @param context - 动态上下文参数
 * @returns 简化版系统提示词字符串
 */
export function buildSimpleSystemPrompt(context: SystemPromptContext): string {
  const sections = [
    ROLE_DEFINITION,
    CORE_CAPABILITIES,
    TOOL_USAGE_GUIDE,
    OUTPUT_STYLE_CONSTRAINTS,
    buildEnvironmentInfo(context),
  ];

  return sections.filter(Boolean).join('\n\n');
}

