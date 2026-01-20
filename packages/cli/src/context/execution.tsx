/**
 * 执行流 Context
 * 采用分层架构：State Context（低频更新）+ IsExecuting Context（极低频）+ Snapshot Context（高频更新）
 *
 * 设计思路：
 * - ExecutionStateContext: 控制方法和事件订阅（低频更新）
 * - ExecutionIsExecutingContext: 是否正在执行（只在开始/结束时更新）
 * - ExecutionSnapshotContext: 执行快照数据（高频更新）
 *
 * 组件按需订阅：
 * - Session 只订阅 useIsExecuting()（不会因 snapshot 变化重新渲染）
 * - ExecutionStream/StatusIndicator 订阅 useExecutionSnapshot()（需要详细数据）
 */

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  useMemo,
  useEffect,
  type ReactNode,
} from 'react';
import type {
  ExecutionSnapshot,
  ExecutionEvent,
  ExecutionStreamManager,
  ExecutionEventHandler,
  TodoItem,
  ConfirmDetails,
} from '@reason-cli/core';
import { logger } from '../util/logger.js';
import { eventLogger } from '../util/logUtils.js';

// ==================== State Context（低频更新）====================

/** 确认中的工具信息 */
interface PendingToolInfo {
  toolName: string;
  paramsSummary?: string;
}

interface ExecutionStateContextValue {
  // 思考展示控制
  showThinking: boolean;
  toggleThinking: () => void;

  // 事件订阅
  subscribe: (handler: ExecutionEventHandler) => () => void;

  // 绑定执行流管理器
  bindManager: (manager: ExecutionStreamManager) => () => void;

  // 等待确认状态（用于暂停 StatusIndicator 定时器）
  isPendingConfirm: boolean;

  // 确认中的工具信息（用于 Session 显示工具标题）
  pendingToolInfo: PendingToolInfo | null;

  // TODO 列表状态
  todos: TodoItem[];
  setTodos: (todos: TodoItem[]) => void;

  // TODO 显示切换（ctrl+t）
  showTodos: boolean;
  toggleTodos: () => void;
}

const ExecutionStateContext = createContext<ExecutionStateContextValue | null>(null);

// ==================== IsExecuting Context（极低频更新）====================

interface ExecutionIsExecutingContextValue {
  isExecuting: boolean;
}

const ExecutionIsExecutingContext = createContext<ExecutionIsExecutingContextValue | null>(null);

// ==================== Snapshot Context（高频更新）====================

interface ExecutionSnapshotContextValue {
  snapshot: ExecutionSnapshot | null;
}

const ExecutionSnapshotContext = createContext<ExecutionSnapshotContextValue | null>(null);

// ==================== Provider ====================

interface ExecutionProviderProps {
  children: ReactNode;
}

function getParamsSummary(details: ConfirmDetails): string | undefined {
  switch (details.type) {
    case 'info':
      return details.fileName;
    case 'edit':
      return details.filePath;
    case 'exec':
      return details.command;
    default:
      return undefined;
  }
}

export function ExecutionProvider({ children }: ExecutionProviderProps) {
  // State 相关状态（低频更新）
  const [showThinking, setShowThinking] = useState(false);
  const [pendingToolInfo, setPendingToolInfo] = useState<PendingToolInfo | null>(null);
  const managerRef = useRef<ExecutionStreamManager | null>(null);
  const handlersRef = useRef<Set<ExecutionEventHandler>>(new Set());
  const managerUnsubscribeRef = useRef<(() => void) | null>(null);

  // TODO 列表状态
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [todoVisibility, setTodoVisibility] = useState<'auto' | 'show' | 'hide'>('auto');
  const areAllTodosFinished =
    todos.length > 0 &&
    todos.every((todo) => todo.status === 'completed' || todo.status === 'cancelled');

  const showTodos =
    todoVisibility === 'show'
      ? todos.length > 0
      : todoVisibility === 'hide'
        ? false
        : todos.length > 0 && !areAllTodosFinished;

  // Snapshot 状态（高频更新）
  const [snapshot, setSnapshot] = useState<ExecutionSnapshot | null>(null);

  // ✨ 独立的 isExecuting 状态（极低频更新，只在开始/结束时变化）
  const [isExecuting, setIsExecuting] = useState(false);

  // ✨ 只在 snapshot.state 真正变化时更新 isExecuting
  useEffect(() => {
    const newIsExecuting =
      snapshot !== null &&
      snapshot.state !== 'idle' &&
      snapshot.state !== 'completed' &&
      snapshot.state !== 'error' &&
      snapshot.state !== 'cancelled';

    // 只在值真正变化时才 setState，避免不必要的渲染
    setIsExecuting((prev) => (prev !== newIsExecuting ? newIsExecuting : prev));
  }, [snapshot?.state]); // ← 只依赖 state 字段！

  // ✅ 方案 A：以 Core snapshot.state 作为“等待确认”的唯一真相源
  // 只会在 state 变化时变化（低频），不会随 snapshot 其他字段的高频更新而波动
  const isPendingConfirm = snapshot?.state === 'waiting_confirm';

  // 切换思考展示
  const toggleThinking = useCallback(() => {
    setShowThinking((prev) => !prev);
  }, []);

  // 切换 TODO 显示
  const toggleTodos = useCallback(() => {
    setTodoVisibility((prev) => {
      // 基于“当前是否可见”做切换，保证 auto + all-done 时也能被强制显示
      const currentlyVisible =
        prev === 'show' ? todos.length > 0 : prev === 'hide' ? false : todos.length > 0 && !areAllTodosFinished;
      return currentlyVisible ? 'hide' : 'show';
    });
  }, [areAllTodosFinished, todos.length]);

  // 订阅事件
  const subscribe = useCallback((handler: ExecutionEventHandler) => {
    handlersRef.current.add(handler);
    return () => handlersRef.current.delete(handler);
  }, []);

  // 绑定管理器
  const bindManager = useCallback((manager: ExecutionStreamManager) => {
    // 清理旧订阅
    if (managerUnsubscribeRef.current) {
      logger.debug('Cleaning up old manager subscription before rebind');
      managerUnsubscribeRef.current();
      managerUnsubscribeRef.current = null;
    }

    managerRef.current = manager;

    // 立即同步当前快照
    const currentSnapshot = manager.getSnapshot();
    if (currentSnapshot) {
      logger.debug('Syncing snapshot on manager bind', { state: currentSnapshot.state });
      setSnapshot(currentSnapshot);

      // 同步 isExecuting 相关状态
      const executing =
        currentSnapshot.state !== 'idle' &&
        currentSnapshot.state !== 'completed' &&
        currentSnapshot.state !== 'error' &&
        currentSnapshot.state !== 'cancelled';
      setIsExecuting(executing);
    }

    // 订阅管理器事件
    managerUnsubscribeRef.current = manager.on((event: ExecutionEvent) => {
      // 记录事件接收（传递完整事件对象）
      eventLogger.receive(event.type, event);

      // 执行开始时清除上次的快照
      if (event.type === 'execution:start') {
        setSnapshot(null);
        setShowThinking(false);
        setPendingToolInfo(null);
        setTodoVisibility('auto');
      }

      // 等待确认：由 Core 事件驱动 pendingToolInfo（用于 UI 展示）
      if (event.type === 'tool:awaiting_approval') {
        setPendingToolInfo({
          toolName: event.toolName,
          paramsSummary: getParamsSummary(event.confirmDetails),
        });
      }

      // 离开等待确认：清理 pendingToolInfo（确认通过/取消/失败/完成）
      if (
        event.type === 'tool:executing' ||
        event.type === 'tool:complete' ||
        event.type === 'tool:error' ||
        event.type === 'tool:cancelled' ||
        event.type === 'execution:complete' ||
        event.type === 'execution:error' ||
        event.type === 'execution:cancel'
      ) {
        setPendingToolInfo(null);
      }

      // 更新快照（高频）
      setSnapshot(manager.getSnapshot());

      // 转发给外部订阅者
      handlersRef.current.forEach((handler) => handler(event));

      // 执行完成时重置思考展示
      if (
        event.type === 'execution:complete' ||
        event.type === 'execution:error' ||
        event.type === 'execution:cancel'
      ) {
        setShowThinking(false);
      }
    });

    return managerUnsubscribeRef.current;
  }, []);

  // 使用 useMemo 避免 State Context value 不必要的重新创建
  const stateValue = useMemo<ExecutionStateContextValue>(
    () => ({
      showThinking,
      toggleThinking,
      subscribe,
      bindManager,
      isPendingConfirm,
      pendingToolInfo,
      todos,
      setTodos,
      showTodos,
      toggleTodos,
    }),
    [
      showThinking,
      toggleThinking,
      subscribe,
      bindManager,
      isPendingConfirm,
      pendingToolInfo,
      todos,
      showTodos,
      toggleTodos,
    ]
  );

  // ✨ 使用 useMemo 避免 IsExecuting Context value 不必要的重新创建
  const isExecutingValue = useMemo<ExecutionIsExecutingContextValue>(
    () => ({
      isExecuting,
    }),
    [isExecuting]
  );

  // 使用 useMemo 避免 Snapshot Context value 不必要的重新创建
  const snapshotValue = useMemo<ExecutionSnapshotContextValue>(
    () => ({
      snapshot,
    }),
    [snapshot]
  );

  return (
    <ExecutionStateContext.Provider value={stateValue}>
      <ExecutionIsExecutingContext.Provider value={isExecutingValue}>
        <ExecutionSnapshotContext.Provider value={snapshotValue}>
          {children}
        </ExecutionSnapshotContext.Provider>
      </ExecutionIsExecutingContext.Provider>
    </ExecutionStateContext.Provider>
  );
}

// ==================== Hooks ====================

/**
 * 使用执行快照（高频更新）
 *
 * 适用场景：
 * - StatusIndicator: 需要显示 stats, statusPhrase, state
 * - ExecutionStream: 需要传递 snapshot 给子组件
 *
 * 注意：会随 snapshot 的每次更新而重新渲染
 */
export function useExecutionSnapshot(): ExecutionSnapshot | null {
  const context = useContext(ExecutionSnapshotContext);
  if (!context) {
    throw new Error('useExecutionSnapshot must be used within ExecutionProvider');
  }
  return context.snapshot;
}

/**
 * 只获取 isExecuting 状态（性能优化）
 *
 * 适用场景：
 * - Session: 只需要判断是否正在执行，控制 ExecutionStream 的显示/隐藏
 * - InputArea: 判断是否可以发送新消息
 *
 * ✨ 优点：
 * - 使用独立的 Context，不依赖 snapshot
 * - 只在执行开始/结束时触发重新渲染
 * - 不会因为 snapshot 的 stats、statusPhrase 等变化而重新渲染
 */
export function useIsExecuting(): boolean {
  const context = useContext(ExecutionIsExecutingContext);
  if (!context) {
    throw new Error('useIsExecuting must be used within ExecutionProvider');
  }
  return context.isExecuting;
}

/**
 * 使用执行状态控制（低频更新）
 *
 * 适用场景：
 * - useExecutionMessages: 需要订阅事件
 * - useExecutionStats: 需要订阅事件
 * - useAgent: 需要 bindManager
 *
 * 优点：不会因为 snapshot 更新而重新渲染
 */
export function useExecutionState(): ExecutionStateContextValue {
  const context = useContext(ExecutionStateContext);
  if (!context) {
    throw new Error('useExecutionState must be used within ExecutionProvider');
  }
  return context;
}

/**
 * 使用完整的执行信息（兼容旧 API）
 *
 * 包含 snapshot + isExecuting + 状态控制方法
 *
 * ⚠️ 警告：会随 snapshot 的每次更新而重新渲染
 * 如果只需要 isExecuting，请使用 useIsExecuting()
 * 如果只需要状态控制，请使用 useExecutionState()
 */
export function useExecution() {
  const snapshot = useExecutionSnapshot();
  const state = useExecutionState();
  const isExecuting = useIsExecuting();

  return {
    snapshot,
    isExecuting,
    showThinking: state.showThinking,
    toggleThinking: state.toggleThinking,
    subscribe: state.subscribe,
    bindManager: state.bindManager,
  };
}
