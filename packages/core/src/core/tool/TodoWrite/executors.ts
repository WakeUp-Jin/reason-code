/**
 * TodoWrite 工具执行器
 */

import {
  TodoItem,
  TodoWriteArgs,
  TodoWriteResult,
  formatTodosForLLM,
  validateTodos,
} from './types.js';
import type { InternalToolContext } from '../types.js';

/**
 * 会话级 TODO 存储
 * 使用 Map 按 sessionId 隔离存储
 */
const todoStore = new Map<string, TodoItem[]>();

/**
 * 获取会话的 TODO 列表
 */
export function getTodos(sessionId: string): TodoItem[] {
  return todoStore.get(sessionId) || [];
}

/**
 * 设置会话的 TODO 列表
 */
export function setTodos(sessionId: string, todos: TodoItem[]): void {
  todoStore.set(sessionId, todos);
}

/**
 * 清空会话的 TODO 列表
 */
export function clearTodos(sessionId: string): void {
  todoStore.delete(sessionId);
}

/**
 * TodoWrite 工具执行器
 * 写入/更新 TODO 列表
 */
export async function todoWriteExecutor(
  args: TodoWriteArgs,
  context?: InternalToolContext
): Promise<TodoWriteResult> {
  const sessionId = context?.sessionId || 'default';
  const { todos, merge = false } = args;

  // 验证 TODO 列表
  const validation = validateTodos(todos);
  if (!validation.valid) {
    const currentTodos = getTodos(sessionId);
    const formattedList = formatTodosForLLM(currentTodos);
    return {
      success: false,
      error: validation.error,
      data: {
        todos: currentTodos,
        message: `错误：${validation.error}\n\n当前列表：\n${formattedList}`,
      },
    };
  }

  let finalTodos: TodoItem[];

  if (merge) {
    // 合并模式：根据 id 更新现有项或添加新项
    const existingTodos = getTodos(sessionId);
    const todoMap = new Map(existingTodos.map((t) => [t.id, t]));

    for (const todo of todos) {
      todoMap.set(todo.id, todo);
    }

    finalTodos = Array.from(todoMap.values());
  } else {
    // 替换模式：完整替换整个列表
    finalTodos = todos;
  }

  // 保存到存储
  setTodos(sessionId, finalTodos);

  // 格式化输出
  const formattedList = formatTodosForLLM(finalTodos);
  const pendingCount = finalTodos.filter(
    (t) => t.status !== 'completed' && t.status !== 'cancelled'
  ).length;

  return {
    success: true,
    data: {
      todos: finalTodos,
      message: `已成功更新待办事项列表。剩余 ${pendingCount} 个任务。\n\n当前列表：\n${formattedList}`,
    },
  };
}

/**
 * TodoWrite 结果格式化（给 AI 看）
 */
export function renderTodoWriteResultForAssistant(result: TodoWriteResult): string {
  if (!result.success) {
    return `错误: ${result.error}`;
  }
  return result.data?.message || '';
}

