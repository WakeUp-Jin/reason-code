/**
 * TodoRead 工具执行器
 */

import type { TodoReadArgs, TodoReadResult } from './types.js';
import type { InternalToolContext } from '../types.js';
import { getTodos } from '../TodoWrite/executors.js';
import { formatTodosForLLM } from '../TodoWrite/types.js';

/**
 * TodoRead 工具执行器
 * 读取当前 TODO 列表
 */
export async function todoReadExecutor(
  _args: TodoReadArgs,
  context?: InternalToolContext
): Promise<TodoReadResult> {
  const sessionId = context?.sessionId || 'default';
  const todos = getTodos(sessionId);

  const formattedList = formatTodosForLLM(todos);
  const pendingCount = todos.filter(
    (t) => t.status !== 'completed' && t.status !== 'cancelled'
  ).length;

  return {
    todos,
    message:
      todos.length === 0
        ? '待办事项列表为空。'
        : `当前待办事项列表（剩余 ${pendingCount} 个任务）：\n${formattedList}`,
  };
}

/**
 * TodoRead 结果格式化（给 AI 看）
 */
export function renderTodoReadResultForAssistant(result: TodoReadResult): string {
  return result.message;
}
