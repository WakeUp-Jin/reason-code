# SubtaskPart 机制详解

## 概述

SubtaskPart 是一种特殊的消息部分（Message Part），用于在命令系统中自动触发子代理执行。它提供了一种**声明式**的方式来调用 Task 工具，区别于 LLM 主动调用。

## 一、SubtaskPart 定义

### 数据结构

```typescript
// packages/opencode/src/session/message-v2.ts:158-165
export const SubtaskPart = PartBase.extend({
  type: z.literal("subtask"),
  prompt: z.string(),      // 任务提示词
  description: z.string(), // 短描述（3-5 词）
  agent: z.string(),       // 子代理名称
  command: z.string().optional(),  // 触发的命令
})

export type SubtaskPart = z.infer<typeof SubtaskPart>
```

### 字段说明

| 字段 | 类型 | 必需 | 说明 |
|------|------|------|------|
| `type` | `"subtask"` | ✅ | 固定值，标识为 subtask 类型 |
| `prompt` | `string` | ✅ | 传递给子代理的完整任务描述 |
| `description` | `string` | ✅ | 短描述，用于 UI 显示 |
| `agent` | `string` | ✅ | 要调用的子代理名称 |
| `command` | `string` | ❌ | 触发此 subtask 的命令（如 `/explore`） |

## 二、SubtaskPart 的创建

### 创建时机

SubtaskPart 在 `SessionPrompt.command()` 函数中创建，根据代理模式和命令配置决定是否创建。

### 创建条件

```typescript
// packages/opencode/src/session/prompt.ts:1352-1364
const parts =
  (agent.mode === "subagent" && command.subtask !== false) ||
  command.subtask === true
    ? [
        {
          type: "subtask" as const,
          agent: agent.name,
          description: command.description ?? "",
          command: input.command,
          prompt: await resolvePromptParts(template)
            .then((x) => x.find((y) => y.type === "text")?.text ?? ""),
        },
      ]
    : await resolvePromptParts(template)
```

**条件分析**:

1. **自动创建**: `agent.mode === "subagent" && command.subtask !== false`
   - 代理模式是 `subagent`
   - 命令没有明确设置 `subtask: false`
   - **结果**: 创建 SubtaskPart

2. **强制创建**: `command.subtask === true`
   - 命令明确设置 `subtask: true`
   - 无论代理是什么模式
   - **结果**: 创建 SubtaskPart

3. **不创建**: 其他情况
   - **结果**: 创建普通的 TextPart/FilePart

### 创建示例

#### 示例 1: 子代理命令（自动创建）

```typescript
// .opencode/command/explore.md
{
  "agent": "explore",      // mode: "subagent"
  "description": "Explore codebase",
  "template": "Find all $1 in the codebase"
}

// 用户输入: /explore TypeScript files
// → agent.mode === "subagent"
// → command.subtask !== false (未设置)
// → 创建 SubtaskPart
{
  type: "subtask",
  agent: "explore",
  description: "Explore codebase",
  command: "/explore",
  prompt: "Find all TypeScript files in the codebase"
}
```

#### 示例 2: 强制 subtask（命令配置）

```typescript
// .opencode/command/review.md
{
  "agent": "build",        // mode: "primary"
  "subtask": true,         // 强制使用 subtask
  "description": "Review code",
  "template": "Review the changes in $1"
}

// 用户输入: /review src/app.ts
// → command.subtask === true
// → 创建 SubtaskPart
{
  type: "subtask",
  agent: "build",  // 即使是 primary 代理
  description: "Review code",
  command: "/review",
  prompt: "Review the changes in src/app.ts"
}
```

#### 示例 3: 禁用 subtask

```typescript
// .opencode/command/custom.md
{
  "agent": "explore",      // mode: "subagent"
  "subtask": false,        // 明确禁用
  "description": "Custom task",
  "template": "Do $1"
}

// 用户输入: /custom something
// → command.subtask === false
// → 不创建 SubtaskPart，创建普通 parts
```

## 三、SubtaskPart 的执行

### 执行位置

SubtaskPart 在 `SessionPrompt.loop()` 函数的主循环中被检测和执行。

### 执行流程

```typescript
// packages/opencode/src/session/prompt.ts:230-563
export const loop = fn(Identifier.schema("session"), async (sessionID) => {
  while (true) {
    // 1. 获取消息流
    let msgs = await MessageV2.filterCompacted(MessageV2.stream(sessionID))

    // 2. 收集待处理的 tasks
    let tasks: (MessageV2.CompactionPart | MessageV2.SubtaskPart)[] = []
    for (let i = msgs.length - 1; i >= 0; i--) {
      const msg = msgs[i]
      // ...
      const task = msg.parts.filter((part) =>
        part.type === "compaction" || part.type === "subtask"
      )
      if (task && !lastFinished) {
        tasks.push(...task)
      }
    }

    // 3. 处理 subtask
    const task = tasks.pop()
    if (task?.type === "subtask") {
      // 执行 subtask...
    }
  }
})
```

### 详细执行步骤

#### 步骤 1: 初始化 TaskTool

```typescript
// prompt.ts:291
const taskTool = await TaskTool.init()
```

#### 步骤 2: 创建 Assistant 消息

```typescript
// prompt.ts:292-315
const assistantMessage = (await Session.updateMessage({
  id: Identifier.ascending("message"),
  role: "assistant",
  parentID: lastUser.id,
  sessionID,
  mode: task.agent,      // 使用 subtask 指定的代理
  agent: task.agent,
  path: {
    cwd: Instance.directory,
    root: Instance.worktree,
  },
  cost: 0,
  tokens: {
    input: 0,
    output: 0,
    reasoning: 0,
    cache: { read: 0, write: 0 },
  },
  modelID: model.id,
  providerID: model.providerID,
  time: {
    created: Date.now(),
  },
})) as MessageV2.Assistant
```

**关键点**: 这个 assistant 消息的 `agent` 字段设置为 `task.agent`（子代理名称）。

#### 步骤 3: 创建 Tool Part

```typescript
// prompt.ts:316-335
let part = (await Session.updatePart({
  id: Identifier.ascending("part"),
  messageID: assistantMessage.id,
  sessionID: assistantMessage.sessionID,
  type: "tool",
  callID: ulid(),
  tool: TaskTool.id,  // "task"
  state: {
    status: "running",
    input: {
      prompt: task.prompt,
      description: task.description,
      subagent_type: task.agent,
      command: task.command,
    },
    time: {
      start: Date.now(),
    },
  },
})) as MessageV2.ToolPart
```

**关键点**:
- `tool`: 设置为 `"task"`
- `state.input`: 包含 SubtaskPart 的所有字段

#### 步骤 4: 触发插件钩子（before）

```typescript
// prompt.ts:336-350
const taskArgs = {
  prompt: task.prompt,
  description: task.description,
  subagent_type: task.agent,
  command: task.command,
}

await Plugin.trigger(
  "tool.execute.before",
  {
    tool: "task",
    sessionID,
    callID: part.id,
  },
  { args: taskArgs },
)
```

#### 步骤 5: 执行 TaskTool

```typescript
// prompt.ts:351-373
let executionError: Error | undefined
const result = await taskTool
  .execute(taskArgs, {
    agent: task.agent,
    messageID: assistantMessage.id,
    sessionID: sessionID,
    abort,
    async metadata(input) {
      await Session.updatePart({
        ...part,
        type: "tool",
        state: {
          ...part.state,
          ...input,
        },
      } satisfies MessageV2.ToolPart)
    },
  })
  .catch((error) => {
    executionError = error
    log.error("subtask execution failed", {
      error,
      agent: task.agent,
      description: task.description
    })
    return undefined
  })
```

**关键点**:
- 通过 `metadata` 回调实时更新 part 的状态
- 捕获错误，不中断循环

#### 步骤 6: 触发插件钩子（after）

```typescript
// prompt.ts:374-382
await Plugin.trigger(
  "tool.execute.after",
  {
    tool: "task",
    sessionID,
    callID: part.id,
  },
  result,
)
```

#### 步骤 7: 更新 Assistant 消息状态

```typescript
// prompt.ts:383-385
assistantMessage.finish = "tool-calls"
assistantMessage.time.completed = Date.now()
await Session.updateMessage(assistantMessage)
```

#### 步骤 8: 更新 Tool Part 状态

成功情况：
```typescript
// prompt.ts:386-402
if (result && part.state.status === "running") {
  await Session.updatePart({
    ...part,
    state: {
      status: "completed",
      input: part.state.input,
      title: result.title,
      metadata: result.metadata,
      output: result.output,
      attachments: result.attachments,
      time: {
        ...part.state.time,
        end: Date.now(),
      },
    },
  } satisfies MessageV2.ToolPart)
}
```

失败情况：
```typescript
// prompt.ts:403-417
if (!result) {
  await Session.updatePart({
    ...part,
    state: {
      status: "error",
      error: executionError
        ? `Tool execution failed: ${executionError.message}`
        : "Tool execution failed",
      time: {
        start: part.state.status === "running" ? part.state.time.start : Date.now(),
        end: Date.now(),
      },
      metadata: part.metadata,
      input: part.state.input,
    },
  } satisfies MessageV2.ToolPart)
}
```

#### 步骤 9: 添加合成用户消息

```typescript
// prompt.ts:419-440
const summaryUserMsg: MessageV2.User = {
  id: Identifier.ascending("message"),
  sessionID,
  role: "user",
  time: {
    created: Date.now(),
  },
  agent: lastUser.agent,
  model: lastUser.model,
}
await Session.updateMessage(summaryUserMsg)

await Session.updatePart({
  id: Identifier.ascending("part"),
  messageID: summaryUserMsg.id,
  sessionID,
  type: "text",
  text: "Summarize the task tool output above and continue with your task.",
  synthetic: true,  // 标记为合成消息
} satisfies MessageV2.TextPart)
```

**目的**: 防止某些推理模型（如 Gemini）因为缺少 user 消息而报错。

#### 步骤 10: 继续循环

```typescript
// prompt.ts:442
continue
```

继续主循环，处理下一条消息或进入正常的 LLM 处理流程。

## 四、SubtaskPart vs 直接调用 Task

### 对比表

| 维度 | SubtaskPart | 直接调用 Task |
|------|-------------|--------------|
| **触发方式** | 命令系统自动创建 | LLM 主动调用 |
| **创建位置** | `SessionPrompt.command()` | LLM 响应中的 `tool_use` |
| **执行位置** | `SessionPrompt.loop()` 开头 | `SessionProcessor` 处理工具调用 |
| **使用场景** | `/command` 触发子代理 | 主代理需要委派任务 |
| **需要 LLM 决策** | ❌ 直接执行 | ✅ LLM 决定是否调用 |
| **消息流** | User → SubtaskPart → Task执行 | User → LLM推理 → Task调用 |
| **适用代理** | 任何代理（根据条件） | 只有非 primary 代理 |

### 调用路径对比

**SubtaskPart 路径**:
```
用户输入 /explore find tests
    ↓
SessionPrompt.command()
    ↓
判断条件：agent.mode === "subagent"
    ↓
创建 SubtaskPart
    ↓
SessionPrompt.prompt() 创建用户消息
    ↓
SessionPrompt.loop() 主循环
    ↓
检测到 SubtaskPart
    ↓
直接执行 TaskTool.execute()
    ↓
创建子会话，执行子代理
    ↓
返回结果，添加合成用户消息
    ↓
继续循环
```

**直接调用 Task 路径**:
```
用户输入普通消息
    ↓
SessionPrompt.prompt() 创建用户消息
    ↓
SessionPrompt.loop() 主循环
    ↓
正常 LLM 处理
    ↓
LLM 返回 tool_use: task
    ↓
SessionProcessor 处理工具调用
    ↓
执行 TaskTool.execute()
    ↓
创建子会话，执行子代理
    ↓
返回结果给 LLM
    ↓
LLM 继续处理
```

## 五、消息结构示例

### SubtaskPart 在消息中的结构

```typescript
// 用户消息
{
  info: {
    id: "message_01HXK...",
    role: "user",
    sessionID: "session_01HXJ...",
    agent: "build",
    model: { providerID: "anthropic", modelID: "claude-sonnet-4" }
  },
  parts: [
    {
      id: "part_01HXK...",
      type: "subtask",
      messageID: "message_01HXK...",
      sessionID: "session_01HXJ...",
      agent: "explore",
      description: "Explore codebase",
      prompt: "Find all TypeScript test files",
      command: "/explore"
    }
  ]
}
```

### 执行后的 Assistant 消息

```typescript
// Assistant 消息（执行 Task 工具）
{
  info: {
    id: "message_01HXL...",
    role: "assistant",
    sessionID: "session_01HXJ...",
    parentID: "message_01HXK...",
    agent: "explore",  // 注意：这里是子代理名称
    finish: "tool-calls",
    cost: 0,
    tokens: { input: 0, output: 0, ... }
  },
  parts: [
    {
      id: "part_01HXL...",
      type: "tool",
      messageID: "message_01HXL...",
      sessionID: "session_01HXJ...",
      tool: "task",
      callID: "01HXL...",
      state: {
        status: "completed",
        input: {
          prompt: "Find all TypeScript test files",
          description: "Explore codebase",
          subagent_type: "explore",
          command: "/explore"
        },
        output: "I found 15 test files...\n\n<task_metadata>...",
        title: "Explore codebase",
        metadata: {
          summary: [...],
          sessionId: "session_01HXM..."
        },
        time: {
          start: 1234567890,
          end: 1234567900
        }
      }
    }
  ]
}
```

### 合成用户消息

```typescript
// 合成的用户消息
{
  info: {
    id: "message_01HXM...",
    role: "user",
    sessionID: "session_01HXJ...",
    agent: "build",
    model: { providerID: "anthropic", modelID: "claude-sonnet-4" }
  },
  parts: [
    {
      id: "part_01HXM...",
      type: "text",
      messageID: "message_01HXM...",
      sessionID: "session_01HXJ...",
      text: "Summarize the task tool output above and continue with your task.",
      synthetic: true  // 标记为合成
    }
  ]
}
```

## 六、合成用户消息的作用

### 为什么需要合成消息

某些 LLM（如 Gemini）要求消息必须遵循严格的 user → assistant → user → assistant 模式。

**问题场景**:
```
User: /explore find tests  (用户消息)
  → SubtaskPart 执行
Assistant: (Task 工具执行结果)  (assistant 消息)
Assistant: (接下来的 LLM 响应)  (assistant 消息) ❌ 两个连续的 assistant
```

**解决方案**:
```
User: /explore find tests
  → SubtaskPart 执行
Assistant: (Task 工具执行结果)
User: (合成消息："Summarize...")  ← 插入合成用户消息
Assistant: (接下来的 LLM 响应)  ✅ 符合模式
```

### 合成消息的特征

```typescript
{
  synthetic: true,  // 标记为合成
  text: "Summarize the task tool output above and continue with your task."
}
```

- `synthetic: true`: 标记为系统生成的消息
- 提示 LLM 总结 Task 输出并继续任务

## 七、SubtaskPart 的优势

### 1. 声明式调用

不需要 LLM 决策，直接执行子代理。

**优势**:
- 更快：省略 LLM 推理步骤
- 更可控：用户明确知道会执行什么
- 更便宜：减少 token 消耗

### 2. 命令系统集成

与 `/command` 系统无缝集成。

**示例**:
```bash
/explore find all tests
/review check this file
```

### 3. 灵活配置

通过命令的 `subtask` 字段，可以灵活控制是否使用 SubtaskPart。

```typescript
// 命令配置
{
  "agent": "build",
  "subtask": true,   // 强制使用 subtask
  "template": "..."
}
```

### 4. 统一的执行路径

SubtaskPart 最终也是通过 TaskTool 执行，与直接调用 Task 工具共享相同的执行逻辑。

## 八、注意事项

### 1. 代理模式要求

SubtaskPart 可以指定任何代理，但推荐使用 `mode: "subagent"` 或 `mode: "all"` 的代理。

**不推荐**:
```typescript
{
  type: "subtask",
  agent: "build",  // mode: "primary"
  ...
}
```

原因：主代理设计用于用户交互，不适合作为子任务执行。

### 2. 合成消息的必要性

即使看起来多余，合成用户消息对于某些模型是必需的。

**不要删除**这段代码：
```typescript
// prompt.ts:419-440
const summaryUserMsg: MessageV2.User = { ... }
await Session.updateMessage(summaryUserMsg)
await Session.updatePart({
  type: "text",
  text: "Summarize the task tool output above and continue with your task.",
  synthetic: true,
})
```

### 3. 错误处理

SubtaskPart 执行失败不会中断主循环。

```typescript
.catch((error) => {
  executionError = error
  log.error("subtask execution failed", { ... })
  return undefined  // 返回 undefined，不抛出异常
})
```

失败后会创建 `status: "error"` 的 Tool Part，但循环会继续。

## 九、关键文件位置

| 功能 | 文件路径 | 行号 |
|------|---------|------|
| SubtaskPart 定义 | `packages/opencode/src/session/message-v2.ts` | 158-165 |
| SubtaskPart 创建 | `packages/opencode/src/session/prompt.ts` | 1352-1364 |
| SubtaskPart 执行 | `packages/opencode/src/session/prompt.ts` | 286-443 |
| 合成用户消息 | `packages/opencode/src/session/prompt.ts` | 419-440 |

## 十、总结

SubtaskPart 是 OpenCode 子代理系统的重要组成部分，提供了一种**声明式、高效、可控**的方式来调用子代理。它与命令系统深度集成，使得用户可以通过简单的 `/command` 触发复杂的子代理任务，而无需依赖 LLM 的推理能力。
