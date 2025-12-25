# 当前方案：CLI 直接调用

## 📖 概述

当前采用**进程内直接函数调用 + 事件总线**的通信架构，专为 CLI 场景优化，具有最高性能和最低复杂度。

## 🏗️ 架构图

```
┌─────────────────────────────────────────┐
│          CLI 入口 (main.ts)             │
└────────────────┬────────────────────────┘
                 │ 直接函数调用
                 ↓
┌─────────────────────────────────────────┐
│        Session 层 (业务逻辑)            │
│  - SessionPrompt.prompt()              │
│  - SessionProcessor.process()          │
└────────────────┬────────────────────────┘
                 │
        ┌────────┴────────┐
        │                 │
        ↓                 ↓
┌──────────────┐   ┌──────────────┐
│  LLM 调用    │   │  Bus 事件    │
│  (AI SDK)    │   │  (实时反馈)  │
└──────┬───────┘   └──────┬───────┘
       │                  │
       └────────┬─────────┘
                ↓
        ┌───────────────┐
        │ Terminal 输出 │
        └───────────────┘
```

## 🔑 核心特点

### 1. 零网络开销
```typescript
// 直接调用，无序列化
const session = await Session.create({})
await SessionPrompt.prompt({ sessionID, parts: [...] })
```

### 2. 事件驱动反馈
```typescript
// 订阅实时输出
Bus.subscribe(MessageV2.Event.PartUpdated, (event) => {
  if (event.properties.delta) {
    process.stdout.write(event.properties.delta)
  }
})
```

### 3. 流式处理
```typescript
// AsyncIterable 逐块处理
for await (const chunk of stream.fullStream) {
  handleChunk(chunk)
}
```

## 📊 完整调用链

```
用户输入 "fix the bug"
        ↓
main.ts: cli(prompt)
        ↓
Instance.provide({ directory, fn })
        ↓
Session.create()
        ↓
Bus.subscribe(PartUpdated, handler)
        ↓
SessionPrompt.prompt({ sessionID, parts })
        ↓
  ├─ createUserMessage()
  │    └─ Storage.write()
  │         └─ Bus.publish(MessageCreated)
  │
  └─ loop(sessionID)
       ↓
     SessionProcessor.create()
       ↓
     processor.process(streamInput)
       ↓
     LLM.stream({ model, messages, tools })
       ↓
     for await (chunk of fullStream)
       ↓
       switch (chunk.type):
         ├─ text-delta
         │    └─ Session.updatePart({ delta })
         │         └─ Bus.publish(PartUpdated)
         │              └─ CLI订阅者: stdout.write(delta)
         │
         ├─ tool-call
         │    └─ Tool.execute()
         │         └─ Bus.publish(ToolUpdated)
         │
         └─ finish
              └─ 返回结果
```

## 💻 实现代码

### 最小化实现

```typescript
// src/cli/main.ts
import { Instance } from "./project/instance"
import { Session } from "./session"
import { SessionPrompt } from "./session/prompt"
import { Bus } from "./bus"
import { MessageV2 } from "./session/message-v2"

async function cli(prompt: string) {
  await Instance.provide({
    directory: process.cwd(),
    fn: async () => {
      // 1. 创建会话
      const session = await Session.create({})

      // 2. 订阅实时输出
      Bus.subscribe(MessageV2.Event.PartUpdated, (event) => {
        const { part, delta } = event.properties

        // 文本增量输出
        if (part.type === "text" && delta) {
          process.stdout.write(delta)
        }

        // 工具调用通知
        if (part.type === "tool") {
          console.log(`\n[${part.tool}] ${part.state.status}`)
        }
      })

      // 3. 发送提示
      await SessionPrompt.prompt({
        sessionID: session.id,
        parts: [{ type: "text", text: prompt }]
      })
    }
  })
}

// 使用
await cli("fix the authentication bug")
```

### Bus 事件系统

```typescript
// src/bus/index.ts
export namespace Bus {
  // 发布事件
  export function publish<T>(
    definition: EventDefinition<T>,
    data: T
  ): void {
    const subscribers = Instance.state().subscriptions.get(definition.type)
    subscribers?.forEach(callback => callback(data))
  }

  // 订阅事件
  export function subscribe<T>(
    definition: EventDefinition<T>,
    callback: (data: T) => void
  ): () => void {
    const subscribers = Instance.state().subscriptions
    const list = subscribers.get(definition.type) || []
    list.push(callback)
    subscribers.set(definition.type, list)

    // 返回取消订阅函数
    return () => {
      const index = list.indexOf(callback)
      if (index > -1) list.splice(index, 1)
    }
  }
}
```

## 📈 性能指标

| 指标 | 数值 |
|------|------|
| **启动时间** | ~50ms |
| **内存占用** | ~60MB |
| **事件延迟** | ~1ms (内存直传) |
| **代码量** | ~8,000 行 |

## 🎯 优势

✅ **性能最优**：无序列化、无网络开销
✅ **实现简单**：代码量减少 50%
✅ **调试方便**：直接断点调试
✅ **启动快速**：无需启动服务器
✅ **资源占用低**：单进程运行

## ⚠️ 限制

❌ **无法多客户端**：只支持单个 CLI 实例
❌ **无法远程访问**：必须本地运行
❌ **无法 Web 端**：不支持浏览器
❌ **进程耦合**：LLM 调用阻塞主进程

## 📂 关键文件

```
src/
├── cli/
│   └── main.ts                 # CLI 入口 (新建)
├── session/
│   ├── index.ts                # Session 管理
│   ├── prompt.ts               # 提示处理
│   ├── processor.ts            # 流式处理
│   └── llm.ts                  # AI 调用
├── bus/
│   └── index.ts                # 事件总线
└── project/
    └── instance.ts             # 实例管理
```

## 🔄 事件流转

### 事件类型

```typescript
// 消息事件
MessageV2.Event.Created         // 消息创建
MessageV2.Event.Updated         // 消息更新
MessageV2.Event.PartUpdated     // 部分更新 (流式)

// 会话事件
Session.Event.Created           // 会话创建
Session.Event.Updated           // 会话更新
Session.Event.Error             // 错误事件

// 状态事件
SessionStatus.Updated           // 状态变更
```

### 订阅示例

```typescript
// 订阅文本输出
Bus.subscribe(MessageV2.Event.PartUpdated, (event) => {
  if (event.properties.part.type === "text") {
    process.stdout.write(event.properties.delta || "")
  }
})

// 订阅工具调用
Bus.subscribe(MessageV2.Event.PartUpdated, (event) => {
  if (event.properties.part.type === "tool") {
    const tool = event.properties.part
    console.log(`[${tool.tool}] ${tool.input}`)
  }
})

// 订阅错误
Bus.subscribe(Session.Event.Error, (event) => {
  console.error("Error:", event.properties.error)
})
```

## 🚀 使用示例

### 基础用法

```typescript
import { cli } from "./cli/main"

// 简单提示
await cli("创建一个 Hello World 程序")

// 带配置
await cli("修复登录 bug", {
  model: "anthropic/claude-sonnet-4",
  agent: "build"
})
```

### 高级用法

```typescript
// 自定义事件处理
await Instance.provide({
  directory: "./my-project",
  fn: async () => {
    const session = await Session.create({})

    // 自定义输出格式
    Bus.subscribe(MessageV2.Event.PartUpdated, (event) => {
      const { part, delta } = event.properties

      if (part.type === "text" && delta) {
        // 添加颜色
        process.stdout.write(chalk.green(delta))
      }

      if (part.type === "reasoning" && delta) {
        // 思考过程用灰色
        process.stderr.write(chalk.gray(delta))
      }
    })

    await SessionPrompt.prompt({
      sessionID: session.id,
      agent: "build",
      parts: [{ type: "text", text: "复杂任务" }]
    })
  }
})
```

## 🔍 调试技巧

### 1. 查看所有事件

```typescript
Bus.subscribeAll((event) => {
  console.log(`[Event] ${event.type}`, event.properties)
})
```

### 2. 性能分析

```typescript
const start = Date.now()

Bus.subscribe(MessageV2.Event.PartUpdated, (event) => {
  const elapsed = Date.now() - start
  console.log(`[${elapsed}ms] ${event.type}`)
})
```

### 3. 错误追踪

```typescript
Bus.subscribe(Session.Event.Error, (event) => {
  console.error("Error Stack:", event.properties.error.stack)
  process.exit(1)
})
```

## 📚 相关文档

- [架构设计：通信层抽象](./04-架构设计-通信层抽象.md)
- [未来扩展：HTTP+SSE 方案](./02-未来扩展-HTTP+SSE方案.md)
- [迁移指南](./05-迁移指南.md)

---

**优势总结**：当前方案适合快速启动、本地开发的 CLI 场景，性能最优，实现简单。
