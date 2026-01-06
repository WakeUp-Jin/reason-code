/**
 * TodoWrite 工具定义
 * 写入/更新 TODO 列表（显示给用户）
 */

import type { InternalTool } from '../types.js';
import type { TodoWriteArgs, TodoWriteResult } from './types.js';
import { todoWriteExecutor, renderTodoWriteResultForAssistant } from './executors.js';

/**
 * TodoWrite 工具描述
 * 详细的使用指导，帮助 LLM 正确使用此工具
 */
const TODOWRITE_DESCRIPTION = `使用此工具为当前编码会话创建和管理结构化任务列表。这有助于跟踪进度、组织复杂任务，并向用户展示你的工作计划。

## 何时使用此工具

在以下场景中主动使用此工具：

1. 复杂的多步骤任务 - 当任务需要 3 个或更多不同的步骤时
2. 非平凡的复杂任务 - 需要仔细规划或多个操作的任务
3. 用户明确请求 todo 列表 - 当用户直接要求你使用 todo 列表时
4. 用户提供多个任务 - 当用户提供需要完成的事项列表时
5. 收到新指令后 - 立即将用户需求捕获为 todos
6. 完成任务后 - 标记为完成并添加任何新的后续任务
7. 开始处理新任务时 - 将 todo 标记为 in_progress。同一时间只应有一个 todo 处于 in_progress 状态。

## 何时不使用此工具

以下情况跳过使用此工具：
1. 只有一个简单直接的任务
2. 任务微不足道（少于 3 个步骤）
3. 任务纯粹是对话或信息性的

## 任务状态

- pending（待处理）：任务尚未开始
- in_progress（进行中）：当前正在处理（一次限制一个任务）
- completed（已完成）：任务成功完成
- cancelled（已取消）：任务不再需要

## 使用方法论

1. 收到复杂请求后立即创建 todo 列表
2. 在开始处理子任务之前，将其标记为 in_progress
3. 在执行过程中更新列表 - 它不是静态的
4. 完成后立即标记任务为 completed（不要批量处理）
5. 取消变得无关的任务

## 重要规则

- 同一时间只能有一个任务处于 in_progress 状态
- 在开始新任务之前完成现有任务
- 在工作时实时更新状态`;

/**
 * TodoWrite 工具定义
 */
export const TodoWriteTool: InternalTool<TodoWriteArgs, TodoWriteResult> = {
  name: 'TodoWrite',
  category: 'task_management',
  internal: false, // 显示给用户
  description: TODOWRITE_DESCRIPTION,
  version: '1.0.0',
  parameters: {
    type: 'object',
    properties: {
      todos: {
        type: 'array',
        description: '完整的待办事项列表。每个项目必须包含 id、content 和 status。',
        items: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: '待办事项的唯一标识符',
            },
            content: {
              type: 'string',
              description: '任务的简短描述（建议最多 70 个字符）',
            },
            status: {
              type: 'string',
              description:
                '任务状态：pending（待处理）、in_progress（进行中）、completed（已完成）或 cancelled（已取消）',
              enum: ['pending', 'in_progress', 'completed', 'cancelled'],
            },
          },
          required: ['id', 'content', 'status'],
        },
      },
      merge: {
        type: 'boolean',
        description:
          '如果为 true，则根据 id 与现有待办事项合并。如果为 false（默认），则替换整个列表。',
        default: false,
      },
    },
    required: ['todos'],
  },
  handler: todoWriteExecutor,
  renderResultForAssistant: renderTodoWriteResultForAssistant,

  // 权限控制
  isReadOnly: () => true,
  isConcurrencySafe: () => true,
  needsPermissions: () => false,
};
