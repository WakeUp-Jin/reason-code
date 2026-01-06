/**
 * TodoRead 工具定义
 * 读取 TODO 列表（内部工具，UI 不显示）
 */

import type { InternalTool } from '../types.js';
import type { TodoReadArgs, TodoReadResult } from './types.js';
import { todoReadExecutor, renderTodoReadResultForAssistant } from './executors.js';

/**
 * TodoRead 工具描述
 * 简短的使用说明
 */
const TODOREAD_DESCRIPTION = `使用此工具读取会话的当前待办事项列表。主动使用此工具来：
- 在对话开始时查看待办事项
- 在开始新任务之前确定工作优先级
- 当你不确定下一步该做什么时
- 完成任务后查看剩余工作

此工具不接受任何参数。`;

/**
 * TodoRead 工具定义
 */
export const TodoReadTool: InternalTool<TodoReadArgs, TodoReadResult> = {
  name: 'TodoRead',
  category: 'task_management',
  internal: true, // 内部工具，UI 不显示
  description: TODOREAD_DESCRIPTION,
  version: '1.0.0',
  parameters: {
    type: 'object',
    properties: {},
    required: [],
  },
  handler: todoReadExecutor,
  renderResultForAssistant: renderTodoReadResultForAssistant,

  // 权限控制
  isReadOnly: () => true,
  isConcurrencySafe: () => true,
  needsPermissions: () => false,
};
