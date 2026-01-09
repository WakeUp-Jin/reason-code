# 未来扩展：HTTP + SSE 方案

## 📖 概述

HTTP + SSE（Server-Sent Events）方案用于支持 Web 端和多客户端场景，在保持实时性的同时，提供标准化的 API 接口。

## 🎯 适用场景

- ✅ Web 浏览器访问
- ✅ 多客户端同时连接
- ✅ 远程访问（手机、平板）
- ✅ 桌面应用（Electron/Tauri）
- ✅ 编辑器插件（VSCode/Zed）

## 🏗️ 架构图

```
┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│  Web 浏览器 │  │   CLI TUI   │  │  Desktop    │
└──────┬──────┘  └──────┬──────┘  └──────┬──────┘
       │                │                │
       │ HTTP POST      │ HTTP POST      │ HTTP POST
       ↓                ↓                ↓
┌──────────────────────────────────────────────────┐
│            HTTP Server (Hono/Bun)                │
│  - POST /session/:id/message  (发送消息)         │
│  - GET  /event                (SSE 事件流)       │
│  - GET  /session/:id          (查询会话)         │
└──────────────────┬───────────────────────────────┘
                   │
        ┌──────────┴──────────┐
        ↓                     ↓
┌──────────────┐      ┌──────────────┐
│  Session 层  │      │  Bus 事件    │
│  (业务逻辑)  │      │  (全局总线)  │
└──────┬───────┘      └──────┬───────┘
       │                     │
       └──────────┬──────────┘
                  ↓
         ┌────────────────┐
         │  SSE 流推送    │
         │  (实时通知)    │
         └────────────────┘
```

## 🔑 核心特点

### 1. 标准 RESTful API

```typescript
// POST 发送消息
POST /session/:sessionID/message
Body: {
  parts: [{ type: "text", text: "fix bug" }],
  agent: "build",
  model: { providerID: "anthropic", modelID: "claude-sonnet-4" }
}
Response: { messageID: "msg_01..." }

// GET 查询会话
GET /session/:sessionID
Response: {
  id: "session_01",
  status: { type: "busy" | "idle" | "retry" },
  messages: [...]
}
```

### 2. SSE 实时推送

```typescript
// GET 订阅事件流
GET /event
Response: text/event-stream

data: {"type":"message.part.updated","properties":{...}}

data: {"type":"session.status","properties":{...}}

data: {"type":"server.heartbeat","properties":{}}
```

### 3. 多客户端同步

```
         [Global Bus]
              ↓
    ┌─────────┼─────────┐
    ↓         ↓         ↓
[Client 1] [Client 2] [Client 3]
    ↓         ↓         ↓
  看到相同的会话状态和消息
```

## 📊 完整数据流

```
Client 发送消息
        ↓
HTTP POST /session/:id/message
        ↓
Server: SessionPrompt.prompt()
        ↓
Session 层处理
        ↓
Bus.publish(Event)
        ↓
GlobalBus.emit("event", { payload })
        ↓
Server: streamSSE.writeSSE()
        ↓
SSE 推送到所有连接的客户端
        ↓
Client: EventSource.onmessage
        ↓
更新 UI
```

## 💻 实现代码

### Server 端实现

```typescript
// src/server/server.ts
import { Hono } from "hono"
import { streamSSE } from "hono/streaming"
import { Bus, GlobalBus } from "./bus"
import { Session } from "./session"
import { SessionPrompt } from "./session/prompt"

const app = new Hono()

// 1. 发送消息 API
app.post("/session/:sessionID/message", async (c) => {
  const sessionID = c.req.param("sessionID")
  const body = await c.req.json()

  const message = await SessionPrompt.prompt({
    sessionID,
    parts: body.parts,
    agent: body.agent,
    model: body.model
  })

  return c.json(message)
})

// 2. SSE 事件流
app.get("/event", (c) => {
  return streamSSE(c, async (stream) => {
    // 连接建立
    await stream.writeSSE({
      data: JSON.stringify({
        type: "server.connected",
        properties: {}
      })
    })

    // 订阅全局事件
    const unsub = GlobalBus.on("event", async (evt) => {
      await stream.writeSSE({
        data: JSON.stringify(evt.payload)
      })
    })

    // 心跳防止超时
    const heartbeat = setInterval(() => {
      stream.writeSSE({
        data: JSON.stringify({
          type: "server.heartbeat",
          properties: {}
        })
      })
    }, 30000)

    // 清理
    stream.onAbort(() => {
      clearInterval(heartbeat)
      unsub()
    })
  })
})

// 3. 查询会话
app.get("/session/:sessionID", async (c) => {
  const sessionID = c.req.param("sessionID")
  const session = await Session.get(sessionID)
  return c.json(session)
})

export const server = Bun.serve({
  port: 4096,
  fetch: app.fetch
})
```

### Client 端实现（浏览器）

```typescript
// src/client/sdk.ts
class OpencodeClient {
  private baseUrl: string
  private eventSource?: EventSource

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl
  }

  // 发送消息
  async sendMessage(sessionID: string, parts: Part[]) {
    const response = await fetch(
      `${this.baseUrl}/session/${sessionID}/message`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parts })
      }
    )
    return await response.json()
  }

  // 订阅事件
  subscribeEvents(callback: (event: Event) => void) {
    this.eventSource = new EventSource(`${this.baseUrl}/event`)

    this.eventSource.onmessage = (evt) => {
      const event = JSON.parse(evt.data)
      callback(event)
    }

    this.eventSource.onerror = () => {
      console.error("SSE connection error, retrying...")
      // 浏览器会自动重连
    }

    return () => {
      this.eventSource?.close()
    }
  }
}

// 使用
const client = new OpencodeClient("http://localhost:4096")

// 订阅实时更新
client.subscribeEvents((event) => {
  if (event.type === "message.part.updated") {
    const { part, delta } = event.properties
    if (part.type === "text" && delta) {
      document.getElementById("output").textContent += delta
    }
  }
})

// 发送消息
await client.sendMessage("session_01", [
  { type: "text", text: "Hello" }
])
```

### Client 端实现（Node.js CLI）

```typescript
// src/cli/http-client.ts
import { EventSource } from "eventsource"

class CLIClient {
  private baseUrl: string

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl
  }

  async sendMessage(sessionID: string, prompt: string) {
    const response = await fetch(
      `${this.baseUrl}/session/${sessionID}/message`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          parts: [{ type: "text", text: prompt }]
        })
      }
    )
    return await response.json()
  }

  subscribeEvents(callback: (event: any) => void) {
    const eventSource = new EventSource(`${this.baseUrl}/event`)

    eventSource.onmessage = (evt) => {
      const event = JSON.parse(evt.data)
      callback(event)
    }

    return () => eventSource.close()
  }
}

// 使用
const client = new CLIClient("http://localhost:4096")

// 订阅输出
client.subscribeEvents((event) => {
  if (event.type === "message.part.updated") {
    const { delta } = event.properties
    if (delta) process.stdout.write(delta)
  }
})

// 发送消息
await client.sendMessage("session_01", "fix the bug")
```

## 📈 性能指标

| 指标 | 数值 |
|------|------|
| **启动时间** | ~300ms |
| **内存占用** | ~120MB |
| **事件延迟** | ~50ms (网络 + 序列化) |
| **并发连接** | 1000+ |
| **代码量** | ~15,000 行 |

## 🎯 优势

✅ **多客户端**：支持浏览器、CLI、移动端
✅ **远程访问**：可通过网络连接
✅ **标准协议**：RESTful API + SSE
✅ **自动重连**：SSE 原生支持
✅ **防火墙友好**：HTTP 协议易穿透

## ⚠️ 劣势

❌ **性能下降**：网络开销 + 序列化
❌ **复杂度高**：需要维护 HTTP Server
❌ **资源占用**：Server 进程常驻
❌ **单向通信**：SSE 只能 Server → Client

## 🔧 配置示例

```typescript
// config.json
{
  "transport": {
    "mode": "http",
    "http": {
      "port": 4096,
      "hostname": "127.0.0.1",
      "sse": {
        "heartbeat": 30000,  // 心跳间隔 (ms)
        "timeout": 60000     // 超时时间 (ms)
      }
    }
  }
}
```

## 📂 新增文件

```
src/
├── server/
│   ├── server.ts               # HTTP Server (新增)
│   ├── routes/
│   │   ├── session.ts          # 会话路由 (新增)
│   │   └── event.ts            # SSE 事件流 (新增)
│   └── middleware/
│       ├── auth.ts             # 认证中间件 (新增)
│       └── cors.ts             # CORS 中间件 (新增)
├── client/
│   ├── sdk.ts                  # 客户端 SDK (新增)
│   └── types.ts                # 类型定义 (新增)
└── bus/
    └── global.ts               # 全局事件总线 (扩展)
```

## 🔄 与 CLI 方案对比

| 特性 | CLI 直接调用 | HTTP + SSE |
|------|-------------|------------|
| **通信方式** | 函数调用 | HTTP API |
| **实时推送** | Bus 事件 | SSE 流 |
| **多客户端** | ❌ | ✅ |
| **Web 支持** | ❌ | ✅ |
| **启动速度** | 50ms | 300ms |
| **内存占用** | 60MB | 120MB |
| **代码复杂度** | 低 | 中 |

## 🚀 渐进式迁移

### Step 1: 添加 Server 层（无需改 Session 层）

```typescript
// src/server/server.ts
import { SessionPrompt } from "../session/prompt"

app.post("/session/:id/message", async (c) => {
  // 直接调用现有代码
  const message = await SessionPrompt.prompt({
    sessionID: c.req.param("id"),
    parts: await c.req.json().parts
  })
  return c.json(message)
})
```

### Step 2: 桥接 Bus 到 SSE

```typescript
// src/bus/global.ts
import { EventEmitter } from "events"

export const GlobalBus = new EventEmitter()

// 桥接本地 Bus 到全局 Bus
Bus.subscribeAll((event) => {
  GlobalBus.emit("event", { payload: event })
})
```

### Step 3: CLI 切换到 HTTP 模式（可选）

```typescript
// src/cli/main.ts
if (config.transport.mode === "http") {
  // 使用 HTTP Client
  await httpCli(prompt)
} else {
  // 使用直接调用
  await directCli(prompt)
}
```

## 📚 相关文档

- [当前方案：CLI 直接调用](./01-当前方案-CLI直接调用.md)
- [架构设计：通信层抽象](./04-架构设计-通信层抽象.md)
- [迁移指南](./05-迁移指南.md)

---

**适用总结**：HTTP + SSE 方案适合需要多客户端、Web 端、远程访问的场景，是扩展到商业化产品的必经之路。
