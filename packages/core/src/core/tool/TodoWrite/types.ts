/**
 * TodoWrite 工具类型定义
 */

import type { ToolResult } from '../types.js';

/**
 * TODO 任务状态
 */
export type TodoStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled';

/**
 * TODO 任务项
 */
export interface TodoItem {
  /** 唯一标识符 */
  id: string;
  /** 任务描述 */
  content: string;
  /** 任务状态 */
  status: TodoStatus;
}

/**
 * TodoWrite 工具参数
 */
export interface TodoWriteArgs {
  /** 完整的 TODO 列表（每次完整替换） */
  todos: TodoItem[];
  /** 是否合并模式（可选，默认 false 表示完整替换） */
  merge?: boolean;
}

/**
 * TodoWrite 业务数据
 */
export interface TodoWriteData {
  /** 当前 TODO 列表 */
  todos: TodoItem[];
  /** 给 LLM 看的文本格式 */
  message: string;
}

/**
 * TodoWrite 工具返回结果（统一结果接口）
 */
export type TodoWriteResult = ToolResult<TodoWriteData>;

/**
 * Unicode 图标定义（CLI 显示用）
 */
export const TODO_ICONS = {
  PENDING: '☐', // U+2610 Ballot Box - 待处理
  IN_PROGRESS: '◉', // U+25C9 Fisheye - 进行中
  COMPLETED: '☑', // U+2611 Ballot Box with Check - 已完成
  CANCELLED: '⊠', // U+22A0 Squared Times - 已取消
} as const;

/**
 * 根据状态获取图标（CLI 显示用）
 */
export function getTodoIcon(status: TodoStatus): string {
  switch (status) {
    case 'pending':
      return TODO_ICONS.PENDING;
    case 'in_progress':
      return TODO_ICONS.IN_PROGRESS;
    case 'completed':
      return TODO_ICONS.COMPLETED;
    case 'cancelled':
      return TODO_ICONS.CANCELLED;
    default:
      return TODO_ICONS.PENDING;
  }
}

/**
 * 状态中文映射
 */
const STATUS_LABELS: Record<TodoStatus, string> = {
  pending: '待处理',
  in_progress: '进行中',
  completed: '已完成',
  cancelled: '已取消',
};

/**
 * 格式化 TODO 列表为文本（供 LLM 查看）
 * 格式：序号. [状态] 任务内容
 */
export function formatTodosForLLM(todos: TodoItem[]): string {
  if (todos.length === 0) {
    return '待办事项列表为空。';
  }

  const lines = todos.map((todo, index) => {
    const statusLabel = STATUS_LABELS[todo.status] || todo.status;
    return `${index + 1}. [${statusLabel}] ${todo.content}`;
  });

  return lines.join('\n');
}

/**
 * 验证 TODO 列表
 * 确保只有一个 in_progress 状态的任务
 */
export function validateTodos(todos: TodoItem[]): { valid: boolean; error?: string } {
  const inProgressCount = todos.filter((todo) => todo.status === 'in_progress').length;

  if (inProgressCount > 1) {
    return {
      valid: false,
      error: '同一时间只能有一个任务处于 "in_progress" 状态。',
    };
  }

  // 检查每个 todo 是否有必要字段
  for (const todo of todos) {
    if (!todo.id || typeof todo.id !== 'string') {
      return { valid: false, error: '每个待办事项必须有有效的 id。' };
    }
    if (!todo.content || typeof todo.content !== 'string') {
      return { valid: false, error: '每个待办事项必须有有效的 content。' };
    }
    if (!['pending', 'in_progress', 'completed', 'cancelled'].includes(todo.status)) {
      return {
        valid: false,
        error: `无效的状态 "${todo.status}"。必须是以下之一：pending、in_progress、completed、cancelled。`,
      };
    }
  }

  return { valid: true };
}

