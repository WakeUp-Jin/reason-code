/**
 * 批量读取文件工具 - 定义
 * 支持直接路径列表或 glob 模式匹配
 */

import { InternalTool } from '../types.js';
import { readManyFilesExecutor, renderResultForAssistant } from './executors.js';
import type { ReadManyFilesArgs, ReadManyFilesResult } from './executors.js';

export const ReadManyFilesTool: InternalTool<ReadManyFilesArgs, ReadManyFilesResult> = {
  name: 'ReadManyFiles',
  category: 'filesystem',
  internal: true,
  description: `批量读取多个文件内容。支持直接路径列表或 glob 模式匹配。
  
使用场景：
- 需要同时查看多个相关文件时
- 按模式批量读取文件（如 src/**/*.ts）
- 比多次调用 ReadFile 更高效

注意：
- 单个文件超过大小限制会被截断
- 总输出有字符数限制，超出时会省略部分文件
- 错误的路径会被记录但不会中断整体执行`,
  version: '1.0.0',
  parameters: {
    type: 'object',
    properties: {
      paths: {
        type: 'array',
        items: { type: 'string' },
        description: '文件路径列表，支持 glob 模式（如 src/**/*.ts、*.json）',
      },
      include: {
        type: 'array',
        items: { type: 'string' },
        description: '包含的文件模式（可选，用于过滤 glob 结果）',
      },
      exclude: {
        type: 'array',
        items: { type: 'string' },
        description: '排除的文件模式（可选，如 node_modules、*.test.ts）',
      },
    },
    required: ['paths'],
  },
  handler: readManyFilesExecutor,
  renderResultForAssistant: renderResultForAssistant,

  // 只读工具，不需要权限确认
  isReadOnly: () => true,

  // 只读工具不需要确认
  shouldConfirmExecute: async () => false,
};

