# @reason-code/core

> Reason CLI 的核心引擎包 - Agent 执行、LLM 服务、工具系统与上下文管理

## 概述

`@reason-code/core` 是 Reason CLI 的核心逻辑层，提供：

- **Agent 系统**：支持多种 Agent 类型（build/steward/explore/explanatory）
- **LLM 服务**：多供应商抽象（DeepSeek、OpenRouter 等）
- **工具系统**：文件操作、搜索、任务管理等内置工具
- **上下文管理**：会话历史、Token 估算、自动压缩

## 架构设计

### 目录结构

```
packages/core/src/
├── config/              # 配置管理
├── core/               # 核心业务逻辑
│   ├── agent/         # Agent 系统
│   ├── llm/           # LLM 服务
│   ├── tool/          # 工具系统
│   ├── context/       # 上下文管理
│   ├── session/       # 会话管理
│   ├── promptManager/ # 提示词管理
│   ├── execution/     # 执行流
│   └── stats/         # 统计管理
├── utils/              # 工具函数
└── evaluation/         # 评估系统
```

### 模块依赖关系

```
┌─────────────┐
│   config    │ (基础配置)
└──────┬──────┘
       │
       ├──────────────┬──────────────┬──────────────┐
       │              │              │              │
┌──────▼──────┐ ┌─────▼─────┐ ┌─────▼─────┐ ┌─────▼──────┐
│     llm     │ │   tool    │ │  context  │ │  session   │
│  (LLM服务)  │ │ (工具系统) │ │(上下文管理)│ │ (会话管理) │
└──────┬──────┘ └─────┬─────┘ └─────┬─────┘ └────────────┘
       │              │              │
       └──────┬───────┴──────┬───────┘
              │              │
       ┌──────▼──────────────▼──────┐
       │          agent             │
       │  (统一执行器，协调各模块)    │
       └──────┬─────────────────────┘
              │
       ┌──────▼──────────────┐
       │     execution       │
       │  (状态管理与事件流)  │
       └─────────────────────┘
```

### 核心模块说明

#### 1. Agent 系统 (`core/agent`)

Agent 生命周期管理、执行流程控制。

| 类/接口 | 职责 |
|---------|------|
| `Agent` | 统一执行器，支持主代理和子代理 |
| `AgentManager` | Agent 注册与管理（工厂模式） |
| `ExecutionEngine` | 执行引擎，处理工具调用循环 |

支持的 Agent 类型：
- `build`：通用编程代理
- `steward`：管家模式（贾维斯风格）
- `explore`：代码库探索专家
- `explanatory`：解释型模式

#### 2. LLM 服务 (`core/llm`)

多供应商 LLM 服务抽象与统一接口。

| 类/接口 | 职责 |
|---------|------|
| `ILLMService` | LLM 服务统一接口 |
| `LLMServiceRegistry` | 服务注册表（单例，按层级缓存） |
| `DeepSeekService` | DeepSeek 实现 |
| `OpenRouterService` | OpenRouter 实现 |
| `createLLMService` | 工厂方法 |

支持的模型层级：
- `PRIMARY`：主模型（默认）
- `SECONDARY`：辅助模型（子代理）
- `TERTIARY`：压缩/总结模型

#### 3. 工具系统 (`core/tool`)

工具定义、注册、执行与调度。

| 类/接口 | 职责 |
|---------|------|
| `ToolManager` | 工具注册与执行 |
| `ToolScheduler` | 工具调度（并行、确认、状态跟踪） |
| `Allowlist` | 权限白名单验证 |

内置工具：
- 文件操作：`ReadFile`, `WriteFile`, `ReadManyFiles`, `ListFiles`
- 搜索：`Glob`（路径）、`Grep`（内容）
- 任务管理：`TodoRead`, `TodoWrite`
- 子代理：`Task`

#### 4. 上下文管理 (`core/context`)

统一管理三种上下文，支持自动压缩。

| 类/接口 | 职责 |
|---------|------|
| `ContextManager` | 统一管理器 |
| `TokenEstimator` | Token 估算 |
| `ToolOutputSummarizer` | 工具输出总结 |

上下文类型：
- `SystemPromptContext`：系统提示词
- `HistoryContext`：会话历史
- `CurrentTurnContext`：当前运行记录

#### 5. 提示词管理 (`core/promptManager`)

系统提示词构建与管理。

| 组件 | 职责 |
|------|------|
| `buildSystemPrompt` | 系统提示词构建器 |
| `stewardPrompt` | Steward 模式专用提示词 |
| `explorePrompt` | Explore 模式专用提示词 |

#### 6. 执行流 (`core/execution`)

执行过程状态管理与事件流。

| 类/接口 | 职责 |
|---------|------|
| `ExecutionStreamManager` | 执行流管理器 |
| `MonitorWriter` | 监控文件写入器 |

执行状态：`Idle` → `Thinking` → `ToolCalling` → `Streaming` → `Compressing`

### 主要接口

```typescript
// Agent 配置
interface AgentConfig {
  name: AgentType;
  role: AgentRole;
  description: string;
  systemPrompt?: string;
  systemPromptBuilder?: SystemPromptBuilder;
  tools?: { include?: string[]; exclude?: string[] };
  modelTier?: ModelTier;
  execution?: { maxLoops?: number; enableCompression?: boolean };
}

// LLM 服务接口
interface ILLMService {
  complete(messages: any[], tools?: any[], options?: LLMChatOptions): Promise<LLMResponse>;
  simpleChat(userInput: string, systemPrompt?: string): Promise<string>;
  getConfig(): { provider: string; model: string };
}

// 工具结果接口
interface ToolResult<T = unknown> {
  success: boolean;
  error?: string;
  warning?: string;
  data: T | null;
}
```

### 设计模式

- **单例模式**：`ConfigService`, `LLMServiceRegistry`, `AgentManager`
- **工厂模式**：`createLLMService`, `AgentManager.createAgent`
- **策略模式**：工具执行策略（ripgrep/git-grep/system-grep）
- **注册表模式**：`LLMServiceRegistry`, `AgentManager`
- **观察者模式**：`ExecutionStreamManager` 事件系统

## 安装

```bash
pnpm add @reason-code/core
```

## 使用方式

### 基础导出

```typescript
// 核心统一导出
import { Agent, AgentManager } from '@reason-code/core';

// 分模块导出
import { createLLMService } from '@reason-code/core/llm';
import { ToolManager } from '@reason-code/core/tools';
import { ContextManager } from '@reason-code/core/context';
import { configService } from '@reason-code/core/config';
```

### 创建 LLM 服务

```typescript
import { createLLMService } from '@reason-code/core/llm';

const service = await createLLMService({
  provider: 'deepseek',
  model: 'deepseek-chat',
  apiKey: 'your-api-key',
});

const response = await service.simpleChat('你好');
```

### 使用工具系统

```typescript
import { ToolManager } from '@reason-code/core/tools';

const toolManager = new ToolManager();
const result = await toolManager.execute('ReadFile', { path: '/path/to/file' });
```

## 测试

### 测试架构

```
测试分层
├── 单元测试（日常运行）
│   ├── 核心模块测试（context/tool/agent-config/prompt）
│   └── Mock 层 LLM 测试（无网络）
└── 健康检查测试（手动触发）
    └── LLM 供应商连通性（真实网络）
```

### 测试文件

| 模块 | 文件 | 说明 |
|------|------|------|
| Agent Config | `presets/__tests__/presets.test.ts` | Agent 预设配置类型测试 |
| Agent Config | `config/__tests__/types.test.ts` | AgentConfig 接口约束测试 |
| PromptManager | `promptManager/__tests__/systemPromptBuilder.test.ts` | Prompt 构建器测试 |
| Tool | `tool/__tests__/Allowlist.test.ts` | 白名单逻辑测试 |
| Tool | `tool/__tests__/ToolScheduler.test.ts` | 工具调度器测试 |
| Context | `context/__tests__/tokenEstimator.test.ts` | Token 估算测试 |
| Utils | `utils/__tests__/logger.test.ts` | 日志工具测试 |
| LLM | `llm/__tests__/factory.mock.test.ts` | LLM 工厂 Mock 测试 |
| LLM | `llm/__tests__/LLMServiceRegistry.mock.test.ts` | 注册表 Mock 测试 |
| LLM | `llm/__tests__/DeepSeekService.mock.test.ts` | DeepSeek Mock 测试 |
| LLM | `llm/__tests__/OpenRouterService.mock.test.ts` | OpenRouter Mock 测试 |
| LLM | `llm/__tests__/providers.health.test.ts` | 健康检查测试（真实 API） |

### 运行测试

```bash
# 日常测试（无网络，快速）
pnpm test

# 监听模式（开发时使用）
pnpm test:watch

# 生成覆盖率报告
pnpm test:coverage

# LLM 健康检查（需要 API Key，真实网络）
pnpm test:health
```

### 测试配置

测试使用 Vitest 框架，配置文件位于 `vitest.config.ts`：

```typescript
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/__tests__/**/*.test.ts'],
    exclude: [
      '**/*.health.test.ts',  // 健康检查测试需要手动触发
      '**/*.bench.ts',        // 性能测试
    ],
    testTimeout: 10000,
  },
});
```

### 编写新测试

1. 在对应模块的 `__tests__` 目录下创建测试文件
2. 使用 Vitest 语法（`describe`, `it`, `expect`）
3. Mock 外部依赖（如 LLM API）以确保测试无网络依赖

示例：

```typescript
import { describe, it, expect, vi } from 'vitest';
import { MyClass } from '../MyClass.js';

describe('MyClass 测试', () => {
  it('应该正确执行某操作', () => {
    const instance = new MyClass();
    expect(instance.doSomething()).toBe(expectedResult);
  });
});
```

## 许可证

Apache-2.0
