/**
 * 工具模块统一导出
 */

// 类型定义
export * from './types.js';

// Allowlist 类
export { Allowlist } from './Allowlist.js';

// 工具管理器
export { ToolManager } from './ToolManager.js';

// 工具调度器
export { ToolScheduler } from './ToolScheduler.js';
export type { ToolSchedulerConfig, ScheduleResult } from './ToolScheduler.js';

// 具体工具
export { ListFilesTool } from './ListFiles/definitions.js';
export type { ListFilesArgs, ListFilesResult } from './ListFiles/executors.js';

export { ReadFileTool } from './ReadFile/definitions.js';
export type { ReadFileArgs, ReadFileResult } from './ReadFile/executors.js';

export { WriteFileTool } from './WriteFile/definitions.js';
export type { WriteFileArgs, WriteFileResult } from './WriteFile/executors.js';

// TodoWrite 工具
export { TodoWriteTool } from './TodoWrite/definitions.js';
export type { TodoStatus, TodoItem, TodoWriteArgs, TodoWriteResult } from './TodoWrite/types.js';
export { TODO_ICONS, getTodoIcon, formatTodosForLLM, validateTodos } from './TodoWrite/types.js';
export { getTodos, setTodos, clearTodos } from './TodoWrite/executors.js';

// TodoRead 工具
export { TodoReadTool } from './TodoRead/definitions.js';
export type { TodoReadArgs, TodoReadResult } from './TodoRead/types.js';

// Glob 工具（文件路径搜索）
export { GlobTool } from './Glob/definitions.js';
export type { GlobArgs, GlobResult, GlobFileItem, GlobStrategy } from './Glob/types.js';
export { globExecutor, renderGlobResultForAssistant, getGlobSummary } from './Glob/executors.js';

// Grep 工具（文件内容搜索）
export { GrepTool } from './Grep/definitions.js';
export type { GrepArgs, GrepResult, GrepMatch, GrepStrategy } from './Grep/types.js';
export { grepExecutor, renderGrepResultForAssistant, getGrepSummary } from './Grep/executors.js';

// 搜索工具辅助模块
export { Ripgrep } from './utils/ripgrep.js';
export { detectRuntime, isBun, isNode, getRuntimeName, RuntimeEnvironment } from './utils/runtime.js';
export {
  canUseRipgrep,
  canUseGitGrep,
  canUseSystemGrep,
  isGitRepository,
  getToolAvailability,
} from './utils/tool-detection.js';
