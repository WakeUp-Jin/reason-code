import React, { createContext, useContext, type ReactNode } from 'react';
import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import { ToolCallStatus } from '@reason-cli/core';
import { Session, type SessionMetadata } from '@reason-code/core';

// Token 使用情况
export interface TokenUsage {
  inputTokens: number; // 输入 token 数（prompt_tokens）
  outputTokens: number; // 输出 token 数（completion_tokens）
  totalTokens: number; // 总 token 数
  cacheHitTokens?: number; // 缓存命中 token 数（DeepSeek）
  cacheMissTokens?: number; // 缓存未命中 token 数（DeepSeek）
  reasoningTokens?: number; // 推理 token 数（已包含在 outputTokens 中）
}

// 消息元数据
export interface MessageMetadata {
  // Token 信息（仅 assistant 消息有）
  tokenUsage?: TokenUsage;

  // 模型信息
  model?: string;

  // 成本信息（可选）- 单次费用（CNY）
  cost?: number;

  // 生成信息（可选）
  generationInfo?: {
    temperature?: number; // 温度参数
    maxTokens?: number; // 最大 token 数
    stopReason?: string; // 停止原因
    latency?: number; // 响应延迟（ms）
  };

  // 其他自定义字段
  [key: string]: any;
}

// 消息角色类型
export type MessageRole = 'user' | 'assistant' | 'tool' | 'thinking';

// ✅ 导入 Core 层完整定义（包含 pending、executing、success、error、cancelled）
export type { ToolCallStatus };

// 工具调用信息（tool 消息专用）
export interface ToolCallInfo {
  toolName: string;
  toolCategory: string;
  params: Record<string, any>;
  paramsSummary: string;
  status: ToolCallStatus;
  resultSummary?: string;
  duration?: number;
  error?: string;
  // 工具调用前的思考内容（LLM 在调用工具前的 content）
  thinkingContent?: string;

  // 子代理工具调用摘要（仅 task 工具）
  subAgentSummary?: Array<{
    id: string;
    tool: string;
    status: 'running' | 'completed' | 'error';
    title?: string;
  }>;
}

/**
 * CLI 运行时消息类型
 *
 * 📌 与 Core StoredMessage 的关系：
 * - 结构兼容（鸭子类型），但不继承
 * - 保存时：通过 filterForStorage() 转换为 StoredMessage
 * - 加载时：通过 restoreFromStorage() 从 StoredMessage 恢复
 *
 * 📌 CLI 专用扩展：
 * - isStreaming: 流式输出状态（运行时字段，不持久化）
 * - metadata: 类型安全的元数据（MessageMetadata）
 * - toolCall: 类型安全的工具调用信息（ToolCallInfo）
 *
 * 📌 为什么不继承 StoredMessage？
 * - TypeScript 不允许子类型收窄父类型（metadata: any → MessageMetadata）
 * - 保持 CLI 层的类型安全
 * - 职责分离：Core 负责通用存储，CLI 负责特定平台
 *
 * @see Core StoredMessage: packages/core/src/core/session/types.ts
 * @see 转换函数: packages/cli/src/util/messageUtils.ts
 */
export interface Message {
  id: string;
  sessionId: string;
  role: MessageRole;
  content: string;
  timestamp: number;

  /** 流式输出状态（CLI 专用，不持久化） */
  isStreaming?: boolean;

  /** 消息元数据（类型安全） */
  metadata?: MessageMetadata;

  /** 工具调用信息（类型安全） */
  toolCall?: ToolCallInfo;

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

// 消息更新类型（支持 toolCall 部分更新）
export interface MessageUpdate extends Omit<Partial<Message>, 'toolCall'> {
  toolCall?: Partial<ToolCallInfo>;
}

// ============ Notice 类型（仅内存，不持久化） ============

/**
 * Notice 类型枚举
 */
export type NoticeType = 'compression-pending' | 'compression-complete';

/**
 * 压缩通知数据
 */
export interface CompressionNoticeData {
  /** 是否正在进行中 */
  isPending: boolean;
  /** Token 使用情况（pending 时显示） */
  tokenUsage?: string;
  /** 原始 token 数 */
  originalTokens?: number;
  /** 压缩后 token 数 */
  compressedTokens?: number;
  /** 原始消息数 */
  originalCount?: number;
  /** 压缩后消息数 */
  compressedCount?: number;
  /** 节省百分比 */
  savedPercentage?: number;
  /** 保留消息中的文件路径 */
  retainedFiles?: string[];
}

/**
 * 通知（仅内存显示，不持久化到磁盘）
 * 用于显示压缩检查点等系统通知
 */
export interface Notice {
  /** 唯一 ID */
  id: string;
  /** 通知类型 */
  type: NoticeType;
  /** 创建时间戳 */
  timestamp: number;
  /** 插入在哪条消息之后（用于时间线定位） */
  afterMessageId?: string;
  /** 通知数据 */
  data: CompressionNoticeData;
}

// ============ Timeline Item 类型（统一 messages 和 notices） ============

/**
 * 时间线项目类型
 * 用于统一 messages 和 notices 的渲染逻辑
 */
export type TimelineItem =
  | { type: 'message'; data: Message }
  | { type: 'notice'; data: Notice };

// Agent 类型
export interface AgentInfo {
  id: string;
  name: string;
  description: string;
}

// 货币类型
export type Currency = 'CNY' | 'USD';

// 货币配置
export interface CurrencyConfig {
  currency: Currency;
  // 汇率（CNY to USD）
  exchangeRate: number;
}

// Model 类型
export interface ModelInfo {
  id: string;
  name: string;
  provider: string;

  // Context 窗口大小（最大 token 数）
  maxTokens: number;

  // 定价（CNY per 1M tokens，默认人民币）
  pricing?: {
    input: number; // 输入价格
    output: number; // 输出价格
  };

  // 其他信息
  description?: string;
}

// 配置类型
export interface Config {
  theme: string;
  mode: 'dark' | 'light';
  currentModel: string;
  currency: Currency; // 货币类型
  exchangeRate: number; // 汇率（CNY to USD）
  approvalMode: 'default' | 'auto_edit' | 'yolo'; // 工具批准模式
}

// Store 状态类型
interface AppState {
  // Session 相关
  sessions: SessionMetadata[];
  currentSessionId: string | null;

  // Message 相关
  messages: Record<string, Message[]>;

  // Notice 相关（仅内存，不持久化）
  notices: Notice[];

  // Agent 相关
  agents: AgentInfo[];

  // Model 相关
  models: ModelInfo[];
  currentModel: string;

  // 配置
  config: Config;

  /** 当前会话累计费用（CNY） */
  sessionTotalCost: number;

  // Session Actions
  createSession: (title?: string) => Promise<SessionMetadata>;
  deleteSession: (id: string) => Promise<void>;
  renameSession: (id: string, title: string) => Promise<void>;
  switchSession: (id: string) => void;
  /** 更新会话（用于子代理会话设置 parentId 等字段） */
  updateSession: (id: string, updates: Partial<SessionMetadata>) => Promise<void>;

  // Message Actions
  addMessage: (
    sessionId: string,
    message: Omit<Message, 'id' | 'timestamp' | 'sessionId'>
  ) => Message;
  /** 在指定消息前插入新消息（用于在 assistant 占位消息前插入 tool/thinking 消息） */
  insertMessageBefore: (
    sessionId: string,
    beforeMessageId: string,
    message: Omit<Message, 'id' | 'timestamp' | 'sessionId'>
  ) => Message;
  /** 更新消息，支持深度合并 toolCall 字段 */
  updateMessage: (sessionId: string, messageId: string, updates: MessageUpdate) => void;
  appendMessageContent: (sessionId: string, messageId: string, delta: string) => void;

  // Notice Actions（仅内存）
  /** 添加通知，返回生成的 ID */
  addNotice: (notice: Omit<Notice, 'id' | 'timestamp'>) => string;
  /** 更新通知 */
  updateNotice: (id: string, updates: Partial<Omit<Notice, 'id'>>) => void;
  /** 移除通知 */
  removeNotice: (id: string) => void;
  /** 清空所有通知 */
  clearNotices: () => void;

  // Agent/Model Actions
  setCurrentModel: (modelId: string) => void;

  // Config Actions
  updateConfig: (updates: Partial<Config>) => void;
  toggleApprovalMode: () => void; // 循环切换批准模式

  /** 设置会话费用（用于初始化和更新） */
  setSessionTotalCost: (cost: number) => void;

  // Initialization from disk
  initializeFromDisk: (data: {
    sessions: SessionMetadata[];
    messages: Record<string, Message[]>;
    currentSessionId: string | null;
    currentModel: string;
    currency?: Currency;
    exchangeRate?: number;
    approvalMode?: 'default' | 'auto_edit' | 'yolo';
  }) => void;
}

// 生成唯一 ID
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

// 创建 Zustand Store
export const useAppStore = create<AppState>((set, get) => ({
  // 初始状态
  sessions: [],
  currentSessionId: null,
  messages: {},
  notices: [], // 仅内存，不持久化
  agents: [
    { id: 'default', name: 'Default Agent', description: 'General purpose AI assistant' },
    { id: 'coder', name: 'Coder', description: 'Specialized in coding tasks' },
  ],
  models: [
    {
      id: 'deepseek/deepseek-chat',
      name: 'DeepSeek Chat',
      provider: 'DeepSeek',
      maxTokens: 64_000,
      pricing: {
        input: 2.0, // ¥2.0 per 1M tokens
        output: 3.0, // ¥3.0 per 1M tokens
      },
      description: 'Fast and affordable chat model',
    },
    {
      id: 'deepseek/deepseek-reasoner',
      name: 'DeepSeek Reasoner',
      provider: 'DeepSeek',
      maxTokens: 64_000,
      pricing: {
        input: 2.0, // ¥2.0 per 1M tokens
        output: 3.0, // ¥3.0 per 1M tokens
      },
      description: 'Advanced reasoning model (R1)',
    },
    {
      id: 'claude-sonnet-4',
      name: 'Claude Sonnet 4',
      provider: 'Anthropic',
      maxTokens: 200_000,
      pricing: {
        input: 21.6, // ¥21.6 per 1M tokens
        output: 108.0, // ¥108.0 per 1M tokens
      },
      description: 'Most capable Claude model with 200K context',
    },
    {
      id: 'gpt-4o',
      name: 'GPT-4o',
      provider: 'OpenAI',
      maxTokens: 128_000,
      pricing: {
        input: 18.0, // ¥18.0 per 1M tokens
        output: 72.0, // ¥72.0 per 1M tokens
      },
      description: 'Fast and capable GPT-4 model',
    },
    {
      id: 'gemini-pro',
      name: 'Gemini Pro',
      provider: 'Google',
      maxTokens: 1_000_000,
      pricing: {
        input: 3.6, // ¥3.6 per 1M tokens
        output: 10.8, // ¥10.8 per 1M tokens
      },
      description: 'Long context Google model with 1M context',
    },
  ],
  currentModel: 'deepseek/deepseek-chat',
  sessionTotalCost: 0, // 当前会话累计费用（CNY）
  config: {
    theme: 'kanagawa',
    mode: 'dark',
    currentModel: 'deepseek/deepseek-chat',
    currency: 'CNY', // 默认人民币
    exchangeRate: 7.2, // 默认汇率 1 USD = 7.2 CNY
    approvalMode: 'default', // 默认批准模式
  },

  // Session Actions
  createSession: async (title) => {
    try {
      // 使用Core的全局Session模块
      const session = await Session.create({ title });
      
      // 更新UI状态
      set((state) => ({
        sessions: [...state.sessions, session],
        currentSessionId: session.id,
        messages: { ...state.messages, [session.id]: [] },
      }));
      
      return session;
    } catch (error) {
      console.error('Failed to create session:', error);
      // 回退到本地创建
      return createLocalSession(title);
    }
    
    function createLocalSession(title?: string): SessionMetadata {
      // 生成默认标题：使用日期时间而非简单编号
      let defaultTitle = '';
      if (!title) {
        const now = new Date();
        const month = now.getMonth() + 1;
        const day = now.getDate();
        const hour = now.getHours();
        const minute = String(now.getMinutes()).padStart(2, '0');
        defaultTitle = `${month}/${day} ${hour}:${minute}`;
      }

      const session: SessionMetadata = {
        id: generateId(),
        title: title || defaultTitle,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      set((state) => ({
        sessions: [...state.sessions, session],
        currentSessionId: session.id,
        messages: { ...state.messages, [session.id]: [] },
      }));

      return session;
    }
  },

  deleteSession: async (id) => {
    try {
      // 使用Core的全局Session模块
      await Session.remove(id);
    } catch (error) {
      console.error('Failed to delete session via Core:', error);
    }
    
    // 更新UI状态
    set((state) => {
      const { [id]: _, ...remainingMessages } = state.messages;
      const newSessions = state.sessions.filter((s) => s.id !== id);
      return {
        sessions: newSessions,
        messages: remainingMessages,
        currentSessionId:
          state.currentSessionId === id ? newSessions[0]?.id || null : state.currentSessionId,
      };
    });
  },

  renameSession: async (id, title) => {
    try {
      // 使用Core的全局Session模块
      await Session.update(id, { title });
    } catch (error) {
      console.error('Failed to rename session via Core:', error);
    }
    
    // 更新UI状态
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === id ? { ...s, title, updatedAt: Date.now() } : s
      ),
    }));
  },

  switchSession: (id) => {
    set({ currentSessionId: id });
  },

  updateSession: async (id, updates) => {
    try {
      // 使用Core的全局Session模块
      await Session.update(id, updates);
    } catch (error) {
      console.error('Failed to update session via Core:', error);
    }
    
    // 更新UI状态
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === id ? { ...s, ...updates, updatedAt: Date.now() } : s
      ),
    }));
  },

  // Message Actions
  addMessage: (sessionId, messageData) => {
    const message: Message = {
      id: generateId(),
      sessionId,
      timestamp: Date.now(),
      ...messageData,
    };

    set((state) => ({
      messages: {
        ...state.messages,
        [sessionId]: [...(state.messages[sessionId] || []), message],
      },
      sessions: state.sessions.map((s) =>
        s.id === sessionId ? { ...s, updatedAt: Date.now() } : s
      ),
    }));

    return message;
  },

  insertMessageBefore: (sessionId, beforeMessageId, messageData) => {
    const message: Message = {
      id: generateId(),
      sessionId,
      timestamp: Date.now(),
      ...messageData,
    };

    set((state) => {
      const sessionMessages = state.messages[sessionId] || [];
      const insertIndex = sessionMessages.findIndex((m) => m.id === beforeMessageId);

      // 如果找到目标消息，在其前面插入；否则追加到末尾
      const newMessages =
        insertIndex >= 0
          ? [
              ...sessionMessages.slice(0, insertIndex),
              message,
              ...sessionMessages.slice(insertIndex),
            ]
          : [...sessionMessages, message];

      return {
        messages: {
          ...state.messages,
          [sessionId]: newMessages,
        },
        sessions: state.sessions.map((s) =>
          s.id === sessionId ? { ...s, updatedAt: Date.now() } : s
        ),
      };
    });

    return message;
  },

  updateMessage: (sessionId, messageId, updates) => {
    set((state) => ({
      messages: {
        ...state.messages,
        [sessionId]: (state.messages[sessionId] || []).map((m): Message => {
          if (m.id !== messageId) return m;

          // 深度合并 toolCall 字段
          // 如果 m.toolCall 存在，合并后仍是完整的 ToolCallInfo
          const newToolCall: ToolCallInfo | undefined =
            updates.toolCall && m.toolCall
              ? { ...m.toolCall, ...updates.toolCall }
              : updates.toolCall
                ? (updates.toolCall as ToolCallInfo)
                : m.toolCall;

          // 深度合并 metadata 字段
          // 避免在多次更新时丢失 metadata 中的字段
          const newMetadata: MessageMetadata | undefined =
            updates.metadata && m.metadata
              ? { ...m.metadata, ...updates.metadata }
              : updates.metadata || m.metadata;

          return {
            ...m,
            ...updates,
            toolCall: newToolCall,
            metadata: newMetadata,
          };
        }),
      },
    }));
  },

  appendMessageContent: (sessionId, messageId, delta) => {
    set((state) => ({
      messages: {
        ...state.messages,
        [sessionId]: (state.messages[sessionId] || []).map((m) =>
          m.id === messageId ? { ...m, content: m.content + delta } : m
        ),
      },
    }));
  },

  // Notice Actions（仅内存，不持久化）
  addNotice: (notice) => {
    const id = generateId();
    const newNotice: Notice = {
      ...notice,
      id,
      timestamp: Date.now(),
    };
    set((state) => ({
      notices: [...state.notices, newNotice],
    }));
    return id;
  },

  updateNotice: (id, updates) => {
    set((state) => ({
      notices: state.notices.map((n) =>
        n.id === id ? { ...n, ...updates } : n
      ),
    }));
  },

  removeNotice: (id) => {
    set((state) => ({
      notices: state.notices.filter((n) => n.id !== id),
    }));
  },

  clearNotices: () => {
    set({ notices: [] });
  },

  // Agent/Model Actions
  setCurrentModel: (modelId) => {
    set({ currentModel: modelId });
  },

  // Config Actions
  updateConfig: (updates) => {
    set((state) => ({
      config: { ...state.config, ...updates },
    }));
  },

  // 循环切换批准模式: default → auto_edit → yolo → default
  toggleApprovalMode: () => {
    set((state) => {
      const modes: Array<'default' | 'auto_edit' | 'yolo'> = ['default', 'auto_edit', 'yolo'];
      const currentIndex = modes.indexOf(state.config.approvalMode);
      const nextIndex = (currentIndex + 1) % modes.length;
      const nextMode = modes[nextIndex];

      return {
        config: { ...state.config, approvalMode: nextMode },
      };
    });
  },

  // 设置会话费用（用于初始化和更新）
  setSessionTotalCost: (cost) => {
    set({ sessionTotalCost: cost });
  },

  // Initialization from disk
  initializeFromDisk: (data) => {
    set({
      sessions: data.sessions,
      messages: data.messages,
      currentSessionId: data.currentSessionId,
      currentModel: data.currentModel,
      config: {
        ...get().config,
        currentModel: data.currentModel,
        currency: data.currency || get().config.currency,
        exchangeRate: data.exchangeRate || get().config.exchangeRate,
        approvalMode: data.approvalMode || get().config.approvalMode,
      },
    });
  },
}));

// Context（用于 Provider 模式，虽然 Zustand 不需要，但保持一致性）
const StoreContext = createContext<typeof useAppStore | null>(null);

interface StoreProviderProps {
  children: ReactNode;
}

export function StoreProvider({ children }: StoreProviderProps) {
  return <StoreContext.Provider value={useAppStore}>{children}</StoreContext.Provider>;
}

// 导出 Hook
export function useStore<T>(selector: (state: AppState) => T): T {
  return useAppStore(selector);
}

// 便捷 Hooks
export function useCurrentSession(): SessionMetadata | null {
  return useAppStore((state) => {
    const id = state.currentSessionId;
    return id ? state.sessions.find((s) => s.id === id) || null : null;
  });
}

export function useCurrentMessages(): Message[] {
  return useAppStore((state) => {
    const id = state.currentSessionId;
    return id ? state.messages[id] || [] : [];
  });
}

export function useSessions(): SessionMetadata[] {
  return useAppStore((state) => state.sessions);
}

// 获取已完成的消息（非流式）
// 使用 useShallow 进行浅比较，避免不必要的重新渲染
export function useCompletedMessages(): Message[] {
  return useAppStore(
    useShallow((state) => {
      const id = state.currentSessionId;
      const messages = id ? state.messages[id] || [] : [];
      return messages.filter((m) => !m.isStreaming);
    })
  );
}

// 获取当前流式消息
export function useStreamingMessage(): Message | null {
  return useAppStore((state) => {
    const id = state.currentSessionId;
    const messages = id ? state.messages[id] || [] : [];
    return messages.find((m) => m.isStreaming) || null;
  });
}

// ============ Timeline Item 阻塞点逻辑 ============

/**
 * 合并 messages 和 notices 为统一的时间线
 * notices 按照 afterMessageId 插入到对应消息之后
 */
function mergeTimelineItems(messages: Message[], notices: Notice[]): TimelineItem[] {
  const items: TimelineItem[] = [];

  for (const msg of messages) {
    items.push({ type: 'message', data: msg });
    // 插入该消息之后的 notices
    const noticesAfter = notices.filter((n) => n.afterMessageId === msg.id);
    for (const notice of noticesAfter) {
      items.push({ type: 'notice', data: notice });
    }
  }

  // 处理没有 afterMessageId 的 notices（追加到末尾）
  const orphanNotices = notices.filter(
    (n) => !n.afterMessageId || !messages.find((m) => m.id === n.afterMessageId)
  );
  for (const notice of orphanNotices) {
    items.push({ type: 'notice', data: notice });
  }

  return items;
}

/**
 * 找到第一个阻塞点（未完成的工具、流式消息、或 pending notice）
 * 阻塞点之前的 items 可以进入 Static 区域，阻塞点及之后的 items 在动态区域渲染
 */
function findTimelineBlockingIndex(items: TimelineItem[]): number {
  return items.findIndex((item) => {
    if (item.type === 'message') {
      const m = item.data;
      // 流式消息是阻塞点
      if (m.isStreaming) return true;
      // 未完成的工具是阻塞点
      if (m.role === 'tool' && m.toolCall) {
        const status = m.toolCall.status;
        return status !== 'success' && status !== 'error' && status !== 'cancelled';
      }
    }
    if (item.type === 'notice') {
      // pending notice 是阻塞点（需要动态更新 Spinner）
      return item.data.data.isPending;
    }
    return false;
  });
}

// 旧的 findBlockingIndex 保留兼容（仅用于 messages）
function findBlockingIndex(messages: Message[]): number {
  return messages.findIndex((m) => {
    // 流式消息是阻塞点
    if (m.isStreaming) return true;
    // 未完成的工具是阻塞点
    if (m.role === 'tool' && m.toolCall) {
      const status = m.toolCall.status;
      return status !== 'success' && status !== 'error' && status !== 'cancelled';
    }
    return false;
  });
}

// 获取 Static 区域的消息（阻塞点之前）
// 这些消息的状态已经确定，不会再变化
export function useStaticMessages(): Message[] {
  return useAppStore(
    useShallow((state) => {
      const id = state.currentSessionId;
      const messages = id ? state.messages[id] || [] : [];
      const blockingIndex = findBlockingIndex(messages);
      // 没有阻塞点，所有消息都可以进入 Static
      if (blockingIndex === -1) return messages;
      // 返回阻塞点之前的消息
      return messages.slice(0, blockingIndex);
    })
  );
}

// 获取动态区域的消息（阻塞点及之后，不含流式）
// 这些消息的状态可能还会变化，需要在动态区域渲染
export function useDynamicMessages(): Message[] {
  return useAppStore(
    useShallow((state) => {
      const id = state.currentSessionId;
      const messages = id ? state.messages[id] || [] : [];
      const blockingIndex = findBlockingIndex(messages);
      // 没有阻塞点，动态区域为空
      if (blockingIndex === -1) return [];
      // 返回阻塞点及之后的消息（不含流式消息，流式消息单独处理）
      return messages.slice(blockingIndex).filter((m) => !m.isStreaming);
    })
  );
}

// ============ Timeline Hooks（整合 messages 和 notices） ============

/**
 * 获取 Static 区域的时间线项目（阻塞点之前）
 * 包含已完成的 messages 和 notices
 */
export function useStaticTimelineItems(): TimelineItem[] {
  return useAppStore(
    useShallow((state) => {
      const id = state.currentSessionId;
      const messages = id ? state.messages[id] || [] : [];
      const notices = state.notices;

      // 合并为时间线
      const items = mergeTimelineItems(messages, notices);

      // 找到阻塞点
      const blockingIndex = findTimelineBlockingIndex(items);

      // 没有阻塞点，所有 items 都可以进入 Static
      if (blockingIndex === -1) return items;

      // 返回阻塞点之前的 items
      return items.slice(0, blockingIndex);
    })
  );
}

/**
 * 获取动态区域的时间线项目（阻塞点及之后，不含流式消息）
 * 包含未完成的 messages 和 pending notices
 */
export function useDynamicTimelineItems(): TimelineItem[] {
  return useAppStore(
    useShallow((state) => {
      const id = state.currentSessionId;
      const messages = id ? state.messages[id] || [] : [];
      const notices = state.notices;

      // 合并为时间线
      const items = mergeTimelineItems(messages, notices);

      // 找到阻塞点
      const blockingIndex = findTimelineBlockingIndex(items);

      // 没有阻塞点，动态区域为空
      if (blockingIndex === -1) return [];

      // 返回阻塞点及之后的 items（不含流式消息）
      return items.slice(blockingIndex).filter((item) => {
        if (item.type === 'message') {
          return !item.data.isStreaming;
        }
        return true; // notices 全部保留
      });
    })
  );
}

// ============ Notice Hooks（仅内存） ============

/**
 * 获取所有通知
 */
export function useNotices(): Notice[] {
  return useAppStore(useShallow((state) => state.notices));
}

/**
 * 获取 notice actions
 */
export function useNoticeActions() {
  return useAppStore(
    useShallow((state) => ({
      addNotice: state.addNotice,
      updateNotice: state.updateNotice,
      removeNotice: state.removeNotice,
      clearNotices: state.clearNotices,
    }))
  );
}
