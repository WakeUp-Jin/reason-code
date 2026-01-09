/**
 * Grep 工具定义
 *
 * 根据正则表达式模式搜索文件内容。
 *
 * 典型使用场景：
 * - 搜索特定函数或变量的使用位置
 * - 查找代码中的特定模式
 * - 定位错误消息或日志
 */

import { InternalTool } from '../types.js';
import { GrepArgs, GrepResult } from './types.js';
import { grepExecutor, renderGrepResultForAssistant } from './executors.js';

/**
 * Grep 工具定义
 */
export const GrepTool: InternalTool<GrepArgs, GrepResult> = {
  name: 'Grep',
  category: 'search',
  internal: true,
  description: '根据正则表达式模式搜索文件内容。支持递归搜索目录。返回匹配的文件路径、行号和行内容。',
  version: '1.0.0',
  parameters: {
    type: 'object',
    properties: {
      pattern: {
        type: 'string',
        description: '正则表达式搜索模式。示例：\n- "function\\s+\\w+" 匹配函数声明\n- "TODO|FIXME" 匹配待办事项\n- "import.*from" 匹配导入语句',
      },
      path: {
        type: 'string',
        description: '搜索目录路径。如果不指定，则使用当前工作目录。',
      },
      include: {
        type: 'string',
        description: '文件过滤模式。示例：\n- "*.ts" 只搜索 TypeScript 文件\n- "*.{js,jsx}" 搜索 JS 和 JSX 文件',
      },
    },
    required: ['pattern'],
  },
  handler: grepExecutor,
  renderResultForAssistant: renderGrepResultForAssistant,

  // 只读工具，不需要权限确认
  isReadOnly: () => true,

  // 只读工具不需要确认
  shouldConfirmExecute: async () => false,
};

export default GrepTool;

