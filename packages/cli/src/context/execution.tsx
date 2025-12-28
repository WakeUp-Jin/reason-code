/**
 * 执行流 Context
 * 提供执行流状态给 CLI 组件使用
 */

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  type ReactNode
} from 'react';
import type {
  ExecutionSnapshot,
  ExecutionEvent,
  ExecutionStreamManager,
  ExecutionEventHandler,
} from '@reason-cli/core';

interface ExecutionContextValue {
  // 状态
  snapshot: ExecutionSnapshot | null;
  isExecuting: boolean;

  // 思考展示控制
  showThinking: boolean;
  toggleThinking: () => void;

  // 事件订阅
  subscribe: (handler: ExecutionEventHandler) => () => void;

  // 绑定执行流管理器
  bindManager: (manager: ExecutionStreamManager) => () => void;
}

const ExecutionContext = createContext<ExecutionContextValue | null>(null);

interface ExecutionProviderProps {
  children: ReactNode;
}

export function ExecutionProvider({ children }: ExecutionProviderProps) {
  const [snapshot, setSnapshot] = useState<ExecutionSnapshot | null>(null);
  const [showThinking, setShowThinking] = useState(false);
  const managerRef = useRef<ExecutionStreamManager | null>(null);
  const handlersRef = useRef<Set<ExecutionEventHandler>>(new Set());

  // 切换思考展示
  const toggleThinking = useCallback(() => {
    setShowThinking(prev => !prev);
  }, []);

  // 订阅事件
  const subscribe = useCallback((handler: ExecutionEventHandler) => {
    handlersRef.current.add(handler);
    return () => handlersRef.current.delete(handler);
  }, []);

  // 绑定管理器
  const bindManager = useCallback((manager: ExecutionStreamManager) => {
    managerRef.current = manager;

    // 订阅管理器事件
    const unsubscribe = manager.on((event: ExecutionEvent) => {
      // 执行开始时清除上次的快照
      if (event.type === 'execution:start') {
        setSnapshot(null);
        setShowThinking(false);
      }

      // 更新快照
      setSnapshot(manager.getSnapshot());

      // 转发给外部订阅者
      handlersRef.current.forEach(handler => handler(event));

      // 执行完成时重置思考展示（但不清除快照，让消息组件处理）
      if (event.type === 'execution:complete' ||
          event.type === 'execution:error' ||
          event.type === 'execution:cancel') {
        setShowThinking(false);
      }
    });

    return unsubscribe;
  }, []);

  // 计算是否正在执行
  const isExecuting = snapshot !== null &&
    snapshot.state !== 'idle' &&
    snapshot.state !== 'completed' &&
    snapshot.state !== 'error' &&
    snapshot.state !== 'cancelled';

  const value: ExecutionContextValue = {
    snapshot,
    isExecuting,
    showThinking,
    toggleThinking,
    subscribe,
    bindManager,
  };

  return (
    <ExecutionContext.Provider value={value}>
      {children}
    </ExecutionContext.Provider>
  );
}

export function useExecution(): ExecutionContextValue {
  const context = useContext(ExecutionContext);
  if (!context) {
    throw new Error('useExecution must be used within ExecutionProvider');
  }
  return context;
}
