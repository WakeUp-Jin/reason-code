/**
 * Glob 工具定义
 *
 * 根据文件名模式搜索文件路径，不涉及文件内容。
 *
 * 典型使用场景：
 * - 查找所有 TypeScript 文件
 * - 定位特定命名规范的文件
 * - 快速浏览项目文件结构
 */

import { InternalTool } from '../types.js';
import { GlobArgs, GlobResult } from './types.js';
import { globExecutor, renderGlobResultForAssistant } from './executors.js';

/**
 * Glob 工具定义
 */
export const GlobTool: InternalTool<GlobArgs, GlobResult> = {
  name: 'Glob',
  category: 'search',
  internal: true,
  description: '根据文件名模式搜索文件路径。支持 glob 模式如 "*.ts"、"**/*.test.js"。只搜索文件名/路径，不读取文件内容。',
  version: '1.0.0',
  parameters: {
    type: 'object',
    properties: {
      pattern: {
        type: 'string',
        description: 'Glob 匹配模式。示例：\n- "*.ts" 匹配当前目录的 .ts 文件\n- "**/*.ts" 递归匹配所有 .ts 文件\n- "**/*.{ts,tsx}" 匹配 .ts 和 .tsx 文件\n- "**/[A-Z]*.tsx" 匹配以大写字母开头的 .tsx 文件',
      },
      path: {
        type: 'string',
        description: '搜索目录路径。如果不指定，则使用当前工作目录。',
      },
    },
    required: ['pattern'],
  },
  handler: globExecutor,
  renderResultForAssistant: renderGlobResultForAssistant,

  // 只读工具，不需要权限确认
  isReadOnly: () => true,

  // 只读工具不需要确认
  shouldConfirmExecute: async () => false,
};

export default GlobTool;

