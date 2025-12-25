# Core + CLI 分层架构设计

## 架构理念

将**业务逻辑**（Core）与**表现层**（CLI/Web/Desktop）分离，实现：
- 核心逻辑独立于 UI
- 一个核心，多个界面
- 核心稳定，界面灵活

## 架构模式名称

这种架构结合了多种设计模式：

1. **Hexagonal Architecture（六边形架构）** - 核心在中心，外围是适配器
2. **Clean Architecture（整洁架构）** - 业务逻辑独立于框架和 UI
3. **Multi-Platform Architecture（多平台架构）** - 一个核心，多个平台
4. **Ports and Adapters（端口和适配器）** - 核心定义接口，外部实现适配器

## 目录结构

```
my-agent-project/
├── package.json              # 根配置
└── packages/
    ├── core/                 # 🧠 核心逻辑层（稳定）
    │   ├── package.json
    │   └── src/
    │       ├── agent.ts      # Agent 引擎
    │       ├── llm.ts        # LLM 接口
    │       ├── tools.ts      # 工具系统
    │       └── memory.ts     # 记忆管理
    │
    ├── cli/                  # 💻 终端界面层
    │   ├── package.json
    │   └── src/
    │       ├── index.ts      # CLI 入口
    │       └── commands/     # 命令处理
    │
    ├── web/                  # 🌐 Web 界面层（未来）
    │   ├── package.json
    │   └── src/
    │       ├── app.tsx       # Web 应用
    │       └── components/   # UI 组件
    │
    └── desktop/              # 🖥️  桌面应用层（未来）
        ├── package.json
        └── src/
```

## 依赖关系图

```
         ┌─────────────┐
         │    core     │  ◄─── 核心逻辑（无 UI 依赖）
         │             │       - Agent 引擎
         │ ✓ agent.ts  │       - LLM 接口
         │ ✓ llm.ts    │       - 工具系统
         │ ✓ tools.ts  │       - 记忆管理
         └──────┬──────┘
                │
                │ workspace:*
                │
    ┌───────────┼───────────┬───────────────┐
    │           │           │               │
┌───▼────┐  ┌──▼─────┐  ┌──▼────┐    ┌────▼─────┐
│  cli   │  │  web   │  │desktop│    │  mobile  │
│        │  │        │  │       │    │          │
│ ✓ 命令 │  │ ✓ UI   │  │ ✓ 原生 │    │ ✓ APP   │
│ ✓ 终端 │  │ ✓ API  │  │ ✓ 窗口 │    │ ✓ 触控  │
└────────┘  └────────┘  └───────┘    └──────────┘
```

**关键原则：**
- Core 不依赖任何界面
- 所有界面层依赖 Core
- 界面层之间不相互依赖

## Core 包设计

### package.json 配置

```json
{
  "name": "@my-agent/core",
  "version": "1.0.0",
  "type": "module",
  "private": false,            // 可以发布到 npm

  "exports": {
    ".": "./src/index.ts",     // 主入口
    "./agent": "./src/agent.ts",
    "./llm": "./src/llm.ts",
    "./tools": "./src/tools.ts"
  },

  "dependencies": {
    "zod": "catalog:",         // 数据验证
    "ai": "^5.0.0"            // AI SDK
  },

  "devDependencies": {
    "typescript": "catalog:",
    "@types/node": "catalog:"
  }
}
```

### 核心代码示例

```typescript
// packages/core/src/agent.ts
import type { LLM } from './llm'
import type { Tool } from './tools'

export interface AgentConfig {
  llm: LLM
  tools?: Tool[]
  systemPrompt?: string
}

export class Agent {
  constructor(private config: AgentConfig) {}

  async run(input: string): Promise<string> {
    // Agent 核心逻辑
    const response = await this.config.llm.generate({
      prompt: input,
      system: this.config.systemPrompt
    })

    return response
  }

  registerTool(tool: Tool) {
    // 注册工具
  }
}

// packages/core/src/llm.ts
export interface LLM {
  generate(options: {
    prompt: string
    system?: string
  }): Promise<string>
}

export class OpenAILLM implements LLM {
  async generate(options: any): Promise<string> {
    // OpenAI 实现
    return "response"
  }
}

// packages/core/src/index.ts
export * from './agent'
export * from './llm'
export * from './tools'
```

### Core 的职责

✅ **应该包含：**
- Agent 核心引擎
- LLM 接口定义
- 工具系统
- 记忆管理
- 数据模型和类型
- 业务逻辑

❌ **不应该包含：**
- UI 组件
- 终端输入输出
- Web 框架
- 窗口管理
- 任何平台特定的代码

## CLI 包设计

### package.json 配置

```json
{
  "name": "@my-agent/cli",
  "version": "1.0.0",
  "type": "module",

  "bin": {
    "my-agent": "./dist/index.js"
  },

  "scripts": {
    "dev": "bun run src/index.ts",
    "build": "bun build src/index.ts --outdir dist --target node"
  },

  "dependencies": {
    "@my-agent/core": "workspace:*",  // ⭐ 依赖 core
    "commander": "^12.0.0",           // CLI 框架
    "chalk": "^5.0.0",                // 彩色输出
    "ora": "^8.0.0",                  // Loading 动画
    "inquirer": "^9.0.0"              // 交互式提示
  },

  "devDependencies": {
    "typescript": "catalog:",
    "@types/node": "catalog:"
  }
}
```

### CLI 代码示例

```typescript
// packages/cli/src/index.ts
#!/usr/bin/env node

import { Agent, OpenAILLM } from '@my-agent/core'  // ✅ 使用 core
import { Command } from 'commander'
import chalk from 'chalk'
import ora from 'ora'

const program = new Command()

program
  .name('my-agent')
  .description('AI Agent CLI')
  .version('1.0.0')

program
  .command('chat')
  .description('Start a chat session')
  .action(async () => {
    console.log(chalk.green('🤖 Agent started!'))

    // 使用 core 的 Agent
    const agent = new Agent({
      llm: new OpenAILLM({
        apiKey: process.env.OPENAI_API_KEY
      })
    })

    const spinner = ora('Thinking...').start()
    const response = await agent.run('Hello')
    spinner.stop()

    console.log(chalk.blue(response))
  })

program
  .command('tool <name>')
  .description('List available tools')
  .action(async (name) => {
    // CLI 特有的功能
    console.log(chalk.yellow(`Tool: ${name}`))
  })

program.parse()
```

### CLI 的职责

✅ **应该包含：**
- 命令行参数解析
- 终端输入输出
- 彩色文本、加载动画
- 交互式提示
- 文件读写（CLI 特定）
- 错误处理和显示

❌ **不应该包含：**
- Agent 核心逻辑（应该在 core）
- LLM 调用逻辑（应该在 core）
- 工具定义（应该在 core）

## Web 包设计（未来）

### package.json 配置

```json
{
  "name": "@my-agent/web",
  "version": "1.0.0",
  "type": "module",

  "scripts": {
    "dev": "vite",
    "build": "vite build"
  },

  "dependencies": {
    "@my-agent/core": "workspace:*",  // ⭐ 同样依赖 core
    "react": "^18.0.0",
    "vite": "^7.0.0"
  }
}
```

### Web 代码示例

```typescript
// packages/web/src/App.tsx
import { Agent, OpenAILLM } from '@my-agent/core'  // ✅ 使用同样的 core
import { useState } from 'react'

export function App() {
  const [agent] = useState(() => new Agent({
    llm: new OpenAILLM({
      apiKey: import.meta.env.VITE_OPENAI_API_KEY
    })
  }))

  const [messages, setMessages] = useState<string[]>([])
  const [loading, setLoading] = useState(false)

  const handleSend = async (input: string) => {
    setLoading(true)
    const response = await agent.run(input)
    setMessages(prev => [...prev, input, response])
    setLoading(false)
  }

  return (
    <div className="app">
      <h1>My Agent Web</h1>
      <div className="messages">
        {messages.map((msg, i) => (
          <div key={i}>{msg}</div>
        ))}
      </div>
      {loading && <div>Loading...</div>}
      <input onKeyPress={(e) => {
        if (e.key === 'Enter') {
          handleSend(e.currentTarget.value)
        }
      }} />
    </div>
  )
}
```

## 为什么要分层？

### 1. 核心逻辑独立

```typescript
// ✅ 好的设计（core 独立）
// packages/core/src/agent.ts
export class Agent {
  async run(input: string): Promise<string> {
    // 纯逻辑，不关心 UI
    return await this.llm.generate(input)
  }
}

// ❌ 坏的设计（core 耦合 UI）
export class Agent {
  async run(input: string): Promise<string> {
    console.log('Processing...')  // ❌ 终端输出
    const spinner = ora().start()  // ❌ CLI 特有
    return await this.llm.generate(input)
  }
}
```

### 2. 多平台复用

```typescript
// CLI 使用
import { Agent } from '@my-agent/core'
const agent = new Agent({ /* ... */ })
console.log(await agent.run('Hello'))  // 终端输出

// Web 使用（相同的 Agent）
import { Agent } from '@my-agent/core'
const agent = new Agent({ /* ... */ })
setMessages(await agent.run('Hello'))  // 状态更新

// Desktop 使用（相同的 Agent）
import { Agent } from '@my-agent/core'
const agent = new Agent({ /* ... */ })
window.showNotification(await agent.run('Hello'))  // 通知
```

### 3. 易于测试

```typescript
// 测试 core（无需 UI）
import { Agent } from '@my-agent/core'

test('agent should respond', async () => {
  const agent = new Agent({
    llm: new MockLLM()  // Mock LLM
  })

  const response = await agent.run('Hello')
  expect(response).toBe('Hi there!')
})

// ✅ 无需启动 CLI 或浏览器
// ✅ 快速、可靠
```

### 4. 版本管理清晰

```bash
# Core 很少更新（稳定）
packages/core: v1.0.0 → v1.1.0 (3 个月)

# UI 层频繁更新
packages/cli: v1.0.0 → v1.5.0 (每周)
packages/web: v1.0.0 → v2.0.0 (每周)

# ✅ Core 保持稳定
# ✅ UI 可以快速迭代
```

## 最佳实践

### 1. Core 保持纯粹

```typescript
// ✅ 好
export class Agent {
  async run(input: string): Promise<string> {
    return await this.llm.generate(input)
  }
}

// ❌ 坏
export class Agent {
  async run(input: string): Promise<string> {
    console.log('Processing...')  // 不要在 core 中输出
    return await this.llm.generate(input)
  }
}
```

### 2. 使用接口定义边界

```typescript
// packages/core/src/llm.ts
export interface LLM {
  generate(prompt: string): Promise<string>
}

// CLI 可以提供不同的实现
export class TerminalLLM implements LLM {
  async generate(prompt: string): Promise<string> {
    // 终端特有的实现
  }
}

// Web 可以提供不同的实现
export class BrowserLLM implements LLM {
  async generate(prompt: string): Promise<string> {
    // 浏览器特有的实现
  }
}
```

### 3. 事件驱动通信

```typescript
// packages/core/src/agent.ts
import { EventEmitter } from 'events'

export class Agent extends EventEmitter {
  async run(input: string): Promise<string> {
    this.emit('start')  // 发出事件
    const response = await this.llm.generate(input)
    this.emit('complete', response)  // 发出事件
    return response
  }
}

// CLI 监听事件
agent.on('start', () => console.log('Processing...'))
agent.on('complete', (res) => console.log(res))

// Web 监听事件
agent.on('start', () => setLoading(true))
agent.on('complete', (res) => {
  setLoading(false)
  setMessages(prev => [...prev, res])
})
```

## 总结

**Core + CLI 分层架构的核心思想：**
- 🧠 Core 是大脑（纯逻辑）
- 💻 CLI 是嘴巴（终端交互）
- 🌐 Web 是脸（视觉界面）
- 🖥️  Desktop 是身体（原生体验）

**所有界面层共享同一个大脑（Core），但有不同的表达方式！**
