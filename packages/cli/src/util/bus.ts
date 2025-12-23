/**
 * 简单的事件总线实现
 * 用于 CLI 内部组件间通信
 */

type EventCallback<T = unknown> = (data: T) => void

interface EventBus {
  on<T = unknown>(event: string, callback: EventCallback<T>): () => void
  off<T = unknown>(event: string, callback: EventCallback<T>): void
  emit<T = unknown>(event: string, data: T): void
  once<T = unknown>(event: string, callback: EventCallback<T>): () => void
}

function createEventBus(): EventBus {
  const listeners = new Map<string, Set<EventCallback>>()

  return {
    /**
     * 订阅事件
     * @returns 取消订阅函数
     */
    on<T = unknown>(event: string, callback: EventCallback<T>): () => void {
      if (!listeners.has(event)) {
        listeners.set(event, new Set())
      }
      listeners.get(event)!.add(callback as EventCallback)

      // 返回取消订阅函数
      return () => {
        this.off(event, callback)
      }
    },

    /**
     * 取消订阅事件
     */
    off<T = unknown>(event: string, callback: EventCallback<T>): void {
      const eventListeners = listeners.get(event)
      if (eventListeners) {
        eventListeners.delete(callback as EventCallback)
        if (eventListeners.size === 0) {
          listeners.delete(event)
        }
      }
    },

    /**
     * 发布事件
     */
    emit<T = unknown>(event: string, data: T): void {
      const eventListeners = listeners.get(event)
      if (eventListeners) {
        for (const callback of eventListeners) {
          try {
            callback(data)
          } catch (error) {
            console.error(`Error in event listener for "${event}":`, error)
          }
        }
      }
    },

    /**
     * 订阅事件（只触发一次）
     * @returns 取消订阅函数
     */
    once<T = unknown>(event: string, callback: EventCallback<T>): () => void {
      const wrapper: EventCallback<T> = (data) => {
        this.off(event, wrapper)
        callback(data)
      }
      return this.on(event, wrapper)
    },
  }
}

// 全局事件总线实例
export const bus = createEventBus()

// 预定义事件类型
export const BusEvents = {
  // Agent 相关
  AGENT_START: 'agent:start',
  AGENT_CHUNK: 'agent:chunk',
  AGENT_END: 'agent:end',
  AGENT_ERROR: 'agent:error',

  // Session 相关
  SESSION_CREATED: 'session:created',
  SESSION_DELETED: 'session:deleted',
  SESSION_SWITCHED: 'session:switched',

  // Message 相关
  MESSAGE_ADDED: 'message:added',
  MESSAGE_UPDATED: 'message:updated',

  // UI 相关
  TOAST_SHOW: 'toast:show',
  DIALOG_OPEN: 'dialog:open',
  DIALOG_CLOSE: 'dialog:close',
} as const

// 事件数据类型
export interface AgentChunkEvent {
  sessionId: string
  messageId: string
  chunk: string
}

export interface AgentEndEvent {
  sessionId: string
  messageId: string
  content: string
}

export interface AgentErrorEvent {
  sessionId: string
  error: Error
}

export { createEventBus }

