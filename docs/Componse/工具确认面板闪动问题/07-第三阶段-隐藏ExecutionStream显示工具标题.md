# 第三阶段：隐藏 ExecutionStream 显示工具标题

## 问题背景

第二阶段解决了定时器暂停问题后，通过日志分析发现根本问题：

**Core 层在 `waiting_confirm` 状态时仍推送 `state:change` 事件**

```
[13:43:55] 📡 [ExecutionContext] Event received {
  eventType: "state:change",
  statusPhrase: "Thinking...",
  state: "waiting_confirm"
}
[13:43:59] 📡 [ExecutionContext] Event received {
  eventType: "state:change",
  statusPhrase: "Analyzing...",
  state: "waiting_confirm"
}
[13:44:02] 📡 [ExecutionContext] Event received {
  eventType: "state:change",
  statusPhrase: "Processing...",
  state: "waiting_confirm"
}
```

**问题链路**：
```
Core 层推送 state:change (每 3 秒)
  ↓
ExecutionContext 更新 snapshot (statusPhrase 变化)
  ↓
StatusIndicator 订阅 snapshot → 重新渲染
  ↓
Ink 检测到组件更新 → 重绘
  ↓
用户看到闪动 ❌
```

## 问题分析

### 为什么暂停定时器还会闪动？

**第二阶段修复的**：StatusIndicator 内部的定时器（Spinner、Timer、Tip）

**第二阶段没修复的**：StatusIndicator 组件本身的重渲染

```typescript
export function StatusIndicator() {
  const snapshot = useExecutionSnapshot();  // ← 订阅 snapshot
  const { stats, statusPhrase, state } = snapshot;

  return (
    <Box>
      <Spinner isPaused={isPendingConfirm} />  {/* ← 定时器暂停了 ✅ */}
      <Text>{statusPhrase}</Text>  {/* ← 但组件仍重渲染 ❌ */}
    </Box>
  );
}
```

**关键问题**：
- snapshot 每 3 秒更新（statusPhrase 变化）
- StatusIndicator 重新渲染
- 即使 Spinner 暂停，整个组件重绘仍会导致闪动

### 为什么不在 Core 层修复？

**原因**：
1. Core 层是纯业务逻辑，不应该为 UI 层的渲染问题修改
2. `statusPhrase` 轮换是 Core 层的正常行为（让用户知道 AI 在思考）
3. 修改 Core 层会影响所有使用它的 UI（未来的 Web、Desktop 等）

**正确做法**：在 CLI 的 UI 层解决

## 解决方案：隐藏 ExecutionStream，显示静态工具标题

### 设计思路

**参考 ToolMessage 组件的显示方式**：

```typescript
// tool-message.tsx
export function ToolMessage({ message }: ToolMessageProps) {
  return (
    <Box>
      <Text color={colors.warning}>● </Text>
      <Text bold>{message.toolName}</Text>
      <Text color={colors.textMuted}> ({message.fileName}) · 0.5s</Text>
    </Box>
  );
}
```

**效果**：
```
正常执行时：
⠋ Thinking... (5s · 1234 tokens)
└ Tip: Press Ctrl+T to toggle thinking display

确认时：
○ WriteFile (test.js)          ← 静态工具标题（完全不会重渲染）
┌─────────────────────────────
│ Overwrite file
│ ...
└─────────────────────────────
```

**优点**：
- 工具标题不依赖 `snapshot`，不会因 `statusPhrase` 变化而重渲染
- 给用户清晰的提示：当前在等待确认哪个工具
- 视觉上完全静止，无任何闪动

## 实施步骤

### 步骤 1：扩展 ExecutionStateContext 添加工具信息

```typescript
// execution.tsx

/** 确认中的工具信息 */
interface PendingToolInfo {
  toolName: string;
  paramsSummary?: string;
}

interface ExecutionStateContextValue {
  // 现有字段
  showThinking: boolean;
  toggleThinking: () => void;
  subscribe: (handler: ExecutionEventHandler) => () => void;
  bindManager: (manager: ExecutionStreamManager) => () => void;
  isPendingConfirm: boolean;
  setIsPendingConfirm: (value: boolean) => void;

  // 新增 - 确认中的工具信息
  pendingToolInfo: PendingToolInfo | null;
  setPendingToolInfo: (info: PendingToolInfo | null) => void;
}

export function ExecutionProvider({ children }: ExecutionProviderProps) {
  const [isPendingConfirm, setIsPendingConfirm] = useState(false);
  const [pendingToolInfo, setPendingToolInfo] = useState<PendingToolInfo | null>(null);

  const stateValue = useMemo<ExecutionStateContextValue>(() => ({
    showThinking,
    toggleThinking,
    subscribe,
    bindManager,
    isPendingConfirm,
    setIsPendingConfirm,
    pendingToolInfo,
    setPendingToolInfo,
  }), [showThinking, toggleThinking, subscribe, bindManager, isPendingConfirm, pendingToolInfo]);

  // ...
}
```

**关键点**：
- `pendingToolInfo` 放在 `ExecutionStateContext`（低频更新）
- 只在确认开始/结束时变化，不会导致性能问题
- 不放在 `ExecutionSnapshotContext`（高频更新），避免影响性能

### 步骤 2：InputArea 同步工具信息到 Context

```typescript
// inputArea.tsx

/** 从 details 中提取参数摘要 */
function getParamsSummary(details: ConfirmDetails): string | undefined {
  switch (details.type) {
    case 'info':
      return details.fileName;  // Write: 文件名
    case 'edit':
      return details.filePath;  // Edit: 文件路径
    case 'exec':
      return details.command;   // Bash: 命令
    default:
      return undefined;
  }
}

export function InputArea({ onCommandPanelChange }: InputAreaProps) {
  const { setIsPendingConfirm, setPendingToolInfo } = useExecutionState();
  const [pendingConfirm, setPendingConfirm] = useState<ToolConfirmRequest | null>(null);

  // 同步 pendingConfirm 状态到 ExecutionContext
  useEffect(() => {
    setIsPendingConfirm(pendingConfirm !== null);
    if (pendingConfirm) {
      const paramsSummary = getParamsSummary(pendingConfirm.details);
      setPendingToolInfo({
        toolName: pendingConfirm.toolName,
        paramsSummary,
      });
    } else {
      setPendingToolInfo(null);
    }
  }, [pendingConfirm, setIsPendingConfirm, setPendingToolInfo]);

  // ...
}
```

**数据流**：
```
InputArea (局部状态)              ExecutionContext (全局状态)
┌─────────────────────┐          ┌─────────────────────────┐
│ pendingConfirm      │ ──────▶  │ isPendingConfirm        │ → StatusIndicator 暂停定时器
│ {callId, toolName,  │          │ pendingToolInfo         │ → Session 显示工具标题
│  details, resolve}  │          │ {toolName, paramsSummary}│
└─────────────────────┘          └─────────────────────────┘
```

### 步骤 3：Session 条件渲染工具标题

```typescript
// session/index.tsx

export function Session() {
  const { colors } = useTheme();
  const isExecuting = useIsExecuting();
  const { isPendingConfirm, pendingToolInfo } = useExecutionState();

  return (
    <>
      <Static items={staticItems}>...</Static>

      {/* 确认时：显示静态工具标题（不会因 snapshot 变化而重渲染） */}
      {isExecuting && isPendingConfirm && pendingToolInfo && (
        <Box paddingLeft={2} paddingRight={2}>
          <Text color={colors.warning}>○ </Text>
          <Text color={colors.text} bold>{pendingToolInfo.toolName}</Text>
          {pendingToolInfo.paramsSummary && (
            <Text color={colors.textMuted}> ({pendingToolInfo.paramsSummary})</Text>
          )}
        </Box>
      )}

      {/* 正常执行：显示执行流 */}
      {isExecuting && !isPendingConfirm && (
        <Box paddingLeft={2} paddingRight={2}>
          <ExecutionStream />
        </Box>
      )}

      {/* ... */}
    </>
  );
}
```

**优雅重构**：用户建议将嵌套三元表达式改为两个独立条件判断

```typescript
// ❌ 修改前（嵌套三元表达式）
{isExecuting && (
  isPendingConfirm && pendingToolInfo ? (
    <Box>工具标题</Box>
  ) : (
    <Box><ExecutionStream /></Box>
  )
)}

// ✅ 修改后（独立条件）
{isExecuting && isPendingConfirm && pendingToolInfo && <Box>工具标题</Box>}
{isExecuting && !isPendingConfirm && <Box><ExecutionStream /></Box>}
```

**优点**：
- 更清晰易读
- 符合 React 最佳实践
- 条件逻辑一目了然

## 关键代码文件

| 文件 | 变更内容 |
|------|---------|
| `packages/cli/src/context/execution.tsx` | 添加 `PendingToolInfo` 接口和状态 |
| `packages/cli/src/routes/session/inputArea.tsx` | 添加 `getParamsSummary()` 辅助函数 + 同步工具信息 |
| `packages/cli/src/routes/session/index.tsx` | 条件渲染工具标题 vs ExecutionStream |

## 架构设计亮点

### 1. 工具信息的提取逻辑

**从 `ConfirmDetails` 中提取关键信息**：

```typescript
function getParamsSummary(details: ConfirmDetails): string | undefined {
  switch (details.type) {
    case 'info':
      return details.fileName;  // Write: test.js
    case 'edit':
      return details.filePath;  // Edit: /path/to/file
    case 'exec':
      return details.command;   // Bash: npm install
    default:
      return undefined;
  }
}
```

**为什么不直接传递整个 `details`？**
- `details` 包含大量信息（contentPreview、panelTitle 等）
- Session 只需要工具名 + 简短摘要
- 减少 Context 中的数据量

### 2. 状态分层的完整性

```
ExecutionStateContext (低频)
├── showThinking: boolean
├── isPendingConfirm: boolean         ← 第二阶段添加
├── pendingToolInfo: PendingToolInfo  ← 第三阶段添加
└── 控制方法...

ExecutionIsExecutingContext (极低频)
└── isExecuting: boolean

ExecutionSnapshotContext (高频)
└── snapshot: ExecutionSnapshot
```

**设计原则**：
- 确认相关的状态都放在 `ExecutionStateContext`（低频）
- 避免放在 `ExecutionSnapshotContext`（高频），影响性能

### 3. 组件渲染优化

**确认时的渲染链路**：

```
正常执行时：
Core 推送事件 → snapshot 更新 → ExecutionStream 重渲染 ✅

确认时：
Core 推送事件 → snapshot 更新 → （ExecutionStream 隐藏）→ 无渲染 ✅
工具标题 ← pendingToolInfo（不变）→ 无渲染 ✅
```

**关键**：
- 工具标题组件不依赖 `snapshot`
- 只依赖 `pendingToolInfo`（确认期间不变）
- 完全避免了 Core 层事件导致的重渲染

## 效果验证

### 修复前

```
确认面板显示时：
⠋ Thinking... (5s · 1234 tokens)    ← snapshot 每 3 秒更新
└ Tip: ...                          ← statusPhrase 变化
┌─────────────────────────────      ← 整个区域频繁重渲染
│ Overwrite file                    ← 闪动 ❌
│ ...
└─────────────────────────────
```

### 修复后

```
确认面板显示时：
○ WriteFile (test.js)               ← 静态，不依赖 snapshot
┌─────────────────────────────      ← 完全静止
│ Overwrite file                    ← 无闪动 ✅
│ ...
└─────────────────────────────
```

## 完整数据流

### 确认开始

```
1. Agent 调用 onConfirmRequired
   ↓
2. InputArea 设置 pendingConfirm
   ↓
3. useEffect 同步到 Context
   - setIsPendingConfirm(true)
   - setPendingToolInfo({ toolName, paramsSummary })
   ↓
4. Session 接收到状态变化
   - isPendingConfirm: true
   - pendingToolInfo: { toolName: "WriteFile", paramsSummary: "test.js" }
   ↓
5. Session 重新渲染（一次）
   - 隐藏 ExecutionStream
   - 显示工具标题
   ↓
6. 用户看到：
   ○ WriteFile (test.js)
   ┌─────────────────────
   │ Overwrite file
   └─────────────────────
```

### 确认期间

```
Core 层推送 state:change (每 3 秒)
   ↓
snapshot 更新 (statusPhrase 变化)
   ↓
StatusIndicator 订阅 snapshot
   ↓
但 StatusIndicator 已隐藏 → 无影响 ✅
工具标题不依赖 snapshot → 无重渲染 ✅
   ↓
用户看到：完全静止的画面
```

### 确认结束

```
1. 用户点击按钮 → resolve(outcome)
   ↓
2. InputArea 清除 pendingConfirm
   ↓
3. useEffect 同步到 Context
   - setIsPendingConfirm(false)
   - setPendingToolInfo(null)
   ↓
4. Session 重新渲染（一次）
   - 隐藏工具标题
   - 显示 ExecutionStream
   ↓
5. 用户看到：执行流恢复显示
```

## 收获与经验

### 1. 问题定位的层次性

**从表象到本质的三层递进**：

| 阶段 | 问题表象 | 根本原因 | 解决方案 |
|------|---------|---------|---------|
| 第一阶段 | 每 3.5 秒闪动 | Session 订阅 snapshot，statusPhrase 变化导致重渲染 | Context 分层，Session 只订阅 isExecuting |
| 第二阶段 | 确认时仍有视觉变化 | StatusIndicator 的定时器在确认时仍运行 | 添加 isPendingConfirm，暂停定时器 |
| 第三阶段 | 确认时仍闪动 | Core 层持续推送事件，StatusIndicator 重渲染 | 隐藏 ExecutionStream，显示静态工具标题 |

**关键**：
- 每次修复都解决了一个层次的问题
- 但同时发现了更深层的问题
- 最终找到了根本原因（Core 层持续推送事件）

### 2. 分层架构的价值

**UI 层不应该依赖业务层的实现细节**

- Core 层推送事件是正常行为
- 但 UI 层不应该被动承受
- 应该在 UI 层设计合适的抽象和隔离

**解决方案**：
- 确认时隐藏依赖 snapshot 的组件（ExecutionStream）
- 显示不依赖 snapshot 的静态组件（工具标题）

### 3. Debug 日志驱动开发

**日志帮助发现问题链路**：

```
[13:43:55] 📡 [ExecutionContext] Event received { statusPhrase: "Thinking..." }
[13:43:59] 📡 [ExecutionContext] Event received { statusPhrase: "Analyzing..." }
```

**关键发现**：
- Core 层在 `waiting_confirm` 状态时仍推送事件
- 这是第一、二阶段都没注意到的根本问题
- 日志让问题可视化

### 4. 用户体验的细节

**确认时应该完全静止**：
- ❌ Spinner 旋转 → 让用户分心
- ❌ 计时器跳动 → 给用户压力
- ❌ 闪动 → 影响阅读确认内容
- ✅ 完全静止 → 让用户专注于确认决策

### 5. 代码可读性优化

**用户建议的重构**：

```typescript
// ❌ 嵌套三元表达式
{isExecuting && (
  isPendingConfirm && pendingToolInfo ? (
    <Box>工具标题</Box>
  ) : (
    <Box><ExecutionStream /></Box>
  )
)}

// ✅ 独立条件判断
{isExecuting && isPendingConfirm && pendingToolInfo && <Box>工具标题</Box>}
{isExecuting && !isPendingConfirm && <Box><ExecutionStream /></Box>}
```

**优点**：
- 更符合 React 最佳实践
- 条件逻辑一目了然
- 易于维护和修改

### 6. Context 的合理使用

**什么状态适合放在 Context？**

- ✅ 跨组件共享的状态（多个组件需要）
- ✅ 低频更新的状态（避免性能问题）
- ✅ 瞬时状态（不需要持久化）

**`pendingToolInfo` 为什么适合？**
- Session 需要显示工具标题
- 只在确认开始/结束时变化（低频）
- 不需要持久化到磁盘

## 性能分析

### 渲染次数对比

**修复前（确认期间 10 秒）**：

| 组件 | 渲染次数 | 原因 |
|------|---------|------|
| Session | 3-4 次 | snapshot 更新（statusPhrase 每 3 秒变化） |
| ExecutionStream | 3-4 次 | 父组件重渲染 |
| StatusIndicator | 3-4 次 | snapshot 更新 |
| **总计** | **9-12 次** | ❌ |

**修复后（确认期间 10 秒）**：

| 组件 | 渲染次数 | 原因 |
|------|---------|------|
| Session | 2 次 | 确认开始/结束各 1 次 |
| 工具标题 | 2 次 | 确认开始/结束各 1 次 |
| ExecutionStream | 0 次 | 已隐藏 |
| StatusIndicator | 0 次 | 已隐藏 |
| **总计** | **4 次** | ✅ |

**性能提升**：渲染次数减少 **60-70%**

## 未来优化空间

### 1. 提取工具标题组件

```typescript
// components/PendingToolTitle.tsx
interface PendingToolTitleProps {
  toolInfo: PendingToolInfo;
}

export const PendingToolTitle = React.memo(function PendingToolTitle({
  toolInfo
}: PendingToolTitleProps) {
  const { colors } = useTheme();
  return (
    <Box paddingLeft={2} paddingRight={2}>
      <Text color={colors.warning}>○ </Text>
      <Text color={colors.text} bold>{toolInfo.toolName}</Text>
      {toolInfo.paramsSummary && (
        <Text color={colors.textMuted}> ({toolInfo.paramsSummary})</Text>
      )}
    </Box>
  );
});
```

**优点**：
- 更清晰的职责分离
- 可复用（未来可能在其他地方显示工具标题）
- React.memo 优化（props 不变时不重渲染）

### 2. 更丰富的工具信息显示

```typescript
// 显示工具分类
○ WriteFile · filesystem (test.js)

// 显示确认原因
○ WriteFile (test.js)
  ℹ️ This file already exists

// 显示工具图标（根据 category）
📁 WriteFile (test.js)
⚙️ Bash (npm install)
✏️ EditFile (src/app.ts)
```

### 3. 确认时显示更多上下文

```typescript
// 当前确认的工具
○ WriteFile (test.js)

// 队列中等待的工具（如果有）
  ⏳ Next: EditFile (src/app.ts)
  ⏳ Next: Bash (npm install)
```

## 总结

第三阶段的核心思路：**隐藏依赖 snapshot 的组件，显示静态组件**

- ✅ 彻底解决了 Core 层持续推送事件导致的闪动
- ✅ 改善了用户体验（确认时完全静止）
- ✅ 提升了性能（渲染次数减少 60-70%）
- ✅ 架构更清晰（UI 层不依赖业务层的实现细节）

这是三个阶段中最关键的一步，找到了问题的根本原因并提供了优雅的解决方案。
