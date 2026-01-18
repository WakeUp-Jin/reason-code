/**
 * Core层会话管理类型定义
 */

export interface Session {
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

/**
 * 存储抽象接口，支持不同平台的存储实现
 */
export interface SessionStorage {
  save(session: Session): Promise<void>;
  load(sessionId: string): Promise<Session | null>;
  loadAll(): Promise<Session[]>;
  delete(sessionId: string): Promise<boolean>;
  exists(sessionId: string): Promise<boolean>;
}
