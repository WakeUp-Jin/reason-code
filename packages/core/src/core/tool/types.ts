/**
 * 工具定义类型约束
 * 用于定义所有工具的统一结构,便于格式化并作为提示词传给大模型
 */

import { Allowlist } from './Allowlist.js';

// ============================================================
// 统一工具结果接口
// ============================================================

/**
 * 统一工具结果接口
 * @template T - 工具业务数据类型
 */
export interface ToolResult<T = unknown> {
  /** 执行是否成功 */
  success: boolean;
  /** 失败时的错误信息（简单字符串） */
  error?: string;
  /** 警告信息（如策略降级） */
  warning?: string;
  /** 工具业务数据，失败时为 null */
  data: T | null;
}

/**
 * JSON Schema 参数定义
 */
export interface ToolParameterSchema {
  type: 'object' | 'array' | 'string' | 'number' | 'boolean';
  description?: string;
  properties?: Record<string, ToolParameterSchema>;
  items?: ToolParameterSchema;
  required?: string[];
  enum?: string[];
  default?: any;
}

// ============================================================
// 工具权限验证系统类型定义
// ============================================================

/**
 * 批准模式枚举
 * 控制工具执行前的确认行为
 */
export enum ApprovalMode {
  /** 默认模式：写入工具需要确认 */
  DEFAULT = 'default',
  /** 自动编辑模式：编辑类工具自动批准 */
  AUTO_EDIT = 'autoEdit',
  /** YOLO 模式：所有工具自动批准（危险） */
  YOLO = 'yolo',
}

/**
 * 确认结果类型
 */
export type ConfirmOutcome = 'once' | 'always' | 'cancel';

/**
 * 确认详情接口
 * 当工具需要用户确认时返回此对象
 */
export interface ConfirmDetails {
  /** 确认类型：info=写入新文件, edit=编辑文件, exec=执行命令 */
  type: 'edit' | 'exec' | 'info';
  /** 面板标题（如 "Overwrite file", "Edit file", "Bash command"） */
  panelTitle?: string;
  /** 文件路径（显示在顶部标题栏） */
  filePath?: string;
  /** 文件名（Write 组件边框内第一行显示，如 "test.js"） */
  fileName?: string;
  /** 内容预览 */
  contentPreview?: string;
  /** 命令（exec 类型） */
  command?: string;
  /** 额外描述信息 */
  message?: string;
  /** 确认回调 */
  onConfirm?: (outcome: ConfirmOutcome) => Promise<void>;
}

/**
 * 调度器工具调用状态
 */
export type SchedulerToolCallStatus =
  | 'validating'
  | 'scheduled'
  | 'awaiting_approval'
  | 'executing'
  | 'success'
  | 'error'
  | 'cancelled';

/**
 * 调度器工具调用请求信息
 */
export interface SchedulerToolCallRequest {
  /** 调用 ID */
  callId: string;
  /** 工具名称 */
  toolName: string;
  /** 工具参数（已解析，可选） */
  args?: Record<string, any>;
  /** 原始参数字符串（可选，用于内部解析） */
  rawArgs?: string;
  /** 工具分类 */
  toolCategory?: string;
  /** 参数摘要（用于显示） */
  paramsSummary?: string;
  /** LLM 思考内容（第一个工具调用时传递） */
  thinkingContent?: string;
}

/**
 * 调度器工具调用状态记录
 */
export interface SchedulerToolCallRecord {
  /** 调用请求 */
  request: SchedulerToolCallRequest;
  /** 当前状态 */
  status: SchedulerToolCallStatus;
  /** 开始时间 */
  startTime?: number;
  /** 确认详情（等待确认时） */
  confirmDetails?: ConfirmDetails;
  /** 执行结果（成功时） */
  result?: any;
  /** 错误信息（失败时） */
  error?: string;
  /** 执行时长（毫秒） */
  durationMs?: number;
}

/**
 * 工具上下文
 */
export interface InternalToolContext {
  abortSignal?: AbortSignal;
  cwd?: string;
  sessionId?: string;
  executionStream?: any;
  approvalMode?: ApprovalMode;
  onConfirmRequired?: (
    callId: string,
    toolName: string,
    details: ConfirmDetails
  ) => Promise<ConfirmOutcome>;
  callId?: string;
  /** 工作目录（用于子代理继承父代理的工作目录） */
  workingDirectory?: string;
  [key: string]: any; // 扩展字段
}

/**
 * 工具定义基础接口
 */
export interface InternalTool<TArgs = any, TResult = any> {
  /** 工具名称(唯一标识) */
  name: string;

  /** 工具分类(如 filesystem、search、network) */
  category: string;

  /** 是否为内部工具 */
  internal: boolean;

  /** 工具描述(简短,详细描述在 prompt 中) */
  description: string;

  /** 版本号 */
  version: string;

  /** 参数定义(JSON Schema 格式) */
  parameters: ToolParameterSchema;

  /** 工具处理函数 */
  handler: (args: TArgs, context?: InternalToolContext) => Promise<TResult>;

  /** 可选:格式化结果给 AI */
  renderResultForAssistant?: (result: TResult) => string;

  /** 可选:权限控制 */
  needsPermissions?: (input?: TArgs) => boolean; // 是否需要权限
  isEnabled?: () => Promise<boolean>; // 是否启用
  isReadOnly?: () => boolean; // 是否只读
  isConcurrencySafe?: () => boolean; // 是否并发安全

  /**
   * 检查是否需要用户确认执行
   * @param args - 工具参数
   * @param approvalMode - 当前批准模式
   * @param context - 工具上下文
   * @param allowlist - 会话级白名单，用于存储已批准的操作
   * @returns false 表示不需要确认，ConfirmDetails 表示需要确认
   */
  shouldConfirmExecute?: (
    args: TArgs,
    approvalMode: ApprovalMode,
    context?: InternalToolContext,
    allowlist?: Allowlist
  ) => Promise<ConfirmDetails | false>;
}

// 重新导出 Allowlist 类型，方便外部使用
export type { Allowlist };

/**
 * 格式化工具定义为大模型可读格式
 */
export interface FormattedToolDefinition {
  name: string;
  category: string;
  description: string;
  version: string;
  parameters: ToolParameterSchema;
}

/**
 * 将工具定义格式化为大模型输入格式
 */
export function formatToolForLLM(tool: InternalTool): FormattedToolDefinition {
  return {
    name: tool.name,
    category: tool.category,
    description: tool.description,
    version: tool.version,
    parameters: tool.parameters,
  };
}
