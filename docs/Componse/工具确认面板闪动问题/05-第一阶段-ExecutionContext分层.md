# 第一阶段：ExecutionContext 分层优化

## 问题背景

在最初的实现中，ExecutionContext 只有一个 Context，所有组件都订阅同一个 `snapshot` 对象。当 `snapshot` 的任何字段更新时（如 `stats`、`statusPhrase`、`state`），所有订阅组件都会重新渲染。

### 具体问题

**现象**：确认面板弹出时，每隔 3.5 秒闪动一次

**原因**：
1. Core 层的 `ExecutionStreamManager` 每 3 秒轮换一次 `statusPhrase`（Thinking → Analyzing → Processing...）
2. `statusPhrase` 变化导致 `snapshot` 对象引用更新
3. `Session` 组件订阅了 `snapshot`，触发重新渲染
4. Ink 的 `Static` 组件检测到父组件重新渲染，重新打印 Header
5. 用户看到画面闪动

## 解决方案：三层 Context 分离

### 架构设计

将原来单一的 `ExecutionContext` 拆分为三层：

```
ExecutionProvider
├── ExecutionStateContext      ← 低频更新：控制方法、事件订阅
├── ExecutionIsExecutingContext ← 极低频更新：只在执行开始/结束时变化
└── ExecutionSnapshotContext    ← 高频更新：执行快照数据
```

### 分层说明

#### 1. ExecutionStateContext（低频更新）

**职责**：控制方法和事件订阅

```typescript
interface ExecutionStateContextValue {
  showThinking: boolean;
  toggleThinking: () => void;
  subscribe: (handler: ExecutionEventHandler) => () => void;
  bindManager: (manager: ExecutionStreamManager) => () => void;
}
```

**更新频率**：几乎不变（只在用户切换思考展示时更新）

**适用场景**：
- `useExecutionMessages`: 需要订阅事件
- `useAgent`: 需要 `bindManager`

#### 2. ExecutionIsExecutingContext（极低频更新）

**职责**：是否正在执行

```typescript
interface ExecutionIsExecutingContextValue {
  isExecuting: boolean;
}
```

**更新频率**：只在执行开始/结束时变化

**关键实现**：
```typescript
// ✨ 只依赖 snapshot.state，避免其他字段变化触发更新
useEffect(() => {
  const newIsExecuting = snapshot !== null &&
    snapshot.state !== 'idle' &&
    snapshot.state !== 'completed' &&
    snapshot.state !== 'error' &&
    snapshot.state !== 'cancelled';

  // 只在值真正变化时才 setState
  setIsExecuting(prev => prev !== newIsExecuting ? newIsExecuting : prev);
}, [snapshot?.state]);  // ← 关键：只依赖 state 字段！
```

**适用场景**：
- `Session`: 控制 `ExecutionStream` 显示/隐藏
- `InputArea`: 判断是否可以发送新消息

#### 3. ExecutionSnapshotContext（高频更新）

**职责**：执行快照数据

```typescript
interface ExecutionSnapshotContextValue {
  snapshot: ExecutionSnapshot | null;
}
```

**更新频率**：每次 Core 层推送事件都会更新

**适用场景**：
- `StatusIndicator`: 需要显示 `stats`、`statusPhrase`、`state`
- `ExecutionStream`: 需要传递完整 `snapshot`

## 关键代码

### execution.tsx

```typescript
export function ExecutionProvider({ children }: ExecutionProviderProps) {
  // State 相关状态（低频更新）
  const [showThinking, setShowThinking] = useState(false);
  const managerRef = useRef<ExecutionStreamManager | null>(null);
  const handlersRef = useRef<Set<ExecutionEventHandler>>(new Set());

  // Snapshot 状态（高频更新）
  const [snapshot, setSnapshot] = useState<ExecutionSnapshot | null>(null);

  // ✨ 独立的 isExecuting 状态（极低频更新）
  const [isExecuting, setIsExecuting] = useState(false);

  // ✨ 只在 snapshot.state 真正变化时更新 isExecuting
  useEffect(() => {
    const newIsExecuting = snapshot !== null &&
      snapshot.state !== 'idle' &&
      snapshot.state !== 'completed' &&
      snapshot.state !== 'error' &&
      snapshot.state !== 'cancelled';

    setIsExecuting(prev => prev !== newIsExecuting ? newIsExecuting : prev);
  }, [snapshot?.state]);  // ← 只依赖 state 字段！

  // ... 其他代码

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
```

### 组件按需订阅

```typescript
// Session 组件 - 只订阅 isExecuting
export function Session() {
  const isExecuting = useIsExecuting();  // ← 只在执行开始/结束时重渲染

  return (
    <>
      <Static items={staticItems}>...</Static>
      {isExecuting && <ExecutionStream />}
    </>
  );
}

// StatusIndicator 组件 - 订阅完整 snapshot
export function StatusIndicator() {
  const snapshot = useExecutionSnapshot();  // ← 每次 snapshot 更新都重渲染
  const { stats, statusPhrase, state } = snapshot;

  return (
    <Box>
      <Spinner />
      <Text>{statusPhrase}</Text>
      <Text>{stats.totalTokens} tokens</Text>
    </Box>
  );
}
```

## 效果验证

### 修复前

```
Core 层推送事件 (每 3 秒)
  ↓
snapshot 更新 (statusPhrase 变化)
  ↓
Session 订阅 snapshot → 重新渲染
  ↓
Static 组件重新打印 Header
  ↓
用户看到闪动 ❌
```

### 修复后

```
Core 层推送事件 (每 3 秒)
  ↓
snapshot 更新 (statusPhrase 变化)
  ↓
Session 订阅 isExecuting → 不重新渲染 ✅
StatusIndicator 订阅 snapshot → 重新渲染（符合预期）
  ↓
用户看到：
- Header 保持静止
- StatusIndicator 正常更新 statusPhrase
```

## 性能优化细节

### 1. useMemo 避免 Context value 重新创建

```typescript
// ❌ 错误：每次渲染都创建新对象
const stateValue = {
  showThinking,
  toggleThinking,
  subscribe,
  bindManager,
};

// ✅ 正确：只在依赖变化时创建新对象
const stateValue = useMemo<ExecutionStateContextValue>(() => ({
  showThinking,
  toggleThinking,
  subscribe,
  bindManager,
}), [showThinking, toggleThinking, subscribe, bindManager]);
```

### 2. 依赖项精确控制

```typescript
// ❌ 错误：依赖整个 snapshot 对象
useEffect(() => {
  setIsExecuting(snapshot?.state === 'thinking');
}, [snapshot]);  // ← snapshot 的任何字段变化都会触发

// ✅ 正确：只依赖 state 字段
useEffect(() => {
  setIsExecuting(snapshot?.state === 'thinking');
}, [snapshot?.state]);  // ← 只有 state 变化才触发
```

### 3. setState 防抖

```typescript
// ❌ 错误：每次都调用 setState，即使值没变
setIsExecuting(newIsExecuting);

// ✅ 正确：只在值真正变化时调用
setIsExecuting(prev => prev !== newIsExecuting ? newIsExecuting : prev);
```

## 关键文件变更

| 文件 | 变更内容 |
|------|---------|
| `packages/cli/src/context/execution.tsx` | 三层 Context 分离 + 独立 isExecuting 状态 |
| `packages/cli/src/routes/session/index.tsx` | 使用 `useIsExecuting()` 替代 `useExecution()` |

## 收获与经验

### 1. Context 分层设计原则

**高频更新的数据应该独立 Context**

- 将频繁变化的数据（如 `snapshot`）与稳定数据（如控制方法）分离
- 让组件按需订阅，避免不必要的重渲染

### 2. useEffect 依赖项优化

**只依赖真正需要的字段**

```typescript
// ❌ 依赖整个对象
useEffect(() => { ... }, [snapshot]);

// ✅ 只依赖需要的字段
useEffect(() => { ... }, [snapshot?.state]);
```

### 3. React 性能优化技巧

- `useMemo` 缓存 Context value
- `setState` 防抖（比较新旧值）
- 精确控制依赖项

### 4. Ink 特性理解

**Static 组件的重新打印机制**：
- Static 组件会在父组件重新渲染时重新打印
- 即使 items 数组没变，只要父组件重渲染就会触发
- 解决方案：减少父组件重渲染频率

## 遗留问题

虽然解决了定时闪动（每 3.5 秒），但仍有以下问题：

1. **确认面板弹出瞬间仍会闪动一次**
   - 原因：`isPendingConfirm` 状态变化导致 Session 重渲染
   - 解决：见第二阶段

2. **StatusIndicator 的定时器在确认时仍在运行**
   - 现象：Spinner 动画、计时器、Tip 轮换继续运行
   - 解决：见第二阶段

3. **Core 层在 `waiting_confirm` 状态时仍推送事件**
   - 现象：`statusPhrase` 每 3 秒变化，导致 StatusIndicator 频繁重渲染
   - 解决：见第三阶段
