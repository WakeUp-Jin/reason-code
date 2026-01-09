# ClaudeCode（Kode）参考实现分析

## 目标
分析 ClaudeCode 官方实现如何处理工具权限确认弹窗，避免 Static 区域闪动。

## Kode 项目的关键实现

### 1. 状态管理架构

#### 状态位置
```typescript
// REPL.tsx:134-136 (顶层组件)
const [toolUseConfirm, setToolUseConfirm] = useState<ToolUseConfirm | null>(null)
```

- `toolUseConfirm` 状态在 **REPL 组件内部管理**（顶层组件，类似我们的 Session）
- **不是在 Hook 中管理**

#### Hook 设计
```typescript
// useCanUseTool.ts:22-24
function useCanUseTool(
  setToolUseConfirm: SetState<ToolUseConfirm | null>,  // ← 接受 setter
): CanUseToolFn {
  return useCallback<CanUseToolFn>(
    async (tool, input, toolUseContext, assistantMessage) => {
      return new Promise(resolve => {
        // ...

        // 需要确认时：设置状态
        setToolUseConfirm({
          tool,
          description,
          input,
          onAbort() {
            resolve({ result: false, message: REJECT_MESSAGE })
          },
          onAllow(type) {
            resolve({ result: true })
          },
          onReject() {
            resolve({ result: false, message: REJECT_MESSAGE })
          },
        })
      })
    },
    [setToolUseConfirm],
  )
}
```

**关键设计**：
1. Hook **不拥有状态**，只接受 `setToolUseConfirm` 作为参数
2. 返回 Promise，将确认回调（resolve）封装在状态对象中
3. 调用方（REPL）管理状态，控制面板显示

#### Hook 调用
```typescript
// REPL.tsx:212
const canUseTool = useCanUseTool(setToolUseConfirm)

// REPL.tsx:279, 364 - 传递给 query 函数
for await (const message of query(
  [...messages, ...newMessages],
  systemPrompt,
  context,
  canUseTool,  // ← 工具权限检查函数
  { /* 其他选项 */ },
  getBinaryFeedbackResponse,
)) {
  setMessages(oldMessages => [...oldMessages, message])
}
```

### 2. 渲染结构

#### Static 区域
```typescript
// REPL.tsx:606-612
<React.Fragment key={`static-messages-${forkNumber}`}>
  <Static
    items={messagesJSX.filter(_ => _.type === 'static')}
  >
    {_ => _.jsx}
  </Static>
</React.Fragment>
```

#### 动态区域（包括确认面板）
```typescript
// REPL.tsx:613-668
{messagesJSX.filter(_ => _.type === 'transient').map(_ => _.jsx)}

<Box flexDirection="column" width="100%">
  {/* Loading Spinner */}
  {!toolJSX && !toolUseConfirm && !binaryFeedbackContext && isLoading && (
    <Spinner />
  )}

  {/* 工具 JSX（如交互式面板）*/}
  {toolJSX ? toolJSX.jsx : null}

  {/* 🔴 工具权限确认面板 */}
  {!toolJSX &&
    toolUseConfirm &&
    !isMessageSelectorVisible &&
    !binaryFeedbackContext && (
      <PermissionRequest
        toolUseConfirm={toolUseConfirm}
        onDone={() => setToolUseConfirm(null)}
        verbose={verbose}
      />
    )}

  {/* 费用提示对话框 */}
  {/* ... */}

  {/* 输入框 */}
  {!toolUseConfirm && !toolJSX?.shouldHidePromptInput && /* ... */ (
    <PromptInput /* ... */ />
  )}
</Box>
```

**关键特点**：
- 确认面板在 **Static 之外** 渲染
- 和 Spinner、ToolJSX、PromptInput 等动态内容平级
- 使用条件渲染控制显示/隐藏

### 3. messagesJSX 的依赖关系

```typescript
// REPL.tsx:475-598
const messagesJSX = useMemo(() => {
  return [
    {
      type: 'static',
      jsx: (
        <Box flexDirection="column" key={`logo${forkNumber}`}>
          <Logo mcpClients={mcpClients} isDefaultModel={isDefaultModel} />
          <ProjectOnboarding workspaceDir={getOriginalCwd()} />
        </Box>
      ),
    },
    ...reorderMessages(normalizedMessages).map(_ => {
      // ...
      const type = shouldRenderStatically(_, normalizedMessages, unresolvedToolUseIDs)
        ? 'static'
        : 'transient'

      return { type, jsx: <Box key={_.uuid}>{message}</Box> }
    }),
  ]
}, [
  forkNumber,
  normalizedMessages,
  tools,
  verbose,
  debug,
  erroredToolUseIDs,
  inProgressToolUseIDs,
  toolJSX,
  toolUseConfirm,  // ⭐ 包含 toolUseConfirm
  isMessageSelectorVisible,
  unresolvedToolUseIDs,
  mcpClients,
  isDefaultModel,
])
```

**重要发现**：
- `messagesJSX` 的依赖中**包含了 `toolUseConfirm`**
- 当 `toolUseConfirm` 变化时，`messagesJSX` 会重新计算
- 但是：
  - `shouldRenderStatically` 函数**不依赖 `toolUseConfirm`**
  - Static items 的内容可能和之前完全一样
  - 只是数组引用变了

## Kode vs 我们的项目对比

| 方面 | Kode（ClaudeCode） | 我们的当前实现 | 方案一 | 方案二 |
|------|-------------------|--------------|--------|--------|
| **toolUseConfirm 状态位置** | REPL 组件（内部 state） | useAgent hook | InputArea 组件 | useAgent hook |
| **Hook 接收 setter?** | ✅ 是（控制权传递） | ❌ 否（返回状态） | ✅ 是 | ❌ 否 |
| **确认面板渲染位置** | Static 之外（动态区域） | InputArea 内部 | InputArea 内部 | InputArea 内部 |
| **状态变化影响范围** | 只影响 REPL 组件 | useAgent + ExecutionContext 双重影响 | 只影响 InputArea | ExecutionContext |
| **REPL/Session 会重新渲染吗？** | ✅ 会 | ✅ 会 | ❌ 不会 | ✅ 会 |
| **Static 会闪动吗？** | ❌ **不会** | ✅ **会** | ❌ 不会 | ❓ 需要验证 |

## 为什么 Kode 不会闪动？

### 关键差异分析

#### 我们的问题链路
```
工具需要确认
    ↓
ToolScheduler.awaitingApproval()
    ↓
ExecutionStreamManager.emitStateChange()
    ↓ 【关键】发送 state:change 事件
ExecutionProvider.setSnapshot()
    ↓
ExecutionContext.value 变化
    ↓
Session 使用 useExecution()
    ↓
Session 重新渲染
    ↓
Static 组件重新打印
    ↓
❌ 闪动！
```

#### Kode 的链路
```
工具需要确认
    ↓
hasPermissionsToUseTool() 返回 { result: false }
    ↓
setToolUseConfirm({ ... })
    ↓
REPL.toolUseConfirm state 变化
    ↓
REPL 重新渲染
    ↓
messagesJSX 重新计算（但 static items 内容未变）
    ↓
Static 组件接收到新的 items 数组
    ↓
？？？是否重新打印？
```

### 可能的原因

#### 1. Ink Static 组件的优化
Ink 的 Static 组件可能有内部优化：
- 即使 `items` 数组引用变了
- 如果每个 item 的 `key` 和内容都没变
- React 的 diff 算法识别出无需重新打印

#### 2. Kode 没有类似 ExecutionContext 的全局状态
- Kode **没有**类似我们 `useExecution()` 的全局状态管理
- `toolUseConfirm` 是组件内部 state
- 不会触发额外的 Context 更新

#### 3. 关键区别
```typescript
// ❌ 我们的问题
Session 使用了 useExecution()
    ↓ 订阅了 ExecutionContext
每次执行事件都会调用 setSnapshot()
    ↓ 导致 Session 重新渲染

// ✅ Kode 的方案
REPL 没有订阅类似 ExecutionContext 的全局状态
    ↓
只有 toolUseConfirm 这个本地 state 变化
    ↓
REPL 重新渲染，但可能被 React/Ink 优化
```

## 核心发现

### 真正的问题根源

**不是 `useAgent.pendingConfirm` 的变化导致的闪动！**

而是：
1. `ExecutionStreamManager.emitStateChange()` 导致 `ExecutionContext.snapshot` 变化
2. `Session` 组件订阅了 `useExecution()`
3. **每个执行事件都会触发 `setSnapshot`**（execution.tsx:73）
4. 导致 Session 重新渲染
5. Static 组件重新打印

### Kode 的优势

1. **没有全局执行状态 Context**
   - 不需要像我们的 `ExecutionContext` 那样的全局状态管理
   - 所有状态都是组件内部的

2. **权限检查在工具执行前**
   - `hasPermissionsToUseTool()` 是同步检查
   - 不通过执行流事件系统

3. **确认流程是阻塞式的**
   - `canUseTool` 返回 Promise
   - 在 `query()` 函数内部等待
   - 不需要额外的状态管理

## 我们的修复方案推荐

### 方案选择

根据 Kode 的参考实现，我们应该采用 **方案一**：

#### 方案一：状态内部化（类似 Kode）

**优点**：
1. ✅ 和 Kode 的设计理念一致
2. ✅ 不会触发 Session 重新渲染
3. ✅ 和现有的 `commandPanelState` 模式一致
4. ✅ 简单直接，易于理解

**实现要点**：
```typescript
// InputArea.tsx
const [pendingConfirm, setPendingConfirm] = useState<ToolConfirmRequest | null>(null)

const handleSubmit = async (value: string) => {
  const response = await sendMessage(value, {
    onConfirmRequired: async (callId, toolName, details) => {
      return new Promise<ConfirmOutcome>((resolve) => {
        setPendingConfirm({ callId, toolName, details, resolve })
      })
    },
  })
}
```

### 方案二的问题

虽然方案二（Static 隔离）理论上可行，但：

1. ❌ **ExecutionContext 仍然会变化**
   - 每个执行事件都会调用 `setSnapshot`
   - Session 仍然会重新渲染

2. ❌ **依赖 React 优化机制**
   - 需要 `memo`、稳定选择器等复杂机制
   - 不如方案一直接

3. ❌ **和 Kode 的设计不一致**
   - Kode 使用的是状态内部化，而不是 memo 隔离

## 结论

### 推荐方案：方案一（状态内部化）

理由：
1. **和 ClaudeCode 官方实现一致**
2. **从根源上解决问题**：不触发 Session 重新渲染
3. **简单可靠**：不依赖复杂的优化机制
4. **符合 React 最佳实践**：状态应该在需要它的组件内部

### 但是...仍需解决 ExecutionContext 的问题

即使采用方案一，我们仍然面临一个问题：

**当工具执行时，`ExecutionContext.snapshot` 的变化仍然会导致 Session 重新渲染**

这是因为：
- `ToolScheduler.awaitingApproval()` 会调用 `emitStateChange()`
- `ExecutionProvider` 监听所有事件并调用 `setSnapshot()`
- `Session` 订阅了 `useExecution()`

### 终极解决方案：方案一 + ExecutionContext 优化

1. **方案一**：将 `pendingConfirm` 移到 InputArea 内部
2. **优化 ExecutionContext**：
   - 考虑是否需要在每个事件都调用 `setSnapshot`
   - 或者：让 Session 只订阅必要的状态（如 `isExecuting`），而不是整个 snapshot
   - 或者：使用 React 18 的 `useSyncExternalStore` 优化订阅

```typescript
// 可能的优化
const { isExecuting } = useExecution()  // 只订阅 isExecuting
// 而不是
const { snapshot, isExecuting } = useExecution()  // 订阅了整个 snapshot
```

## 下一步行动

1. ✅ 采用方案一，将 `pendingConfirm` 移到 InputArea
2. ⏳ 分析 `useExecution` 的订阅机制，减少不必要的重新渲染
3. ⏳ 考虑是否每个执行事件都需要调用 `setSnapshot`
