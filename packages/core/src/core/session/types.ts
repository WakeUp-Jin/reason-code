/**
 * Core层会话管理类型定义
 */

/**
 * 会话元数据
 *
 * 📌 命名说明：
 * - 使用 SessionMetadata 而不是 Session，避免与命名空间冲突
 * - Session 命名空间提供 CRUD API（Session.create, Session.get 等）
 *
 * 📌 子会话支持：
 * - parentId: 父会话 ID（子会话专用）
 * - agentName: 使用的代理名称（如 "explore", "general"）
 * - isSubSession: 是否为子会话（便于过滤）
 */
export interface SessionMetadata {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;

  // 子代理会话相关字段
  parentId?: string; // 父会话 ID（子会话专用）
  agentName?: string; // 使用的代理名称（如 "explore", "general"）
  isSubSession?: boolean; // 是否为子会话（便于过滤）
}

export interface CreateSessionOptions {
  title?: string;
  parentId?: string; // 如果有，则为子会话
  agentName?: string; // 使用的代理配置名
}

export interface GetChildSessionsOptions {
  parentId: string;
}

export interface GetOrCreateSubSessionOptions {
  sessionId?: string; // 可选：复用现有会话
  parentId: string;
  agentName: string;
  title?: string;
}

// ============================================================
// 消息类型（持久化）
// ============================================================

/**
 * 存储的消息类型（持久化到磁盘）
 *
 * 📌 设计原则：
 * - 使用 Record<string, any> 保证跨平台兼容性
 * - 不同平台（CLI/Web/Desktop）可以定义自己的运行时类型
 * - 通过转换函数进行类型转换（如 CLI 的 filterForStorage/restoreFromStorage）
 *
 * 📌 与平台类型的关系：
 * - CLI Message: packages/cli/src/context/store.tsx
 *   - 扩展字段: isStreaming（运行时状态，不持久化）
 *   - 具体类型: MessageMetadata, ToolCallInfo（类型安全）
 *   - 转换函数: filterForStorage / restoreFromStorage
 *
 * 📌 为什么不使用继承？
 * - TypeScript 不允许子类型收窄父类型（any → 具体类型）
 * - 保持各平台的类型安全和灵活性
 * - 职责分离：Core 负责通用存储，平台层负责类型安全
 */
export interface StoredMessage {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant' | 'tool' | 'thinking';
  content: string;
  timestamp: number;

  /** 消息元数据（token 使用、成本等） - 使用 any 保证跨平台兼容 */
  metadata?: Record<string, any>;

  /** 工具调用信息（仅 role='tool' 时有） - 使用 any 保证跨平台兼容 */
  toolCall?: Record<string, any>;

  /** 工具调用列表（仅 role='assistant' 时有，用于历史加载） */
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: {
      name: string;
      arguments: string;
    };
  }>;

  /** API 标准字段（仅 role='tool' 时有） */
  tool_call_id?: string;
  name?: string;
}

// ============================================================
// 检查点类型
// ============================================================

/**
 * 会话检查点（用于压缩历史消息）
 */
export interface SessionCheckpoint {
  /** 压缩生成的摘要 */
  summary: string;
  /** 从这个消息 ID 之后开始加载 */
  loadAfterMessageId: string;
  /** 压缩时间戳 */
  compressedAt: number;
  /** 累计统计 */
  stats: {
    /** 累计费用（CNY） */
    totalCost: number;
  };
}

// ============================================================
// 完整会话数据
// ============================================================

/**
 * 完整会话数据（SessionMetadata + Messages + Checkpoint）
 */
export interface SessionData {
  session: SessionMetadata;
  messages: StoredMessage[];
  checkpoint?: SessionCheckpoint;
}

// ============================================================
// 存储接口
// ============================================================

/**
 * 存储抽象接口，支持不同平台的存储实现
 */
export interface SessionStorage {
  // ===== Session 管理 =====
  save(session: SessionMetadata): Promise<void>;
  load(sessionId: string): Promise<SessionMetadata | null>;
  loadAll(): Promise<SessionMetadata[]>;
  delete(sessionId: string): Promise<boolean>;
  exists(sessionId: string): Promise<boolean>;

  // ===== Message 管理（JSONL 格式）=====
  /** 保存所有消息（完整重写） */
  saveMessages(sessionId: string, messages: StoredMessage[]): Promise<void>;
  /** 加载所有消息 */
  loadMessages(sessionId: string): Promise<StoredMessage[]>;

  // ===== Checkpoint 管理 =====
  /** 保存检查点 */
  saveCheckpoint(sessionId: string, checkpoint: SessionCheckpoint): Promise<void>;
  /** 加载检查点 */
  loadCheckpoint(sessionId: string): Promise<SessionCheckpoint | null>;
  /** 删除检查点 */
  deleteCheckpoint(sessionId: string): Promise<boolean>;

  // ===== 原子操作 =====
  /** 保存完整会话数据 */
  saveSessionData(data: SessionData): Promise<void>;
  /** 加载完整会话数据 */
  loadSessionData(sessionId: string): Promise<SessionData | null>;
}
