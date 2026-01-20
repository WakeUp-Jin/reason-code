# Task 工具实现细节

## 概述

Task 工具是 OpenCode 子代理系统的核心，负责创建子会话并在其中执行子代理。本文档深入解析 Task 工具的完整实现。

## 一、文件位置

- **核心实现**: `packages/opencode/src/tool/task.ts`
- **描述模板**: `packages/opencode/src/tool/task.txt`

## 二、工具定义结构

```typescript
// packages/opencode/src/tool/task.ts:14-136
export const TaskTool = Tool.define("task", async () => {
  // 1. 获取可用子代理列表（过滤 primary）
  const agents = await Agent.list()
    .then((x) => x.filter((a) => a.mode !== "primary"))

  // 2. 动态生成工具描述（包含可用子代理信息）
  const description = DESCRIPTION.replace(
    "{agents}",
    agents
      .map((a) => `- ${a.name}: ${a.description ?? "..."}`)
      .join("\n"),
  )

  // 3. 定义参数 schema
  return {
    description,
    parameters: z.object({
      description: z.string().describe("A short (3-5 words) description"),
      prompt: z.string().describe("The task for the agent to perform"),
      subagent_type: z.string().describe("The type of specialized agent"),
      session_id: z.string().describe("Existing Task session to continue").optional(),
      command: z.string().describe("The command that triggered this task").optional(),
    }),

    // 4. execute 函数
    async execute(params, ctx) { ... }
  }
})
```

### 动态描述生成

Task 工具的描述会根据可用子代理动态生成：

```typescript
// task.txt 模板
Launch a new agent to handle complex, multi-step tasks autonomously.

Available agent types and the tools they have access to:
{agents}  // 这里会被替换

When using the Task tool, you must specify a subagent_type parameter...
```

最终生成的描述示例：
```
Available agent types and the tools they have access to:
- general: General-purpose agent for researching complex questions...
- explore: Fast agent specialized for exploring codebases...
```

## 三、Execute 执行流程详解

### 步骤 1: 验证子代理

```typescript
// task.ts:32-33
const agent = await Agent.get(params.subagent_type)
if (!agent) throw new Error(`Unknown agent type: ${params.subagent_type}`)
```

验证用户指定的 `subagent_type` 是否存在。

### 步骤 2: 创建或复用子会话

```typescript
// task.ts:34-44
const session = await iife(async () => {
  // 如果提供了 session_id，尝试复用现有会话
  if (params.session_id) {
    const found = await Session.get(params.session_id).catch(() => {})
    if (found) return found
  }

  // 否则创建新的子会话
  return await Session.create({
    parentID: ctx.sessionID,  // 关键：指向父会话
    title: params.description + ` (@${agent.name} subagent)`,
  })
})
```

**关键点**:
- `parentID`: 指向父会话，建立父子关系
- `title`: 包含子代理名称，方便识别
- **会话复用**: 支持通过 `session_id` 参数继续现有子会话

### 步骤 3: 获取父消息上下文

```typescript
// task.ts:45-46
const msg = await MessageV2.get({
  sessionID: ctx.sessionID,
  messageID: ctx.messageID
})
if (msg.info.role !== "assistant") throw new Error("Not an assistant message")
```

获取父会话中触发 Task 工具的消息，用于提取模型信息。

### 步骤 4: 初始化元数据上报

```typescript
// task.ts:48-53
ctx.metadata({
  title: params.description,
  metadata: {
    sessionId: session.id,  // 立即上报子会话 ID
  },
})
```

向父会话上报初始元数据。

### 步骤 5: 实时元数据更新（核心特性）

```typescript
// task.ts:55-77
const messageID = Identifier.ascending("message")
const parts: Record<string, {
  id: string
  tool: string
  state: { status: string; title?: string }
}> = {}

// 订阅子会话的 PartUpdated 事件
const unsub = Bus.subscribe(MessageV2.Event.PartUpdated, async (evt) => {
  // 过滤：只处理子会话的事件
  if (evt.properties.part.sessionID !== session.id) return
  if (evt.properties.part.messageID === messageID) return
  if (evt.properties.part.type !== "tool") return

  // 收集工具调用信息
  const part = evt.properties.part
  parts[part.id] = {
    id: part.id,
    tool: part.tool,
    state: {
      status: part.state.status,
      title: part.state.status === "completed" ? part.state.title : undefined,
    },
  }

  // 实时更新到父会话的元数据
  ctx.metadata({
    title: params.description,
    metadata: {
      summary: Object.values(parts).sort((a, b) => a.id.localeCompare(b.id)),
      sessionId: session.id,
    },
  })
})
```

**好处**:
- UI 可以实时显示子代理正在执行的工具
- 用户可以看到子代理的进度
- 父会话的元数据会随着子会话的工具调用而更新

### 步骤 6: 模型继承

```typescript
// task.ts:79-82
const model = agent.model ?? {
  modelID: msg.info.modelID,      // 继承父消息的模型
  providerID: msg.info.providerID,
}
```

**策略**:
1. 优先使用子代理配置的模型
2. 如果子代理没有配置模型，继承父会话的模型

**好处**:
- 保持一致性：默认使用相同模型
- 灵活性：可以为子代理配置专用模型（如 haiku 加速）

### 步骤 7: 取消机制

```typescript
// task.ts:84-88
function cancel() {
  SessionPrompt.cancel(session.id)
}
ctx.abort.addEventListener("abort", cancel)
using _ = defer(() => ctx.abort.removeEventListener("abort", cancel))
```

当父会话被取消时，自动取消子会话。

### 步骤 8: 解析提示词

```typescript
// task.ts:89
const promptParts = await SessionPrompt.resolvePromptParts(params.prompt)
```

`resolvePromptParts` 会解析提示词中的特殊引用：
- 文件引用：`[[filename]]`
- 代理引用：`[[agent_name]]`
- Shell 命令：`` !`command` ``

### 步骤 9: 工具配置（关键）

```typescript
// task.ts:91-106
const config = await Config.get()
const result = await SessionPrompt.prompt({
  messageID,
  sessionID: session.id,  // 在子会话中执行
  model: {
    modelID: model.modelID,
    providerID: model.providerID,
  },
  agent: agent.name,

  // 工具配置：这是权限控制的核心
  tools: {
    todowrite: false,  // 子代理不能使用 todo
    todoread: false,
    task: false,       // 子代理不能嵌套调用 task（防止无限递归）

    // 禁用实验性的主代理专属工具
    ...Object.fromEntries(
      (config.experimental?.primary_tools ?? []).map((t) => [t, false])
    ),

    // 合并子代理自己的工具配置
    ...agent.tools,
  },

  parts: promptParts,
})
```

**工具权限控制**:
1. **强制禁用**: `todowrite`, `todoread`, `task`
2. **禁用主代理专属工具**: 通过 `primary_tools` 配置
3. **合并代理配置**: 子代理可以通过 `tools` 字段进一步限制

**防止的问题**:
- 无限递归：子代理调用 Task → Task 创建子代理 → 子代理调用 Task...
- 权限越界：子代理修改 TodoList 等主代理的状态
- 上下文混乱：子代理访问主代理专属的工具

### 步骤 10: 执行子代理

```typescript
// task.ts:92-108
const result = await SessionPrompt.prompt({
  messageID,
  sessionID: session.id,
  model,
  agent: agent.name,
  tools,
  parts: promptParts,
})
```

在子会话中执行子代理，等待完成。

### 步骤 11: 收集结果

```typescript
// task.ts:109-122
unsub()  // 取消事件订阅

// 获取子会话的所有消息
const messages = await Session.messages({ sessionID: session.id })

// 汇总所有 assistant 消息中的工具调用
const summary = messages
  .filter((x) => x.info.role === "assistant")
  .flatMap((msg) =>
    msg.parts.filter((x: any) => x.type === "tool") as MessageV2.ToolPart[]
  )
  .map((part) => ({
    id: part.id,
    tool: part.tool,
    state: {
      status: part.state.status,
      title: part.state.status === "completed" ? part.state.title : undefined,
    },
  }))
```

`summary` 包含子代理执行期间调用的所有工具及其状态。

### 步骤 12: 提取文本输出

```typescript
// task.ts:122
const text = result.parts.findLast((x) => x.type === "text")?.text ?? ""
```

从子代理的最后响应中提取文本部分。

### 步骤 13: 格式化输出

```typescript
// task.ts:124-133
const output = text + "\n\n" + [
  "<task_metadata>",
  `session_id: ${session.id}`,
  "</task_metadata>"
].join("\n")

return {
  title: params.description,
  metadata: {
    summary,       // 工具调用摘要（数组）
    sessionId: session.id,  // 子会话 ID
  },
  output,
}
```

**输出格式**:
- `output`: 文本输出 + 元数据标签
- `metadata.summary`: 工具调用摘要
- `metadata.sessionId`: 子会话 ID（用于后续复用或追溯）

## 四、参数详解

### description (必需)

```typescript
description: z.string().describe("A short (3-5 words) description of the task")
```

**用途**:
- 显示在 UI 中的任务标题
- 用于生成子会话标题

**示例**:
- "Explore codebase"
- "Review code changes"
- "Search for tests"

### prompt (必需)

```typescript
prompt: z.string().describe("The task for the agent to perform")
```

**用途**:
- 传递给子代理的完整任务描述
- 应该包含足够的上下文和详细指令

**示例**:
```
Find all TypeScript test files in the src/ directory.
For each test file, summarize what it tests and list any TODO comments.
Return a structured report with file paths and summaries.
```

### subagent_type (必需)

```typescript
subagent_type: z.string().describe("The type of specialized agent to use")
```

**用途**:
- 指定要使用的子代理名称
- 必须是可用子代理列表中的一个（mode != "primary"）

**有效值**:
- `"general"` - 通用子代理
- `"explore"` - 探索代理
- 用户自定义的 mode="subagent" 或 "all" 的代理

### session_id (可选)

```typescript
session_id: z.string().describe("Existing Task session to continue").optional()
```

**用途**:
- 复用现有子会话，实现多轮对话
- 保持子代理的上下文连续性

**使用场景**:
```typescript
// 第一次调用
const result1 = await task({
  description: "Find tests",
  prompt: "Find test files",
  subagent_type: "explore"
})

// 第二次调用，复用会话
const result2 = await task({
  description: "Analyze tests",
  prompt: "Analyze the tests you found earlier",
  subagent_type: "explore",
  session_id: result1.metadata.sessionId  // 复用会话
})
```

### command (可选)

```typescript
command: z.string().describe("The command that triggered this task").optional()
```

**用途**:
- 记录触发 Task 的命令（如 `/explore`）
- 用于日志和调试

## 五、返回值结构

```typescript
{
  title: string,        // 任务标题
  metadata: {
    summary: Array<{    // 工具调用摘要
      id: string,
      tool: string,
      state: {
        status: string,
        title?: string
      }
    }>,
    sessionId: string   // 子会话 ID
  },
  output: string        // 文本输出 + 元数据标签
}
```

### 示例返回值

```json
{
  "title": "Explore codebase",
  "metadata": {
    "summary": [
      {
        "id": "part_01HXK...",
        "tool": "glob",
        "state": {
          "status": "completed",
          "title": "Find TypeScript files"
        }
      },
      {
        "id": "part_01HXL...",
        "tool": "grep",
        "state": {
          "status": "completed",
          "title": "Search for test patterns"
        }
      }
    ],
    "sessionId": "session_01HXK..."
  },
  "output": "I found 15 test files in the src/ directory...\n\n<task_metadata>\nsession_id: session_01HXK...\n</task_metadata>"
}
```

## 六、事件订阅机制

### 订阅 PartUpdated 事件

```typescript
// task.ts:57-77
Bus.subscribe(MessageV2.Event.PartUpdated, async (evt) => {
  // 过滤条件
  if (evt.properties.part.sessionID !== session.id) return
  if (evt.properties.part.messageID === messageID) return
  if (evt.properties.part.type !== "tool") return

  // 处理逻辑
  const part = evt.properties.part
  parts[part.id] = { ... }

  // 更新元数据
  ctx.metadata({ ... })
})
```

**事件过滤**:
1. `sessionID !== session.id`: 只处理当前子会话的事件
2. `messageID === messageID`: 跳过特定消息（？）
3. `type !== "tool"`: 只关注工具调用

**事件处理**:
- 收集工具调用信息到 `parts` 对象
- 调用 `ctx.metadata()` 更新父会话的元数据

### 取消订阅

```typescript
// task.ts:109
unsub()
```

在子代理执行完成后，取消事件订阅，避免内存泄漏。

## 七、工具权限控制策略

### 默认禁用的工具

```typescript
tools: {
  todowrite: false,  // 子代理不应修改 TodoList
  todoread: false,   // 子代理不应读取 TodoList
  task: false,       // 防止无限递归
}
```

### 禁用主代理专属工具

```typescript
...Object.fromEntries(
  (config.experimental?.primary_tools ?? []).map((t) => [t, false])
)
```

通过配置 `experimental.primary_tools`，可以定义哪些工具只能主代理使用。

### 合并代理配置

```typescript
...agent.tools,  // 最后合并，优先级最高
```

子代理的 `tools` 配置会覆盖前面的默认配置。

### 配置示例

```typescript
// explore 代理的工具配置
explore: {
  tools: {
    todoread: false,
    todowrite: false,
    edit: false,    // 禁止编辑
    write: false,   // 禁止写入
    read: true,     // 允许读取
    glob: true,     // 允许文件搜索
    grep: true,     // 允许内容搜索
  }
}
```

最终生效的工具配置：
```typescript
{
  todowrite: false,  // 默认禁用
  todoread: false,   // 默认禁用
  task: false,       // 默认禁用
  edit: false,       // explore 禁用
  write: false,      // explore 禁用
  read: true,        // explore 允许
  glob: true,        // explore 允许
  grep: true,        // explore 允许
}
```

## 八、关键依赖

| 模块 | 用途 |
|------|------|
| `Session` | 会话管理（创建、获取） |
| `MessageV2` | 消息管理 |
| `Agent` | 代理信息获取 |
| `SessionPrompt` | 提示词处理和执行 |
| `Bus` | 事件总线（订阅 PartUpdated） |
| `Identifier` | ID 生成 |
| `Config` | 配置获取 |

## 九、错误处理

### 代理不存在

```typescript
const agent = await Agent.get(params.subagent_type)
if (!agent) throw new Error(`Unknown agent type: ${params.subagent_type}`)
```

抛出错误，中止执行。

### 会话获取失败

```typescript
if (params.session_id) {
  const found = await Session.get(params.session_id).catch(() => {})
  if (found) return found
}
```

静默失败，创建新会话。

### 取消执行

```typescript
ctx.abort.addEventListener("abort", cancel)
```

通过 AbortController 机制，支持取消子代理执行。

## 十、性能优化

### 事件过滤

在订阅事件时，通过多重条件快速过滤无关事件：

```typescript
if (evt.properties.part.sessionID !== session.id) return
if (evt.properties.part.messageID === messageID) return
if (evt.properties.part.type !== "tool") return
```

### 使用 defer 清理

```typescript
using _ = defer(() => ctx.abort.removeEventListener("abort", cancel))
```

利用 TypeScript 的 `using` 语法，确保清理代码一定执行。

### 批量获取消息

```typescript
const messages = await Session.messages({ sessionID: session.id })
```

一次性获取所有消息，避免多次查询。
