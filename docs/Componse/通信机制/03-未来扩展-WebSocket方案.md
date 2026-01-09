# 未来扩展：WebSocket 方案

## 📖 概述

WebSocket 方案提供**真正的双向实时通信**,适用于需要高频交互、实时协作的场景。

## 🎯 适用场景

- ✅ 实时协作编辑（多人同时编辑）
- ✅ 终端交互（PTY/Shell）
- ✅ 实时聊天对话
- ✅ 游戏化交互
- ✅ 低延迟要求（< 10ms）

## 🏗️ 架构图

```
┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│   用户 A    │  │   用户 B    │  │   用户 C    │
└──────┬──────┘  └──────┬──────┘  └──────┬──────┘
       │                │                │
       │ WebSocket      │ WebSocket      │ WebSocket
       ↓                ↓                ↓
┌──────────────────────────────────────────────────┐
│         WebSocket Server (Bun.serve)             │
│  - 连接管理 (Connection Pool)                     │
│  - 消息路由 (Message Router)                      │
│  - 广播管理 (Broadcast Manager)                   │
└──────────────────┬───────────────────────────────┘
                   │
        ┌──────────┴──────────┐
        ↓                     ↓
┌──────────────┐      ┌──────────────┐
│  Session 层  │      │  Bus 事件    │
│  (业务逻辑)  │ ←──→ │  (实时同步)  │
└──────────────┘      └──────────────┘
                           ↓
                  ┌────────────────┐
                  │  实时广播到    │
                  │  所有客户端    │
                  └────────────────┘
```

## 🔑 核心特点

### 1. 双向实时通信

```typescript
// Client → Server
ws.send(JSON.stringify({
  type: "prompt",
  data: { sessionID, prompt: "fix bug" }
}))

// Server → Client
ws.send(JSON.stringify({
  type: "text-delta",
  data: { delta: "Let me fix..." }
}))
```

### 2. 全双工通信

```
Client ──────▶ Server    (发送消息)
       ◀────── Server    (实时响应)
       ──────▶ Server    (中断请求)
       ◀────── Server    (确认中断)
```

### 3. 连接池管理

```typescript
// 管理所有活跃连接
class ConnectionPool {
  connections: Map<string, WebSocket>

  broadcast(event: Event) {
    for (const ws of this.connections.values()) {
      ws.send(JSON.stringify(event))
    }
  }

  sendToSession(sessionID: string, event: Event) {
    const ws = this.connections.get(sessionID)
    ws?.send(JSON.stringify(event))
  }
}
```

## 📊 完整数据流

```
Client 发送消息
        ↓
WebSocket.send({ type: "prompt" })
        ↓
Server: onMessage(data)
        ↓
解析消息类型
        ↓
  ┌─────┴─────┐
  │ prompt    │ SessionPrompt.prompt()
  │ cancel    │ Session.cancel()
  │ subscribe │ 订阅会话事件
  └─────┬─────┘
        ↓
Session 层处理
        ↓
Bus.publish(Event)
        ↓
ConnectionPool.broadcast(event)
        ↓
WebSocket.send(JSON.stringify(event))
        ↓
Client: ws.onmessage
        ↓
更新 UI
```

## 💻 实现代码

### Server 端实现

```typescript
// src/server/websocket.ts
import { ServerWebSocket } from "bun"
import { Bus } from "../bus"
import { Session } from "../session"
import { SessionPrompt } from "../session/prompt"

type WSData = {
  sessionID: string
  clientID: string
}

const connections = new Map<string, ServerWebSocket<WSData>>()

export const websocketServer = {
  open(ws: ServerWebSocket<WSData>) {
    const { clientID, sessionID } = ws.data
    connections.set(clientID, ws)

    // 订阅会话事件
    const unsub = Bus.subscribeAll((event) => {
      if (event.properties.sessionID === sessionID) {
        ws.send(JSON.stringify(event))
      }
    })

    // 连接关闭时清理
    ws.data.unsub = unsub
  },

  async message(ws: ServerWebSocket<WSData>, message: string) {
    const msg = JSON.parse(message)

    switch (msg.type) {
      case "prompt":
        await SessionPrompt.prompt({
          sessionID: ws.data.sessionID,
          parts: msg.data.parts
        })
        break

      case "cancel":
        await SessionPrompt.cancel(ws.data.sessionID)
        break

      case "ping":
        ws.send(JSON.stringify({ type: "pong" }))
        break
    }
  },

  close(ws: ServerWebSocket<WSData>) {
    connections.delete(ws.data.clientID)
    ws.data.unsub?.()
  },

  error(ws: ServerWebSocket<WSData>, error: Error) {
    console.error("WebSocket error:", error)
    ws.close()
  }
}

// 启动 WebSocket Server
Bun.serve({
  port: 4096,
  websocket: websocketServer,
  fetch(req, server) {
    const url = new URL(req.url)
    if (url.pathname === "/ws") {
      const sessionID = url.searchParams.get("sessionID")
      const clientID = crypto.randomUUID()

      server.upgrade(req, {
        data: { sessionID, clientID }
      })
    }
    return new Response("WebSocket server")
  }
})
```

### Client 端实现（浏览器）

```typescript
// src/client/websocket.ts
class WebSocketClient {
  private ws: WebSocket
  private handlers: Map<string, (data: any) => void>

  constructor(url: string, sessionID: string) {
    this.handlers = new Map()
    this.ws = new WebSocket(`${url}?sessionID=${sessionID}`)

    this.ws.onopen = () => {
      console.log("WebSocket connected")
    }

    this.ws.onmessage = (evt) => {
      const msg = JSON.parse(evt.data)
      const handler = this.handlers.get(msg.type)
      if (handler) handler(msg.data)
    }

    this.ws.onerror = (error) => {
      console.error("WebSocket error:", error)
    }

    this.ws.onclose = () => {
      console.log("WebSocket closed, reconnecting...")
      setTimeout(() => this.reconnect(), 1000)
    }
  }

  send(type: string, data: any) {
    this.ws.send(JSON.stringify({ type, data }))
  }

  on(type: string, handler: (data: any) => void) {
    this.handlers.set(type, handler)
  }

  reconnect() {
    // 重连逻辑
    this.ws = new WebSocket(this.ws.url)
  }
}

// 使用
const client = new WebSocketClient("ws://localhost:4096/ws", "session_01")

// 订阅事件
client.on("text-delta", (data) => {
  document.getElementById("output").textContent += data.delta
})

client.on("tool-call", (data) => {
  console.log(`Tool: ${data.tool}`)
})

// 发送消息
client.send("prompt", {
  parts: [{ type: "text", text: "Hello" }]
})

// 取消请求
client.send("cancel", {})
```

### Client 端实现（Node.js）

```typescript
// src/cli/websocket-client.ts
import { WebSocket } from "ws"

class CLIWebSocketClient {
  private ws: WebSocket
  private handlers: Map<string, (data: any) => void>

  constructor(url: string, sessionID: string) {
    this.handlers = new Map()
    this.ws = new WebSocket(`${url}?sessionID=${sessionID}`)

    this.ws.on("open", () => {
      console.log("Connected to server")
    })

    this.ws.on("message", (data) => {
      const msg = JSON.parse(data.toString())
      const handler = this.handlers.get(msg.type)
      if (handler) handler(msg.data)
    })

    this.ws.on("error", (error) => {
      console.error("WebSocket error:", error)
    })

    this.ws.on("close", () => {
      console.log("Connection closed")
    })
  }

  send(type: string, data: any) {
    this.ws.send(JSON.stringify({ type, data }))
  }

  on(type: string, handler: (data: any) => void) {
    this.handlers.set(type, handler)
  }
}

// 使用
const client = new CLIWebSocketClient("ws://localhost:4096/ws", "session_01")

// 订阅输出
client.on("text-delta", (data) => {
  process.stdout.write(data.delta)
})

// 发送消息
client.send("prompt", {
  parts: [{ type: "text", text: "fix the bug" }]
})
```

## 📈 性能指标

| 指标 | 数值 |
|------|------|
| **延迟** | ~5-10ms |
| **吞吐量** | 10,000+ msg/s |
| **并发连接** | 10,000+ |
| **内存占用** | ~150MB |
| **CPU 占用** | 较高（维持连接） |

## 🎯 优势

✅ **真正双向**：Client 和 Server 都能主动发送
✅ **低延迟**：比 HTTP 快 5-10 倍
✅ **实时性强**：最适合实时场景
✅ **高效**：单个连接复用
✅ **支持二进制**：可传输文件

## ⚠️ 劣势

❌ **复杂度高**：需要维护长连接
❌ **代理不友好**：可能被防火墙阻止
❌ **需要手动重连**：断线需自己实现
❌ **状态管理复杂**：需要处理连接状态
❌ **资源占用大**：每个连接占用内存

## 🔧 配置示例

```typescript
// config.json
{
  "transport": {
    "mode": "websocket",
    "websocket": {
      "port": 4096,
      "hostname": "0.0.0.0",
      "ping": {
        "interval": 30000,    // ping 间隔 (ms)
        "timeout": 10000      // 超时时间 (ms)
      },
      "reconnect": {
        "maxAttempts": 5,     // 最大重连次数
        "delay": 1000         // 重连延迟 (ms)
      }
    }
  }
}
```

## 📂 新增文件

```
src/
├── server/
│   ├── websocket.ts            # WebSocket Server (新增)
│   ├── connection-pool.ts      # 连接池管理 (新增)
│   └── message-router.ts       # 消息路由 (新增)
├── client/
│   ├── websocket.ts            # WebSocket Client (新增)
│   └── reconnect.ts            # 重连逻辑 (新增)
└── protocol/
    └── messages.ts             # 消息协议定义 (新增)
```

## 🔄 三种方案对比

| 特性 | CLI 直接调用 | HTTP + SSE | WebSocket |
|------|-------------|------------|-----------|
| **通信方向** | 单向 | 单向（Server→Client） | 双向 |
| **实时性** | 最高 | 高 | 最高 |
| **延迟** | ~1ms | ~50ms | ~5ms |
| **多客户端** | ❌ | ✅ | ✅ |
| **Web 支持** | ❌ | ✅ | ✅ |
| **防火墙友好** | N/A | ✅ | ❌ |
| **自动重连** | N/A | ✅ | ❌ 需手动 |
| **复杂度** | 低 | 中 | 高 |
| **资源占用** | 低 | 中 | 高 |
| **适用场景** | 本地 CLI | Web 端 | 实时协作 |

## 🚀 使用场景示例

### 场景 1: 实时协作编辑

```typescript
// 用户 A 和 B 同时编辑同一个会话
const wsA = new WebSocketClient("ws://localhost:4096/ws", "session_01")
const wsB = new WebSocketClient("ws://localhost:4096/ws", "session_01")

// A 的操作会实时同步到 B
wsA.send("prompt", { parts: [{ type: "text", text: "Add feature" }] })

// B 立即看到 A 的消息和 AI 响应
wsB.on("message.created", (data) => {
  console.log("A sent:", data.message)
})

wsB.on("text-delta", (data) => {
  console.log("AI response:", data.delta)
})
```

### 场景 2: 终端交互（PTY）

```typescript
// 双向终端交互
const ws = new WebSocketClient("ws://localhost:4096/pty", "pty_01")

// 发送键盘输入
process.stdin.on("data", (data) => {
  ws.send("input", { data: data.toString() })
})

// 接收终端输出
ws.on("output", (data) => {
  process.stdout.write(data.output)
})
```

### 场景 3: 实时中断

```typescript
// 用户可以随时中断 AI 生成
const ws = new WebSocketClient("ws://localhost:4096/ws", "session_01")

// 开始生成
ws.send("prompt", { parts: [{ type: "text", text: "Long task" }] })

// 用户按 Ctrl+C 中断
process.on("SIGINT", () => {
  ws.send("cancel", {})
})

// 服务端立即停止
ws.on("cancelled", () => {
  console.log("Task cancelled")
})
```

## 📚 相关文档

- [当前方案：CLI 直接调用](./01-当前方案-CLI直接调用.md)
- [HTTP + SSE 方案](./02-未来扩展-HTTP+SSE方案.md)
- [架构设计：通信层抽象](./04-架构设计-通信层抽象.md)
- [迁移指南](./05-迁移指南.md)

---

**适用总结**：WebSocket 方案适合需要双向实时交互、低延迟、实时协作的场景，是最高级的通信方式。
