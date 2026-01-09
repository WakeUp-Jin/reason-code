# 第二阶段：StatusIndicator 定时器暂停

## 问题背景

第一阶段解决了定时闪动问题后，通过添加 debug 日志发现了新问题：

**StatusIndicator 有 3 个内部定时器在确认时仍在运行**：
1. Spinner 动画（80ms 间隔）
2. 计时器（1000ms 间隔）
3. Tip 轮换（8000ms 间隔）

这些定时器导致确认面板显示时仍有视觉变化，虽然不会触发 Session 重渲染，但不符合预期（确认时应该完全静止）。

## 问题分析

### Debug 日志追踪

#### 添加日志位置

```typescript
// StatusIndicator.tsx
function Spinner({ color, isPaused }: { color: string; isPaused?: boolean }) {
  useEffect(() => {
    logger.info(`🔄 [Spinner] useEffect triggered`, { isPaused });
    if (isPaused) {
      logger.info(`⏸️ [Spinner] PAUSED - not starting timer`);
      return;
    }
    logger.info(`▶️ [Spinner] RUNNING - starting timer`);
    // ...
  }, [isPaused]);
}

export function StatusIndicator() {
  useEffect(() => {
    logger.info(`⏱️ [Timer] useEffect triggered`, { isExecuting, isPendingConfirm });
    if (!isExecuting) {
      logger.info(`⏱️ [Timer] RESET - execution ended`);
      setElapsedTime(0);
      return;
    }
    if (isPendingConfirm) {
      logger.info(`⏱️ [Timer] PAUSED - pending confirm`);
      return;
    }
    logger.info(`⏱️ [Timer] RUNNING - starting interval`);
    // ...
  }, [isExecuting, isPendingConfirm]);
}
```

#### 日志分析

```
[13:38:47] ▶️ [Spinner] RUNNING - starting timer
[13:38:47] ⏱️ [Timer] RUNNING - starting interval
...
[13:39:42] 🎯 [StatusIndicator] isPendingConfirm changed { isPendingConfirm: true, isExecuting: true }
[13:39:42] 🔄 [Spinner] useEffect triggered { isPaused: true }
[13:39:42] ⏸️ [Spinner] PAUSED - not starting timer
[13:39:42] ⏱️ [Timer] useEffect triggered { isExecuting: true, isPendingConfirm: true }
[13:39:42] ⏱️ [Timer] PAUSED - pending confirm
```

**关键发现**：
- `isPendingConfirm` 状态成功传递到 StatusIndicator
- Spinner 和 Timer 的 useEffect 正确触发
- 定时器成功暂停

## 解决方案：添加 isPendingConfirm 状态

### 1. 扩展 ExecutionStateContext

```typescript
// execution.tsx
interface ExecutionStateContextValue {
  // 现有字段
  showThinking: boolean;
  toggleThinking: () => void;
  subscribe: (handler: ExecutionEventHandler) => () => void;
  bindManager: (manager: ExecutionStreamManager) => () => void;

  // 新增 - 等待确认状态
  isPendingConfirm: boolean;
  setIsPendingConfirm: (value: boolean) => void;
}

export function ExecutionProvider({ children }: ExecutionProviderProps) {
  const [isPendingConfirm, setIsPendingConfirm] = useState(false);

  const stateValue = useMemo<ExecutionStateContextValue>(() => ({
    showThinking,
    toggleThinking,
    subscribe,
    bindManager,
    isPendingConfirm,
    setIsPendingConfirm,
  }), [showThinking, toggleThinking, subscribe, bindManager, isPendingConfirm]);

  // ...
}
```

### 2. InputArea 同步状态

```typescript
// inputArea.tsx
export function InputArea({ onCommandPanelChange }: InputAreaProps) {
  const { setIsPendingConfirm } = useExecutionState();
  const [pendingConfirm, setPendingConfirm] = useState<ToolConfirmRequest | null>(null);

  // 同步 pendingConfirm 状态到 ExecutionContext
  useEffect(() => {
    setIsPendingConfirm(pendingConfirm !== null);
  }, [pendingConfirm, setIsPendingConfirm]);

  // ...
}
```

### 3. StatusIndicator 暂停定时器

#### Spinner 暂停

```typescript
function Spinner({ color, isPaused }: { color: string; isPaused?: boolean }) {
  const [frameIndex, setFrameIndex] = useState(0);

  useEffect(() => {
    logger.info(`🔄 [Spinner] useEffect triggered`, { isPaused });

    if (isPaused) {
      logger.info(`⏸️ [Spinner] PAUSED - not starting timer`);
      return;
    }

    logger.info(`▶️ [Spinner] RUNNING - starting timer`);
    const timer = setInterval(() => {
      setFrameIndex(prev => (prev + 1) % SPINNER_FRAMES.length);
    }, 80);

    return () => {
      logger.info(`🛑 [Spinner] cleanup - clearing timer`);
      clearInterval(timer);
    };
  }, [isPaused]);

  return <Text color={color}>{SPINNER_FRAMES[frameIndex]}</Text>;
}
```

#### 计时器暂停

```typescript
export function StatusIndicator() {
  const { isPendingConfirm } = useExecutionState();
  const [elapsedTime, setElapsedTime] = useState(0);

  // 计时器（等待确认时暂停）
  useEffect(() => {
    logger.info(`⏱️ [Timer] useEffect triggered`, { isExecuting, isPendingConfirm });

    // 执行结束时重置
    if (!isExecuting) {
      logger.info(`⏱️ [Timer] RESET - execution ended`);
      setElapsedTime(0);
      return;
    }

    // 等待确认时暂停（不重置值，保持当前时间）
    if (isPendingConfirm) {
      logger.info(`⏱️ [Timer] PAUSED - pending confirm`);
      return;
    }

    logger.info(`⏱️ [Timer] RUNNING - starting interval`);
    const interval = setInterval(() => {
      setElapsedTime(prev => prev + 1);
    }, 1000);

    return () => {
      logger.info(`⏱️ [Timer] cleanup - clearing interval`);
      clearInterval(interval);
    };
  }, [isExecuting, isPendingConfirm]);

  return (
    <Box>
      <Spinner color={colors.warning} isPaused={isPendingConfirm} />
      {/* ... */}
    </Box>
  );
}
```

#### Tip 轮换暂停

```typescript
export function StatusIndicator() {
  const [tipIndex, setTipIndex] = useState(0);

  // Tip 轮换（等待确认时暂停）
  useEffect(() => {
    if (!isExecuting || isPendingConfirm) return;

    const interval = setInterval(() => {
      setTipIndex(prev => (prev + 1) % TIPS.length);
    }, 8000);

    return () => clearInterval(interval);
  }, [isExecuting, isPendingConfirm]);

  return (
    <Box flexDirection="column">
      {/* 主状态行 */}
      <Box>
        <Spinner isPaused={isPendingConfirm} />
        <Text>{statusPhrase} ({formatTime(elapsedTime)})</Text>
      </Box>

      {/* Tip 行 - 仅在思考状态且未展开时显示 */}
      {state === 'thinking' && !showThinking && (
        <Box>
          <Text>└ Tip: {TIPS[tipIndex]}</Text>
        </Box>
      )}
    </Box>
  );
}
```

## 数据流设计

### 状态传递链路

```
InputArea (局部状态)              ExecutionContext (全局状态)
┌─────────────────────┐          ┌─────────────────────────┐
│ pendingConfirm      │ ──────▶  │ isPendingConfirm        │
│ {callId, toolName,  │          │ true/false              │
│  details, resolve}  │          └──────────┬──────────────┘
└─────────────────────┘                     │
                                           ▼
                              ┌──────────────────────────┐
                              │ StatusIndicator          │
                              │ - Spinner 暂停           │
                              │ - Timer 暂停             │
                              │ - Tip 暂停               │
                              └──────────────────────────┘
```

### 为什么不直接在 InputArea 传递？

**❌ 方案 A：通过 props 传递**
```typescript
<StatusIndicator isPendingConfirm={pendingConfirm !== null} />
```
- 问题：StatusIndicator 在 ExecutionStream 中，不是 InputArea 的子组件
- 需要 Session → ExecutionStream → StatusIndicator 层层传递 props

**✅ 方案 B：通过 Context 传递**
```typescript
// InputArea: 同步状态到 Context
setIsPendingConfirm(pendingConfirm !== null);

// StatusIndicator: 从 Context 获取
const { isPendingConfirm } = useExecutionState();
```
- 优点：跨组件共享状态，无需层层传递
- ExecutionStateContext 是低频更新的 Context，不会导致性能问题

## 关键代码文件

| 文件 | 变更内容 |
|------|---------|
| `packages/cli/src/context/execution.tsx` | 添加 `isPendingConfirm` 状态 |
| `packages/cli/src/routes/session/inputArea.tsx` | 同步 `pendingConfirm` 到 Context |
| `packages/cli/src/component/execution/StatusIndicator.tsx` | 暂停所有定时器 + 添加 debug 日志 |
| `packages/cli/src/component/panel/panel-tool-confirm.tsx` | 添加 React.memo 包裹 |

## Debug 日志的价值

### 1. 可视化状态变化

通过日志清晰看到：
- 状态何时变化
- 定时器何时启动/暂停
- 组件何时重渲染

### 2. 验证修复效果

```
[13:39:42] 🎯 [StatusIndicator] isPendingConfirm changed { isPendingConfirm: true }
[13:39:42] ⏸️ [Spinner] PAUSED - not starting timer
[13:39:42] ⏱️ [Timer] PAUSED - pending confirm
```

日志证明：
- ✅ 状态成功传递
- ✅ 定时器成功暂停

### 3. 发现隐藏问题

通过日志分析发现：
- Core 层在 `waiting_confirm` 状态时仍推送事件
- `statusPhrase` 每 3 秒变化
- 导致第三阶段需要解决的问题

## 效果验证

### 修复前
```
确认面板弹出时：
- Spinner 继续旋转 ❌
- 计时器继续计数 ❌
- Tip 继续轮换 ❌
```

### 修复后
```
确认面板弹出时：
- Spinner 暂停 ✅
- 计时器暂停（保持当前值）✅
- Tip 暂停 ✅
```

## 遗留问题

虽然定时器成功暂停，但日志分析发现：

```
[13:43:55] 📡 [ExecutionContext] Event received { eventType: "state:change", statusPhrase: "Thinking...", state: "waiting_confirm" }
[13:43:59] 📡 [ExecutionContext] Event received { eventType: "state:change", statusPhrase: "Analyzing...", state: "waiting_confirm" }
[13:44:02] 📡 [ExecutionContext] Event received { eventType: "state:change", statusPhrase: "Processing...", state: "waiting_confirm" }
```

**问题**：
- Core 层在 `waiting_confirm` 状态时仍推送 `state:change` 事件
- `statusPhrase` 每 3 秒变化
- 导致 `snapshot` 更新 → StatusIndicator 重新渲染 → 闪动

**解决**：见第三阶段

## 收获与经验

### 1. Debug 日志的重要性

**日志不是 console.log，而是结构化追踪**

```typescript
// ❌ 不推荐
console.log('Timer triggered');

// ✅ 推荐
logger.info(`⏱️ [Timer] useEffect triggered`, { isExecuting, isPendingConfirm });
```

**好处**：
- 清晰的组件标识（`[Timer]`、`[Spinner]`）
- 结构化数据（JSON 格式）
- 易于搜索和分析

### 2. 定时器暂停的正确姿势

**关键：依赖项包含暂停标志**

```typescript
// ✅ 正确
useEffect(() => {
  if (isPaused) return;  // ← 提前返回，不启动定时器

  const timer = setInterval(() => { ... }, 1000);
  return () => clearInterval(timer);
}, [isPaused]);  // ← 暂停标志变化时重新执行
```

**原理**：
- `isPaused` 从 false → true：cleanup 清除定时器，新 effect 提前返回
- `isPaused` 从 true → false：重新启动定时器

### 3. 暂停 vs 重置

**计时器应该暂停，不是重置**

```typescript
// ❌ 错误：确认时重置计时器
if (isPendingConfirm) {
  setElapsedTime(0);
  return;
}

// ✅ 正确：确认时保持当前值
if (isPendingConfirm) {
  return;  // ← 不启动新定时器，也不重置值
}
```

**用户体验**：
- 暂停：用户看到 "5s" → 确认 → 恢复后继续 "6s, 7s..."
- 重置：用户看到 "5s" → 确认 → 恢复后变成 "1s, 2s..." ❌

### 4. Context 作为状态总线

**适合跨组件共享的瞬时状态**

- `isPendingConfirm` 只在确认开始/结束时变化（低频）
- 多个组件需要这个状态（StatusIndicator、Session）
- 不需要持久化（不像 session/message 需要存储）

**放在 ExecutionStateContext 的理由**：
- 属于执行流相关的控制状态
- 和 `showThinking`、`toggleThinking` 同一类别
- 不会导致性能问题（低频更新）
