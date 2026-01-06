/**
 * TodoRead 工具类型定义
 */

// 从 TodoWrite 导入共享类型
export type { TodoStatus, TodoItem } from '../TodoWrite/types.js';

/**
 * TodoRead 工具参数（无参数）
 */
export interface TodoReadArgs {
  // 无参数
}

/**
 * TodoRead 工具返回结果
 */
export interface TodoReadResult {
  /** 当前 TODO 列表 */
  todos: import('../TodoWrite/types.js').TodoItem[];
  /** 给 LLM 看的文本格式 */
  message: string;
}
