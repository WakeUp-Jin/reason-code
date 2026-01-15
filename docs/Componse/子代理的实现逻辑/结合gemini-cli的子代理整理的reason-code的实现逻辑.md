# OpenCode 子代理实现方案

> 基于 Gemini CLI 的子代理架构，结合我们的讨论，整理出适合 OpenCode 项目的实现方案。

## 目录

- [设计原则](#设计原则)
- [整体架构](#整体架构)
- [目录结构](#目录结构)
- [核心类设计](#核心类设计)
- [依赖关系](#依赖关系)
- [初始化流程](#初始化流程)
- [调用流程](#调用流程)
- [实现要点](#实现要点)
- [与 Gemini CLI 的对比](#与-gemini-cli-的对比)

---

## 设计原则

### 1. 分层管理
```
函数工具层 (FunctionToolManager)
  ↓ 被依赖
智能体工具层 (AgentToolManager)
  ↓ 统一协调
统一管理层 (ToolManager)
```

### 2. 职责分离
- **FunctionToolManager**：管理基础工具（read_file, grep 等）
- **AgentToolManager**：管理子代理定义
- **AgentToolWrapper**：包装转换（配置 → 工具）
- **AgentExecutor**：执行循环
- **ToolManager**：统一协调

### 3. 依赖注入
- 子代理管理器注入函数工具管理器
- 子代理包装器注入函数工具管理器
- 子代理执行器注入函数工具管理器

### 4. 自然隔离
- 子代理只能访问 FunctionToolManager
- 无法访问 AgentToolManager（避免递归调用）

---

## 整体架构

```
┌─────────────────────────────────────────────────────────────┐
│                      MainAgent                               │
│                      (主智能体)                               │
└─────────────────────────────────────────────────────────────┘
                          │
                          │ 使用
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                    ToolManager                               │
│                    (统一工具管理器)                           │
│                                                               │
│  ┌────────────────────┐      ┌────────────────────┐        │
│  │ FunctionToolManager│      │ AgentToolManager   │        │
│  │ (函数工具管理)      │      │ (子代理管理)        │        │
│  └────────────────────┘      └────────────────────┘        │
└─────────────────────────────────────────────────────────────┘
           │                              │
           │                              │
           ▼                              ▼
    ┌──────────┐                  ┌──────────────┐
    │ BaseTool │                  │AgentToolWrapper│
    │  (基类)  │                  │  (包装器)      │
    └──────────┘                  └──────────────┘
           │                              │
           │                              │
           ▼                              ▼
    ┌──────────┐                  ┌──────────────┐
    │ReadFile  │                  │AgentExecutor │
    │Grep      │                  │  (执行器)     │
    │Ls        │                  └──────────────┘
    │...       │                          │
    └──────────┘                          │
                                          │ 使用
                                          ▼
                                  ┌──────────────────┐
                                  │FunctionToolManager│
                                  │  (复用)           │
                                  └──────────────────┘
```

---

## 目录结构

```
packages/core/src/
├── tool/
│   ├── ToolManager.ts              # 统一工具管理器（协调层）
│   ├── FunctionToolManager.ts      # 函数工具管理器
│   ├── BaseTool.ts                 # 工具基类
│   └── tools/
│       ├── ReadFileTool.ts
│       ├── GrepTool.ts
│       ├── LsTool.ts
│       └── ...
│
├── agent/
│   ├── AgentToolManager.ts         # 子代理管理器
│   ├── AgentToolWrapper.ts         # 子代理包装器
│   ├── AgentExecutor.ts            # 子代理执行器
│   ├── types.ts                    # 类型定义
│   └── agents/
│       ├── index.ts                # 导出所有子代理
│       ├── CodeInvestigator.ts
│       ├── TestGenerator.ts
│       └── ...
│
└── core/
    └── MainAgent.ts                # 主智能体
```

---

## 核心类设计

### 1. BaseTool（工具基类）

**位置**：`tool/BaseTool.ts`

**职责**：
- 定义工具的基本接口
- 提供通用的工具行为

**核心接口**：
```typescript
abstract class BaseTool {
  name: string
  description: string
  schema: JSONSchema
  
  abstract execute(params: unknown, signal?: AbortSignal): Promise<ToolResult>
}
```

---

### 2. FunctionToolManager（函数工具管理器）

**位置**：`tool/FunctionToolManager.ts`

**职责**：
- 管理所有函数工具（read_file, grep, ls 等）
- 提供注册、查询接口
- 被主智能体和子代理共享使用

**核心接口**：
```typescript
class FunctionToolManager {
  private tools: Map<string, BaseTool>
  
  register(tool: BaseTool): void
  get(name: string): BaseTool | undefined
  getAll(): BaseTool[]
}
```

**关键点**：
- 这是基础层，被多处复用
- 主智能体通过 ToolManager 使用
- 子代理直接使用（注入）

---

### 3. AgentToolManager（子代理管理器）

**位置**：`agent/AgentToolManager.ts`

**职责**：
- 管理所有子代理定义（AgentDefinition）
- 创建 AgentToolWrapper 实例
- 注入 FunctionToolManager 给子代理使用

**核心接口**：
```typescript
class AgentToolManager {
  private agents: Map<string, AgentDefinition>
  private functionToolManager: FunctionToolManager
  private config: Config
  
  constructor(
    functionToolManager: FunctionToolManager,
    config: Config
  )
  
  register(definition: AgentDefinition): void
  get(name: string): AgentToolWrapper | undefined
  getAll(): AgentToolWrapper[]
}
```

**关键点**：
- 依赖 FunctionToolManager（注入）
- 创建 AgentToolWrapper 时传递 FunctionToolManager
- 管理的是配置（AgentDefinition），返回的是工具（AgentToolWrapper）

---

### 4. AgentToolWrapper（子代理包装器）

**位置**：`agent/AgentToolWrapper.ts`

**职责**：
- 将 AgentDefinition（配置）包装成 BaseTool（工具）
- 转换 inputConfig 为 JSONSchema
- 创建并调用 AgentExecutor

**核心接口**：
```typescript
class AgentToolWrapper extends BaseTool {
  private definition: AgentDefinition
  private functionToolManager: FunctionToolManager
  private config: Config
  
  constructor(
    definition: AgentDefinition,
    functionToolManager: FunctionToolManager,
    config: Config
  )
  
  execute(params: AgentInputs, signal?: AbortSignal): Promise<ToolResult>
}
```

**关键点**：
- 继承 BaseTool，符合工具接口
- 持有 FunctionToolManager 引用
- execute() 方法内创建 AgentExecutor 并运行

**为什么需要包装器？**
- AgentDefinition 是配置（静态）
- BaseTool 是工具（可执行）
- 包装器是"翻译官"，连接两个世界

---

### 5. AgentExecutor（子代理执行器）

**位置**：`agent/AgentExecutor.ts`

**职责**：
- 执行子代理的主循环
- 调用 Gemini 模型
- 使用 FunctionToolManager 执行函数工具
- 处理 complete_task 终止

**核心接口**：
```typescript
class AgentExecutor {
  private definition: AgentDefinition
  private functionToolManager: FunctionToolManager
  private config: Config
  
  constructor(
    definition: AgentDefinition,
    functionToolManager: FunctionToolManager,
    config: Config
  )
  
  run(params: AgentInputs, signal?: AbortSignal): Promise<AgentOutput>
}
```

**关键点**：
- 只能访问 FunctionToolManager（隔离）
- 无法访问 AgentToolManager（避免递归）
- 实现完整的对话循环

**执行循环伪代码**：
```typescript
async run(params: AgentInputs) {
  let turnCounter = 0;
  
  while (true) {
    // 1. 检查终止条件
    if (turnCounter >= maxTurns) break;
    
    // 2. 调用 Gemini 模型
    const response = await callModel(params);
    
    // 3. 处理工具调用
    for (const toolCall of response.toolCalls) {
      if (toolCall.name === 'complete_task') {
        // 完成，返回结果
        return { result: toolCall.args.result };
      }
      
      // 4. 执行函数工具
      const tool = this.functionToolManager.get(toolCall.name);
      if (tool) {
        await tool.execute(toolCall.args);
      }
    }
    
    turnCounter++;
  }
}
```

---

### 6. ToolManager（统一工具管理器）

**位置**：`tool/ToolManager.ts`

**职责**：
- 协调 FunctionToolManager 和 AgentToolManager
- 提供统一的工具查询接口
- 对主智能体暴露单一入口

**核心接口**：
```typescript
class ToolManager {
  private functionToolManager: FunctionToolManager
  private agentToolManager: AgentToolManager
  
  constructor(
    functionToolManager: FunctionToolManager,
    agentToolManager: AgentToolManager
  )
  
  get(name: string): BaseTool | undefined
  getAllTools(): BaseTool[]
  getType(name: string): 'function' | 'agent' | undefined
}
```

**关键点**：
- 组合两个管理器
- 统一查询接口（先查函数工具，再查子代理）
- 主智能体只需要知道 ToolManager

**查询逻辑**：
```typescript
get(name: string): BaseTool | undefined {
  // 先找函数工具
  let tool = this.functionToolManager.get(name);
  if (tool) return tool;
  
  // 再找子代理（返回包装后的工具）
  return this.agentToolManager.get(name);
}
```

---

### 7. MainAgent（主智能体）

**位置**：`core/MainAgent.ts`

**职责**：
- 主智能体的核心逻辑
- 使用 ToolManager 调用工具
- 不需要区分函数工具和子代理

**核心接口**：
```typescript
class MainAgent {
  private toolManager: ToolManager
  
  constructor(toolManager: ToolManager)
  
  async run(): Promise<void>
}
```

**关键点**：
- 只依赖 ToolManager
- 统一调用接口，不需要知道工具类型
- 简化主智能体的实现

---

## 依赖关系

### 依赖图

```
MainAgent
  └─> ToolManager
        ├─> FunctionToolManager
        │     └─> BaseTool (继承)
        │           └─> ReadFileTool, GrepTool, ...
        │
        └─> AgentToolManager
              ├─> 依赖 FunctionToolManager (注入)
              └─> 创建 AgentToolWrapper
                    ├─> 继承 BaseTool
                    ├─> 依赖 FunctionToolManager (注入)
                    └─> 创建 AgentExecutor
                          └─> 依赖 FunctionToolManager (注入)
```

### 详细依赖关系

```
BaseTool (基类)
  ↑
  ├─ ReadFileTool (继承)
  ├─ GrepTool (继承)
  └─ AgentToolWrapper (继承)

FunctionToolManager
  ├─ 管理 → BaseTool 实例
  ├─ 被注入 → AgentToolManager
  ├─ 被注入 → AgentToolWrapper
  └─ 被注入 → AgentExecutor

AgentToolManager
  ├─ 依赖 → FunctionToolManager (构造函数注入)
  └─ 创建 → AgentToolWrapper

AgentToolWrapper
  ├─ 继承 → BaseTool
  ├─ 依赖 → FunctionToolManager (构造函数注入)
  └─ 创建 → AgentExecutor

AgentExecutor
  └─ 依赖 → FunctionToolManager (构造函数注入)

ToolManager
  ├─ 组合 → FunctionToolManager
  └─ 组合 → AgentToolManager

MainAgent
  └─> 依赖 → ToolManager
```

### 关键依赖链

**子代理使用函数工具的路径**：
```
AgentExecutor
  └─> functionToolManager.get('grep')
        └─> GrepTool.execute()
```

**主智能体调用子代理的路径**：
```
MainAgent
  └─> toolManager.get('codebase_investigator')
        └─> agentToolManager.get('codebase_investigator')
              └─> new AgentToolWrapper(definition, functionToolManager, config)
                    └─> execute()
                          └─> new AgentExecutor(definition, functionToolManager, config)
                                └─> run()
```

---

## 初始化流程

### 完整初始化代码

```typescript
// ===== 步骤 1: 创建函数工具管理器 =====
const functionToolManager = new FunctionToolManager();

// 注册所有函数工具
functionToolManager.register(new ReadFileTool());
functionToolManager.register(new GrepTool());
functionToolManager.register(new LsTool());
functionToolManager.register(new GlobTool());
// ... 注册更多工具

// ===== 步骤 2: 创建子代理管理器 =====
// 注入函数工具管理器
const agentToolManager = new AgentToolManager(
  functionToolManager,  // 依赖注入
  config
);

// 注册所有子代理定义
import * as agents from './agent/agents';
Object.values(agents).forEach(agentDef => {
  agentToolManager.register(agentDef);
});

// 或者手动注册
agentToolManager.register(CodeInvestigatorAgent);
agentToolManager.register(TestGeneratorAgent);
agentToolManager.register(DocumentGeneratorAgent);

// ===== 步骤 3: 创建统一工具管理器 =====
const toolManager = new ToolManager(
  functionToolManager,
  agentToolManager
);

// ===== 步骤 4: 创建主智能体 =====
const mainAgent = new MainAgent(toolManager);

// ===== 步骤 5: 运行 =====
await mainAgent.run();
```

### 初始化流程图

```
1. 创建 FunctionToolManager
   └─> 注册所有函数工具

2. 创建 AgentToolManager
   ├─> 注入 FunctionToolManager
   └─> 注册所有子代理定义

3. 创建 ToolManager
   ├─> 组合 FunctionToolManager
   └─> 组合 AgentToolManager

4. 创建 MainAgent
   └─> 注入 ToolManager

5. 运行
   └─> mainAgent.run()
```

---

## 调用流程

### 场景 1：主智能体调用函数工具

```
用户输入: "读取 README.md 文件"

MainAgent.run()
  └─> 调用 Gemini 模型
        └─> 返回工具调用: { name: 'read_file', args: { path: 'README.md' } }
              └─> toolManager.get('read_file')
                    └─> functionToolManager.get('read_file')
                          └─> ReadFileTool
                                └─> execute({ path: 'README.md' })
                                      └─> 返回文件内容
```

### 场景 2：主智能体调用子代理

```
用户输入: "找到所有认证相关的代码"

MainAgent.run()
  └─> 调用 Gemini 模型
        └─> 返回工具调用: { 
              name: 'codebase_investigator', 
              args: { objective: 'find auth code' } 
            }
              └─> toolManager.get('codebase_investigator')
                    └─> agentToolManager.get('codebase_investigator')
                          └─> 创建 AgentToolWrapper
                                └─> execute({ objective: 'find auth code' })
                                      └─> 创建 AgentExecutor
                                            └─> run()
                                                  ├─> 调用 Gemini 模型
                                                  │     └─> 返回: { name: 'grep', args: { pattern: 'auth' } }
                                                  │
                                                  ├─> functionToolManager.get('grep')
                                                  │     └─> GrepTool.execute({ pattern: 'auth' })
                                                  │
                                                  ├─> 调用 Gemini 模型
                                                  │     └─> 返回: { name: 'read_file', args: { path: 'src/auth.ts' } }
                                                  │
                                                  ├─> functionToolManager.get('read_file')
                                                  │     └─> ReadFileTool.execute({ path: 'src/auth.ts' })
                                                  │
                                                  └─> 调用 Gemini 模型
                                                        └─> 返回: { 
                                                              name: 'complete_task', 
                                                              args: { result: {...} } 
                                                            }
                                                              └─> 返回结果给主智能体
```

### 关键流程图

```
┌─────────────┐
│  MainAgent  │
└──────┬──────┘
       │
       │ get('codebase_investigator')
       ▼
┌─────────────┐
│ ToolManager │
└──────┬──────┘
       │
       │ get('codebase_investigator')
       ▼
┌──────────────────┐
│AgentToolManager  │
└──────┬───────────┘
       │
       │ 创建 AgentToolWrapper
       ▼
┌──────────────────┐
│AgentToolWrapper  │
└──────┬───────────┘
       │
       │ execute()
       ▼
┌──────────────────┐
│ AgentExecutor    │
└──────┬───────────┘
       │
       │ run() - 循环开始
       │
       ├─> 调用 Gemini 模型
       │
       ├─> functionToolManager.get('grep')
       │     └─> GrepTool.execute()
       │
       ├─> 调用 Gemini 模型
       │
       ├─> functionToolManager.get('read_file')
       │     └─> ReadFileTool.execute()
       │
       ├─> 调用 Gemini 模型
       │
       └─> complete_task
             └─> 返回结果
```

---

## 实现要点

### 1. 依赖注入是核心

**为什么重要？**
- 子代理需要使用函数工具
- 但不能访问其他子代理（避免递归）
- 通过注入 FunctionToolManager 实现隔离

**实现方式**：
```typescript
// AgentToolManager 创建 AgentToolWrapper 时注入
get(name: string): AgentToolWrapper | undefined {
  const definition = this.agents.get(name);
  if (!definition) return undefined;
  
  return new AgentToolWrapper(
    definition,
    this.functionToolManager,  // 注入
    this.config
  );
}

// AgentToolWrapper 创建 AgentExecutor 时注入
execute(params: AgentInputs) {
  const executor = new AgentExecutor(
    this.definition,
    this.functionToolManager,  // 传递
    this.config
  );
  
  return executor.run(params);
}
```

### 2. 包装器的作用

**问题**：
- AgentDefinition 是配置（静态）
- BaseTool 是工具（可执行）
- 主智能体只认识 BaseTool

**解决**：
- AgentToolWrapper 继承 BaseTool
- 持有 AgentDefinition
- 实现 execute() 方法

**效果**：
- 主智能体看到的是 BaseTool
- 实际执行的是子代理循环
- 完美的适配器模式

### 3. 执行器的隔离

**关键设计**：
```typescript
class AgentExecutor {
  constructor(
    private definition: AgentDefinition,
    private functionToolManager: FunctionToolManager,  // 只有这个
    private config: Config
  ) {}
  
  async run(params: AgentInputs) {
    // 只能访问 functionToolManager
    const tool = this.functionToolManager.get(toolName);
    
    // 无法访问 agentToolManager
    // 自然避免了递归调用
  }
}
```

### 4. 统一管理器的协调

**查询逻辑**：
```typescript
class ToolManager {
  get(name: string): BaseTool | undefined {
    // 先查函数工具
    let tool = this.functionToolManager.get(name);
    if (tool) return tool;
    
    // 再查子代理
    return this.agentToolManager.get(name);
  }
}
```

**效果**：
- 主智能体只需要一个接口
- 不需要知道工具类型
- 简化调用逻辑

### 5. 类型区分（可选）

**如果需要特殊处理**：
```typescript
class ToolManager {
  getType(name: string): 'function' | 'agent' | undefined {
    if (this.functionToolManager.get(name)) return 'function';
    if (this.agentToolManager.get(name)) return 'agent';
    return undefined;
  }
}

// 使用
const type = toolManager.getType('codebase_investigator');
if (type === 'agent') {
  // 子代理可能需要更长的超时时间
  timeout = 5 * 60 * 1000;
}
```

---

## 与 Gemini CLI 的对比

### 相同点

1. **并行目录结构**
   - Gemini CLI: `tools/` 和 `agents/`
   - OpenCode: `tool/` 和 `agent/`

2. **包装器模式**
   - Gemini CLI: `SubagentToolWrapper`
   - OpenCode: `AgentToolWrapper`

3. **执行器分离**
   - Gemini CLI: `AgentExecutor`
   - OpenCode: `AgentExecutor`

4. **注册表管理**
   - Gemini CLI: `AgentRegistry`
   - OpenCode: `AgentToolManager`

### 不同点

1. **管理器设计**
   ```
   Gemini CLI:
   - ToolRegistry (管理所有工具，包括包装后的子代理)
   - AgentRegistry (管理子代理定义)
   
   OpenCode:
   - ToolManager (统一协调)
   - FunctionToolManager (管理函数工具)
   - AgentToolManager (管理子代理)
   ```

2. **依赖注入方式**
   ```
   Gemini CLI:
   - 子代理执行时创建隔离的 ToolRegistry
   
   OpenCode:
   - 注入共享的 FunctionToolManager
   ```

3. **命名风格**
   ```
   Gemini CLI:
   - SubagentToolWrapper
   - SubagentInvocation
   
   OpenCode:
   - AgentToolWrapper
   - AgentExecutor
   ```

### 为什么有这些不同？

**OpenCode 的优化**：
1. **更清晰的分层**：FunctionToolManager 和 AgentToolManager 职责更明确
2. **更好的复用**：FunctionToolManager 被多处共享，不需要创建多个实例
3. **更简单的依赖**：直接注入 FunctionToolManager，而不是创建新的 ToolRegistry

---

## 总结

### 核心设计

1. **分层管理**：函数工具层 → 智能体工具层 → 统一管理层
2. **依赖注入**：子代理通过注入使用函数工具
3. **包装转换**：AgentToolWrapper 连接配置和执行
4. **自然隔离**：子代理只能访问函数工具

### 关键类（7 个）

1. **BaseTool** - 工具基类
2. **FunctionToolManager** - 函数工具管理
3. **AgentToolManager** - 子代理管理
4. **AgentToolWrapper** - 子代理包装
5. **AgentExecutor** - 子代理执行
6. **ToolManager** - 统一协调
7. **MainAgent** - 主智能体

### 目录（3 个）

- `tool/` - 函数工具相关
- `agent/` - 子代理相关
- `core/` - 主智能体

### 优势

1. ✅ **概念清晰**：工具和代理分离
2. ✅ **职责单一**：每个类职责明确
3. ✅ **易于扩展**：添加新工具或子代理很简单
4. ✅ **自然隔离**：子代理无法递归调用
5. ✅ **复用性强**：FunctionToolManager 被多处共享

---

## 参考资料

- [Gemini CLI 子代理实现](./gemini-cli的子代理实现/README.md)
- [Gemini CLI 源码](https://github.com/google-gemini/gemini-cli)

---

**文档版本**：v1.0  
**创建时间**：2026-01-14  
**最后更新**：2026-01-14
