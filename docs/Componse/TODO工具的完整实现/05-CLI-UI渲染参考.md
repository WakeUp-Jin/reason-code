# 05 - CLI UI 渲染参考

> CLI 前端如何渲染 TODO 列表（仅供参考）
>
> 使用 @opentui + SolidJS 实现终端 UI

---

## 📋 说明

本文档为**可选参考内容**，主要介绍 CLI 前端如何渲染 TODO 列表。

核心实现在 Agent 端（工具定义、业务逻辑、事件总线），UI 只是消费数据的展示层。

---

## 一、技术栈

### 1.1 核心库

```json
{
  "@opentui/core": "0.1.63",    // 终端渲染引擎
  "@opentui/solid": "0.1.63",   // SolidJS 适配器
  "solid-js": "catalog:"         // 响应式框架
}
```

### 1.2 opentui 简介

opentui 是类似 Ink 的终端 UI 库，但基于 SolidJS：

- **Ink**：React for Terminal
- **opentui**：SolidJS for Terminal

---

## 二、渲染流程

### 2.1 应用启动

```typescript
// packages/opencode/src/cli/cmd/tui/app.tsx:107
render(
  () => {
    return (
      <ErrorBoundary>
        <SyncProvider>      {/* 核心：状态同步 */}
          <ThemeProvider>
            <App />
          </ThemeProvider>
        </SyncProvider>
      </ErrorBoundary>
    )
  },
  {
    targetFps: 60,       // 60 帧渲染
  }
)
```

### 2.2 状态同步

```typescript
// packages/opencode/src/cli/cmd/tui/context/sync.tsx
const [store, setStore] = createStore({
  todo: {
    [sessionID: string]: Todo[]
  }
})

// 订阅事件
case "todo.updated":
  setStore("todo", event.properties.sessionID, event.properties.todos)
  break
```

---

## 三、TODO 渲染（两个位置）

### 3.1 位置 1：主消息区域

**文件位置**：`packages/opencode/src/cli/cmd/tui/routes/session/index.tsx:1837-1863`

```typescript
ToolRegistry.register<typeof TodoWriteTool>({
  name: "todowrite",
  container: "block",  // 块级容器
  render(props) {
    const { theme } = useTheme()
    return (
      <>
        {/* 无数据时显示加载状态 */}
        <Show when={!props.input.todos?.length}>
          <ToolTitle icon="⚙" fallback="Updating todos..." when={true}>
            Updating todos...
          </ToolTitle>
        </Show>

        {/* 有数据时渲染 TODO 列表 */}
        <Show when={props.metadata.todos?.length}>
          <box>
            <For each={props.input.todos ?? []}>
              {(todo) => (
                <text style={{
                  fg: todo.status === "in_progress"
                    ? theme.success    // 进行中：绿色
                    : theme.textMuted  // 其他：灰色
                }}>
                  [{todo.status === "completed" ? "✓" : " "}] {todo.content}
                </text>
              )}
            </For>
          </box>
        </Show>
      </>
    )
  },
})
```

**渲染效果**：

```
⚙ Updating todos...

或

[✓] 读取现有认证代码
[ ] 实现 JWT token 生成
[ ] 添加登录端点测试
```

### 3.2 位置 2：Sidebar

**文件位置**：`packages/opencode/src/cli/cmd/tui/routes/session/sidebar.tsx:203-227`

```typescript
const todo = createMemo(() => sync.data.todo[props.sessionID] ?? [])

return (
  <Show when={todo().length > 0 && todo().some((t) => t.status !== "completed")}>
    <box>
      {/* 标题 + 展开/收起 */}
      <box
        flexDirection="row"
        gap={1}
        onMouseDown={() => todo().length > 2 && setExpanded("todo", !expanded.todo)}
      >
        <Show when={todo().length > 2}>
          <text fg={theme.text}>{expanded.todo ? "▼" : "▶"}</text>
        </Show>
        <text fg={theme.text}>
          <b>Todo</b>
        </text>
      </box>

      {/* TODO 列表 */}
      <Show when={todo().length <= 2 || expanded.todo}>
        <For each={todo()}>
          {(todo) => (
            <text style={{
              fg: todo.status === "in_progress"
                ? theme.success
                : theme.textMuted
            }}>
              [{todo.status === "completed" ? "✓" : " "}] {todo.content}
            </text>
          )}
        </For>
      </Show>
    </box>
  </Show>
)
```

**渲染效果**：

```
┌─────────────────────────────────────┐
│ Session Title                       │
│                                     │
│ Context                             │
│ 12,345 tokens                       │
│ 45% used                            │
│ $0.23 spent                         │
│                                     │
│ ▼ Todo                              │
│ [✓] 读取现有认证代码                │
│ [ ] 实现 JWT token 生成             │
│ [ ] 添加登录端点测试                │
└─────────────────────────────────────┘
```

---

## 四、JSX 元素

### 4.1 基本元素

```typescript
<box>           // 类似 <div>，布局容器
<text>          // 类似 <span>，文本元素
<scrollbox>     // 可滚动容器
```

### 4.2 样式属性

```typescript
<box
  backgroundColor={theme.backgroundPanel}
  width={42}
  height="100%"
  paddingTop={1}
  paddingLeft={2}
  flexDirection="row"
  gap={1}
/>

<text
  fg={theme.success}              // 前景色（文字颜色）
  style={{ fg: theme.textMuted }}  // 内联样式
>
  <b>粗体文本</b>
</text>
```

---

## 五、响应式更新

### 5.1 SolidJS 响应式

```typescript
// 1. 创建响应式数据源
const [store, setStore] = createStore({
  todo: { [sessionID]: [] }
})

// 2. 创建派生状态
const todo = createMemo(() => store.todo[sessionID] ?? [])

// 3. UI 自动更新
<For each={todo()}>
  {(item) => <TodoItem todo={item} />}
</For>
```

### 5.2 更新流程

```
Backend 事件
    ↓
setStore("todo", sessionID, todos)
    ↓
createMemo 检测变化
    ↓
<For> 组件重渲染
    ↓
opentui Diff 算法
    ↓
ANSI 转义序列
    ↓
终端显示更新
```

---

## 六、ANSI 转义序列

### 6.1 颜色渲染

```typescript
// JSX
<text fg={0x00FF00}>绿色文本</text>

// 输出
\x1b[38;2;0;255;0m绿色文本\x1b[0m
```

### 6.2 样式渲染

```typescript
// JSX
<text>
  <b>粗体</b>
</text>

// 输出
\x1b[1m粗体\x1b[0m
```

---

## 七、关键设计

### 7.1 UI 过滤机制

```typescript
export function AssistantMessageDisplay(props) {
  const filteredParts = createMemo(() => {
    return props.parts?.filter((x) => {
      // 过滤掉 todoread
      return x.type !== "tool" || x.tool !== "todoread"
    })
  })
}
```

**效果**：TodoRead 不显示在 UI

### 7.2 细粒度响应式

```typescript
// 只有 todo 变化时才重渲染，而非整个 store
const todo = createMemo(() => store.todo[sessionID] ?? [])
```

---

## 八、总结

### 8.1 UI 层职责

1. **消费数据**：从 Store 读取 TODO 数据
2. **渲染展示**：使用 JSX 渲染到终端
3. **响应更新**：监听 Store 变化自动更新

### 8.2 与 Agent 端的关系

```
Agent 端（核心）:
├── 工具定义
├── 业务逻辑
├── 事件发布
└── 数据持久化

UI 端（展示）:
├── 事件订阅
├── 状态管理
└── 渲染展示
```

**职责分离**：
- Agent 端：数据和逻辑
- UI 端：展示和交互

---

**UI 只是消费者，核心在 Agent 端！** 🎨
