import React, { createContext, useContext, type ReactNode } from 'react';
import { create } from 'zustand';

// Session 类型
export interface Session {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
}

// Token 使用情况
export interface TokenUsage {
  inputTokens: number;   // 输入 token 数
  outputTokens: number;  // 输出 token 数
  totalTokens: number;   // 总 token 数
}

// 消息元数据
export interface MessageMetadata {
  // Token 信息（仅 assistant 消息有）
  tokenUsage?: TokenUsage;

  // 模型信息
  model?: string;

  // 成本信息（可选）
  cost?: {
    inputCost: number;   // 输入成本（USD）
    outputCost: number;  // 输出成本（USD）
    totalCost: number;   // 总成本（USD）
  };

  // 生成信息（可选）
  generationInfo?: {
    temperature?: number;   // 温度参数
    maxTokens?: number;     // 最大 token 数
    stopReason?: string;    // 停止原因
    latency?: number;       // 响应延迟（ms）
  };

  // 其他自定义字段
  [key: string]: any;
}

// 消息角色类型
export type MessageRole = 'user' | 'assistant' | 'tool' | 'thinking';

// 工具调用状态
export type ToolCallStatus = 'executing' | 'success' | 'error';

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
}

// Message 类型
export interface Message {
  id: string;
  sessionId: string;
  role: MessageRole;
  content: string;
  timestamp: number;
  isStreaming?: boolean;

  // 元数据
  metadata?: MessageMetadata;

  // 工具调用信息（仅 role='tool' 时有）
  toolCall?: ToolCallInfo;
}

// 消息更新类型（支持 toolCall 部分更新）
export interface MessageUpdate extends Omit<Partial<Message>, 'toolCall'> {
  toolCall?: Partial<ToolCallInfo>;
}

// Agent 类型
export interface AgentInfo {
  id: string;
  name: string;
  description: string;
}

// Model 类型
export interface ModelInfo {
  id: string;
  name: string;
  provider: string;

  // Context 窗口大小（最大 token 数）
  maxTokens: number;

  // 定价（USD per 1M tokens）
  pricing?: {
    input: number;   // 输入价格
    output: number;  // 输出价格
  };

  // 其他信息
  description?: string;
}

// 配置类型
export interface Config {
  theme: string;
  mode: 'dark' | 'light';
  currentAgent: string;
  currentModel: string;
}

// Store 状态类型
interface AppState {
  // Session 相关
  sessions: Session[];
  currentSessionId: string | null;

  // Message 相关
  messages: Record<string, Message[]>;

  // Agent 相关
  agents: AgentInfo[];
  currentAgent: string;

  // Model 相关
  models: ModelInfo[];
  currentModel: string;

  // 配置
  config: Config;

  // Session Actions
  createSession: (title?: string) => Session;
  deleteSession: (id: string) => void;
  renameSession: (id: string, title: string) => void;
  switchSession: (id: string) => void;

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

  // Agent/Model Actions
  setCurrentAgent: (agentId: string) => void;
  setCurrentModel: (modelId: string) => void;

  // Config Actions
  updateConfig: (updates: Partial<Config>) => void;

  // Initialization from disk
  initializeFromDisk: (data: {
    sessions: Session[];
    messages: Record<string, Message[]>;
    currentSessionId: string | null;
    currentAgent: string;
    currentModel: string;
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
  agents: [
    { id: 'default', name: 'Default Agent', description: 'General purpose AI assistant' },
    { id: 'coder', name: 'Coder', description: 'Specialized in coding tasks' },
  ],
  currentAgent: 'default',
  models: [
    {
      id: 'deepseek/deepseek-chat',
      name: 'DeepSeek Chat',
      provider: 'DeepSeek',
      maxTokens: 64_000,
      pricing: {
        input: 0.14,   // $0.14 per 1M tokens
        output: 0.28,  // $0.28 per 1M tokens
      },
      description: 'Fast and affordable chat model',
    },
    {
      id: 'deepseek/deepseek-reasoner',
      name: 'DeepSeek Reasoner',
      provider: 'DeepSeek',
      maxTokens: 64_000,
      pricing: {
        input: 0.55,   // $0.55 per 1M tokens
        output: 2.19,  // $2.19 per 1M tokens
      },
      description: 'Advanced reasoning model (R1)',
    },
    {
      id: 'claude-sonnet-4',
      name: 'Claude Sonnet 4',
      provider: 'Anthropic',
      maxTokens: 200_000,
      pricing: {
        input: 3,    // $3 per 1M tokens
        output: 15,  // $15 per 1M tokens
      },
      description: 'Most capable Claude model with 200K context',
    },
    {
      id: 'gpt-4o',
      name: 'GPT-4o',
      provider: 'OpenAI',
      maxTokens: 128_000,
      pricing: {
        input: 2.5,   // $2.5 per 1M tokens
        output: 10,   // $10 per 1M tokens
      },
      description: 'Fast and capable GPT-4 model',
    },
    {
      id: 'gemini-pro',
      name: 'Gemini Pro',
      provider: 'Google',
      maxTokens: 1_000_000,
      pricing: {
        input: 0.5,   // $0.5 per 1M tokens
        output: 1.5,  // $1.5 per 1M tokens
      },
      description: 'Long context Google model with 1M context',
    },
  ],
  currentModel: 'deepseek/deepseek-chat',
  config: {
    theme: 'kanagawa',
    mode: 'dark',
    currentAgent: 'default',
    currentModel: 'deepseek/deepseek-chat',
  },

  // Session Actions
  createSession: (title) => {
    const session: Session = {
      id: generateId(),
      title: title || `Session ${get().sessions.length + 1}`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    set((state) => ({
      sessions: [...state.sessions, session],
      currentSessionId: session.id,
      messages: { ...state.messages, [session.id]: [] },
    }));

    return session;
  },

  deleteSession: (id) => {
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

  renameSession: (id, title) => {
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === id ? { ...s, title, updatedAt: Date.now() } : s
      ),
    }));
  },

  switchSession: (id) => {
    set({ currentSessionId: id });
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

          return {
            ...m,
            ...updates,
            toolCall: newToolCall,
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

  // Agent/Model Actions
  setCurrentAgent: (agentId) => {
    set({ currentAgent: agentId });
  },

  setCurrentModel: (modelId) => {
    set({ currentModel: modelId });
  },

  // Config Actions
  updateConfig: (updates) => {
    set((state) => ({
      config: { ...state.config, ...updates },
    }));
  },

  // Initialization from disk
  initializeFromDisk: (data) => {
    set({
      sessions: data.sessions,
      messages: data.messages,
      currentSessionId: data.currentSessionId,
      currentAgent: data.currentAgent,
      currentModel: data.currentModel,
      config: {
        ...get().config,
        currentAgent: data.currentAgent,
        currentModel: data.currentModel,
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
export function useCurrentSession(): Session | null {
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

export function useSessions(): Session[] {
  return useAppStore((state) => state.sessions);
}

// 获取已完成的消息（非流式）
export function useCompletedMessages(): Message[] {
  return useAppStore((state) => {
    const id = state.currentSessionId;
    const messages = id ? state.messages[id] || [] : [];
    return messages.filter((m) => !m.isStreaming);
  });
}

// 获取当前流式消息
export function useStreamingMessage(): Message | null {
  return useAppStore((state) => {
    const id = state.currentSessionId;
    const messages = id ? state.messages[id] || [] : [];
    return messages.find((m) => m.isStreaming) || null;
  });
}
