# Reason-Code 子代理实现方案

> 结合 OpenCode 的优秀设计，为 Reason-Code 定制的子代理实现方案

## 一、设计目标

### 1.1 核心原则

- **简洁优先**: 借鉴 OpenCode 的简洁设计，避免过度工程化
- **工具隔离**: 子代理只能访问基础工具，不能调用其他子代理
- **会话独立**: 每个子代理调用创建独立会话，支持并行执行
- **事件驱动**: 通过事件系统实时追踪子代理执行状态

### 1.2 与 OpenCode 的差异

| 特性     | OpenCode       | Reason-Code                |
| -------- | -------------- | -------------------------- |
| 工具管理 | 扁平化注册     | 分层管理（Function/Agent） |
| 会话存储 | Storage 抽象层 | 本地文件系统               |
| 事件系统 | Bus 全局总线   | EventEmitter 实例          |
| 权限控制 | 细粒度配置     | 简化版（allow/deny）       |

---

## 二、目录结构

```
packages/core/src/core/
├── agent/
│   ├── AgentManager.ts           # 子代理管理器
│   ├── AgentExecutor.ts          # 子代理执行器
│   ├── AgentWrapper.ts           # 子代理包装器（转换为工具）
│   ├── types.ts                  # 类型定义
│   └── configs/                  # 子代理配置
│       ├── general.ts            # 通用任务代理
│       ├── explore.ts            # 代码探索代理
│       └── index.ts
│
├── tool/
│   ├── ToolManager.ts            # 统一工具管理器
│   ├── FunctionToolManager.ts   # 函数工具管理器
│   ├── Task/                     # Task 工具（调用子代理）
│   │   ├── index.ts
│   │   ├── definitions.ts
│   │   └── executors.ts
│   └── ...其他工具
│
└── session/
    ├── SessionManager.ts         # 会话管理器
    ├── types.ts
    └── storage.ts                # 会话存储
```

---

## 三、核心类设计

### 3.1 AgentManager（子代理管理器）

```typescript
// packages/core/src/core/agent/AgentManager.ts
import { EventEmitter } from 'events';
import type { AgentConfig, AgentMode } from './types';

export class AgentManager extends EventEmitter {
  private agents: Map<string, AgentConfig> = new Map();

  constructor() {
    super();
    this.registerBuiltinAgents();
  }

  private registerBuiltinAgents() {
    // 注册内置子代理
    this.register({
      name: 'general',
      mode: 'subagent',
      description: 'General-purpose agent for complex tasks',
      tools: {
        todowrite: false,
        todoread: false,
      },
    });

    this.register({
      name: 'explore',
      mode: 'subagent',
      description: 'Fast agent for exploring codebases',
      tools: {
        todowrite: false,
        todoread: false,
        write: false,
      },
    });
  }

  register(config: AgentConfig) {
    this.agents.set(config.name, config);
    this.emit('agent:registered', config);
  }

  get(name: string): AgentConfig | undefined {
    return this.agents.get(name);
  }

  list(mode?: AgentMode): AgentConfig[] {
    const all = Array.from(this.agents.values());
    if (!mode) return all;
    return all.filter((a) => a.mode === mode || a.mode === 'all');
  }

  // 获取可用的子代理（排除 primary）
  getSubagents(): AgentConfig[] {
    return this.list().filter((a) => a.mode !== 'primary');
  }
}
```

### 3.2 AgentExecutor（子代理执行器）

```typescript
// packages/core/src/core/agent/AgentExecutor.ts
import type { FunctionToolManager } from '../tool/FunctionToolManager';
import type { SessionManager } from '../session/SessionManager';
import type { AgentConfig, AgentExecutionContext } from './types';

export class AgentExecutor {
  constructor(
    private functionTools: FunctionToolManager,
    private sessionManager: SessionManager
  ) {}

  async execute(agent: AgentConfig, context: AgentExecutionContext): Promise<AgentExecutionResult> {
    // 1. 创建子会话
    const session = await this.sessionManager.create({
      parentId: context.sessionId,
      title: `${context.description} (@${agent.name})`,
      agentName: agent.name,
    });

    // 2. 构建工具集（隔离）
    const tools = this.buildToolSet(agent);

    // 3. 订阅事件
    const cleanup = this.subscribeEvents(session.id, context);

    try {
      // 4. 执行 LLM 循环
      const result = await this.runLLMLoop({
        sessionId: session.id,
        model: agent.model ?? context.model,
        tools,
        prompt: context.prompt,
        systemPrompt: agent.systemPrompt,
      });

      return {
        sessionId: session.id,
        output: result.text,
        toolCalls: result.toolCalls,
        metadata: {
          agentName: agent.name,
          duration: Date.now() - session.createdAt,
        },
      };
    } finally {
      cleanup();
    }
  }

  private buildToolSet(agent: AgentConfig) {
    // 获取所有函数工具
    const allTools = this.functionTools.getAll();

    // 应用代理的工具配置
    const tools = new Map();
    for (const [name, tool] of allTools) {
      // 检查是否被禁用
      if (agent.tools?.[name] === false) continue;
      tools.set(name, tool);
    }

    // 确保不包含 task 工具（防止递归）
    tools.delete('task');

    return tools;
  }

  private subscribeEvents(sessionId: string, context: AgentExecutionContext) {
    const handler = (event: any) => {
      if (event.sessionId !== sessionId) return;

      // 转发事件给父会话
      context.onProgress?.({
        type: 'tool_call',
        sessionId,
        toolName: event.toolName,
        status: event.status,
      });
    };

    this.sessionManager.on('tool:executed', handler);

    return () => {
      this.sessionManager.off('tool:executed', handler);
    };
  }

  private async runLLMLoop(options: LLMLoopOptions) {
    // 实现 LLM 循环逻辑
    // 类似 OpenCode 的 SessionPrompt.prompt
    // ...
  }
}
```

### 3.3 AgentWrapper（包装为工具）

```typescript
// packages/core/src/core/agent/AgentWrapper.ts
import type { ToolDefinition } from '../tool/types';
import type { AgentManager } from './AgentManager';
import type { AgentExecutor } from './AgentExecutor';

export class AgentWrapper {
  constructor(
    private agentManager: AgentManager,
    private agentExecutor: AgentExecutor
  ) {}

  // 将子代理包装为 Task 工具
  createTaskTool(): ToolDefinition {
    return {
      name: 'task',
      description: this.generateDescription(),
      parameters: {
        type: 'object',
        properties: {
          description: {
            type: 'string',
            description: 'Short description of the task (3-5 words)',
          },
          prompt: {
            type: 'string',
            description: 'Detailed task for the agent to perform',
          },
          subagent_type: {
            type: 'string',
            description: 'Type of specialized agent to use',
            enum: this.agentManager.getSubagents().map((a) => a.name),
          },
          session_id: {
            type: 'string',
            description: 'Optional: existing session to continue',
            optional: true,
          },
        },
        required: ['description', 'prompt', 'subagent_type'],
      },
      execute: async (params, context) => {
        const agent = this.agentManager.get(params.subagent_type);
        if (!agent) {
          throw new Error(`Unknown agent: ${params.subagent_type}`);
        }

        const result = await this.agentExecutor.execute(agent, {
          sessionId: context.sessionId,
          description: params.description,
          prompt: params.prompt,
          model: context.model,
          onProgress: (event) => {
            context.emit('progress', event);
          },
        });

        return {
          content: result.output,
          metadata: {
            sessionId: result.sessionId,
            toolCalls: result.toolCalls,
            ...result.metadata,
          },
        };
      },
    };
  }

  private generateDescription(): string {
    const subagents = this.agentManager.getSubagents();
    const agentList = subagents.map((a) => `- ${a.name}: ${a.description}`).join('\n');

    return `Launch a specialized agent to handle complex tasks.

Available agents:
${agentList}

Usage notes:
1. Launch multiple agents concurrently when possible
2. Each agent invocation is stateless unless you provide session_id
3. Provide detailed task descriptions for autonomous execution
4. The agent's output is not visible to the user - summarize results`;
  }
}
```

---

## 四、集成到 ToolManager

### 4.1 修改 ToolManager

```typescript
// packages/core/src/core/tool/ToolManager.ts
import { FunctionToolManager } from './FunctionToolManager';
import { AgentManager } from '../agent/AgentManager';
import { AgentExecutor } from '../agent/AgentExecutor';
import { AgentWrapper } from '../agent/AgentWrapper';
import { SessionManager } from '../session/SessionManager';

export class ToolManager {
  private functionTools: FunctionToolManager;
  private agentManager: AgentManager;
  private agentExecutor: AgentExecutor;
  private agentWrapper: AgentWrapper;

  constructor(private sessionManager: SessionManager) {
    // 1. 初始化函数工具管理器
    this.functionTools = new FunctionToolManager();

    // 2. 初始化子代理系统
    this.agentManager = new AgentManager();
    this.agentExecutor = new AgentExecutor(this.functionTools, this.sessionManager);
    this.agentWrapper = new AgentWrapper(this.agentManager, this.agentExecutor);

    // 3. 注册 Task 工具
    this.registerTaskTool();
  }

  private registerTaskTool() {
    const taskTool = this.agentWrapper.createTaskTool();
    this.functionTools.register(taskTool);
  }

  // 获取所有工具（函数工具 + Task 工具）
  getAllTools() {
    return this.functionTools.getAll();
  }

  // 主代理使用的工具（包含 Task）
  getToolsForPrimary() {
    return this.getAllTools();
  }

  // 子代理使用的工具（不包含 Task）
  getToolsForSubagent(agentName: string) {
    const agent = this.agentManager.get(agentName);
    if (!agent) throw new Error(`Unknown agent: ${agentName}`);

    const allTools = this.functionTools.getAll();
    const tools = new Map();

    for (const [name, tool] of allTools) {
      // 排除 task 工具
      if (name === 'task') continue;

      // 应用代理的工具配置
      if (agent.tools?.[name] === false) continue;

      tools.set(name, tool);
    }

    return tools;
  }
}
```

---

## 五、类型定义

```typescript
// packages/core/src/core/agent/types.ts

export type AgentMode = 'primary' | 'subagent' | 'all';

export interface AgentConfig {
  name: string;
  mode: AgentMode;
  description: string;
  systemPrompt?: string;
  model?: {
    provider: string;
    model: string;
  };
  tools?: Record<string, boolean>; // 工具启用/禁用配置
  hidden?: boolean;
}

export interface AgentExecutionContext {
  sessionId: string;
  description: string;
  prompt: string;
  model: {
    provider: string;
    model: string;
  };
  onProgress?: (event: AgentProgressEvent) => void;
}

export interface AgentExecutionResult {
  sessionId: string;
  output: string;
  toolCalls: ToolCall[];
  metadata: {
    agentName: string;
    duration: number;
  };
}

export interface AgentProgressEvent {
  type: 'tool_call' | 'thinking' | 'completed';
  sessionId: string;
  toolName?: string;
  status?: 'pending' | 'running' | 'completed' | 'failed';
}
```

---

## 六、会话管理

### 6.1 SessionManager 扩展

```typescript
// packages/core/src/core/session/SessionManager.ts
import { EventEmitter } from 'events';
import type { Session, SessionCreateOptions } from './types';

export class SessionManager extends EventEmitter {
  private sessions: Map<string, Session> = new Map();

  async create(options: SessionCreateOptions): Promise<Session> {
    const session: Session = {
      id: this.generateId(),
      parentId: options.parentId,
      title: options.title,
      agentName: options.agentName,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: [],
    };

    this.sessions.set(session.id, session);
    this.emit('session:created', session);

    // 持久化到文件
    await this.persist(session);

    return session;
  }

  async get(id: string): Promise<Session | undefined> {
    return this.sessions.get(id);
  }

  async getChildren(parentId: string): Promise<Session[]> {
    return Array.from(this.sessions.values()).filter((s) => s.parentId === parentId);
  }

  private async persist(session: Session) {
    // 保存到 .reason-code/sessions/{sessionId}.json
    // ...
  }

  private generateId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  }
}
```

---

## 七、使用示例

### 7.1 主代理调用子代理

```typescript
// 主代理的系统提示词中包含 Task 工具说明
const systemPrompt = `
You have access to a 'task' tool that can launch specialized agents:

Available agents:
- general: For complex research and multi-step tasks
- explore: For quickly exploring codebases

Example usage:
<tool_use>
  <tool_name>task</tool_name>
  <parameters>
    <description>Search for API endpoints</description>
    <prompt>Find all API endpoint definitions in the codebase and summarize their purposes</prompt>
    <subagent_type>explore</subagent_type>
  </parameters>
</tool_use>
`;

// LLM 返回工具调用
const toolCall = {
  name: 'task',
  parameters: {
    description: 'Search for API endpoints',
    prompt: 'Find all API endpoint definitions...',
    subagent_type: 'explore',
  },
};

// ToolManager 执行
const result = await toolManager.executeTool(toolCall, context);
// result.metadata.sessionId 可用于继续对话
```

### 7.2 并行调用多个子代理

```typescript
// LLM 可以并行调用多个子代理
const toolCalls = [
  {
    name: 'task',
    parameters: {
      description: 'Analyze frontend',
      prompt: 'Analyze the React components structure',
      subagent_type: 'explore',
    },
  },
  {
    name: 'task',
    parameters: {
      description: 'Analyze backend',
      prompt: 'Analyze the API routes and database schema',
      subagent_type: 'explore',
    },
  },
];

// 并行执行
const results = await Promise.all(toolCalls.map((call) => toolManager.executeTool(call, context)));
```

---

## 八、实现步骤

### Phase 1: 基础架构（1-2天）

1. ✅ 创建 `agent/` 目录结构
2. ✅ 实现 `AgentManager`
3. ✅ 实现 `AgentConfig` 类型
4. ✅ 注册内置子代理配置

### Phase 2: 执行器（2-3天）

1. ⬜ 实现 `AgentExecutor`
2. ⬜ 实现工具隔离逻辑
3. ⬜ 实现事件订阅机制
4. ⬜ 集成 LLM 循环

### Phase 3: 工具包装（1天）

1. ⬜ 实现 `AgentWrapper`
2. ⬜ 生成动态工具描述
3. ⬜ 集成到 `ToolManager`

### Phase 4: 会话管理（1-2天）

1. ⬜ 扩展 `SessionManager`
2. ⬜ 实现父子会话关联
3. ⬜ 实现会话持久化

### Phase 5: 测试和优化（2-3天）

1. ⬜ 单元测试
2. ⬜ 集成测试
3. ⬜ 性能优化
4. ⬜ 文档完善

---

## 九、关键差异点

### 9.1 相比 OpenCode 的简化

- **权限系统**: 简化为 allow/deny，不支持 ask 模式
- **存储层**: 直接使用文件系统，不需要 Storage 抽象
- **事件系统**: 使用 EventEmitter，不需要全局 Bus

### 9.2 相比原方案的改进

- **去除 AgentToolManager**: 不需要单独的子代理工具管理器
- **简化包装逻辑**: AgentWrapper 直接创建 Task 工具
- **统一入口**: ToolManager 作为唯一的工具访问入口

---

## 十、注意事项

### 10.1 防止递归调用

```typescript
// 在 buildToolSet 中确保移除 task 工具
tools.delete('task');
```

### 10.2 资源清理

```typescript
// 使用 try-finally 确保事件监听器被清理
try {
  const result = await this.runLLMLoop(...)
  return result
} finally {
  cleanup()
}
```

### 10.3 错误处理

```typescript
// 子代理执行失败时，返回友好的错误信息
catch (error) {
  return {
    content: `Subagent execution failed: ${error.message}`,
    metadata: {
      error: true,
      sessionId: session.id
    }
  }
}
```

### 10.4 性能考虑

- 子代理并行执行时注意 API 限流
- 大量工具调用时考虑批处理
- 会话数据定期清理，避免内存泄漏
