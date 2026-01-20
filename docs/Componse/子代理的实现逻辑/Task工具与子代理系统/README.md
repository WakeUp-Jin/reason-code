# Task 工具与子代理系统 - 完整文档

## 概述

本文档集详细解析 OpenCode 项目中 Task 工具和子代理系统的完整实现机制。这是一个精心设计的多代理协作架构，实现了上下文隔离、权限控制和灵活的任务委派。

## 文档结构

### [01-代理模式设计.md](./01-代理模式设计.md)

介绍 OpenCode 的三种代理模式及其设计理念。

**核心内容**:
- `mode: "primary"` - 主代理（build、plan）
- `mode: "subagent"` - 子代理（general、explore）
- `mode: "all"` - 混合代理（用户自定义）
- 权限系统（Permission）
- 工具访问控制
- 内置代理列表

**适合读者**: 想要了解代理系统基础设计的开发者

### [02-Task工具实现细节.md](./02-Task工具实现细节.md)

深入解析 Task 工具的完整实现。

**核心内容**:
- Task 工具的定义结构
- Execute 执行流程（13 个步骤）
- 参数详解（description、prompt、subagent_type、session_id、command）
- 工具权限控制策略
- 事件订阅机制
- 模型继承策略
- 实时元数据更新

**适合读者**: 需要深入理解 Task 工具实现的开发者

### [03-SubtaskPart机制.md](./03-SubtaskPart机制.md)

详解 SubtaskPart 这种特殊的消息部分及其执行机制。

**核心内容**:
- SubtaskPart 数据结构
- 创建条件和时机
- 执行流程（10 个步骤）
- 合成用户消息的作用
- SubtaskPart vs 直接调用 Task 对比
- 消息结构示例

**适合读者**: 想要理解命令如何触发子代理的开发者

### [04-会话隔离与子会话.md](./04-会话隔离与子会话.md)

解析会话隔离机制和子会话的实现。

**核心内容**:
- Session 数据结构
- 子会话的创建逻辑
- 会话树结构
- 上下文隔离（消息、工具、状态）
- 会话间通信
- 会话复用
- 会话生命周期

**适合读者**: 需要了解上下文隔离和会话管理的开发者

### [05-完整调用流程.md](./05-完整调用流程.md)

详细描述三种调用方式的完整流程。

**核心内容**:
- 流程 1: 命令触发 SubtaskPart（14 个步骤）
- 流程 2: LLM 主动调用 Task（11 个步骤）
- 流程 3: @提及调用（9 个步骤）
- 三种流程的对比
- 消息流对比
- 关键设计要点

**适合读者**: 想要完整理解整个调用链路的开发者

### [06-设计总结与最佳实践.md](./06-设计总结与最佳实践.md)

总结系统设计并提供最佳实践指南。

**核心内容**:
- 系统架构总览
- 设计原则（单一职责、开放封闭等）
- 关键设计决策及其理由
- 最佳实践（8 个实践案例）
- 性能优化建议
- 常见陷阱与解决方案
- 未来改进方向

**适合读者**: 需要实际应用或扩展子代理系统的开发者

## 快速导航

### 按主题查找

| 主题 | 推荐文档 |
|------|---------|
| 理解代理模式 | [01-代理模式设计](./01-代理模式设计.md) |
| Task 工具如何工作 | [02-Task工具实现细节](./02-Task工具实现细节.md) |
| 命令如何触发子代理 | [03-SubtaskPart机制](./03-SubtaskPart机制.md) |
| 上下文如何隔离 | [04-会话隔离与子会话](./04-会话隔离与子会话.md) |
| 完整的调用链路 | [05-完整调用流程](./05-完整调用流程.md) |
| 实际应用指南 | [06-设计总结与最佳实践](./06-设计总结与最佳实践.md) |

### 按角色查找

**初学者**:
1. 先读 [01-代理模式设计](./01-代理模式设计.md)，了解基础概念
2. 再读 [05-完整调用流程](./05-完整调用流程.md)，理解整体流程
3. 最后读 [06-设计总结与最佳实践](./06-设计总结与最佳实践.md)，学习应用

**开发者**:
1. 从 [02-Task工具实现细节](./02-Task工具实现细节.md) 开始，深入代码
2. 阅读 [03-SubtaskPart机制](./03-SubtaskPart机制.md) 和 [04-会话隔离与子会话](./04-会话隔离与子会话.md)，理解核心机制
3. 参考 [06-设计总结与最佳实践](./06-设计总结与最佳实践.md)，应用到实际开发

**架构师**:
1. 重点阅读 [01-代理模式设计](./01-代理模式设计.md) 和 [06-设计总结与最佳实践](./06-设计总结与最佳实践.md)
2. 了解 [04-会话隔离与子会话](./04-会话隔离与子会话.md) 的隔离机制
3. 参考设计原则和决策，应用到自己的系统

## 核心概念速查

### 三种代理模式

| 模式 | 用途 | 可被 Task 调用 | Tab 切换 |
|------|------|---------------|---------|
| primary | 主代理，用户交互 | ❌ | ✅ |
| subagent | 子代理，任务执行 | ✅ | ❌ |
| all | 混合，灵活使用 | ✅ | ✅ |

### 三种调用方式

| 方式 | 触发 | 决策 | 速度 | 适用场景 |
|------|------|------|------|---------|
| 命令触发 | `/command` | 命令系统 | 最快 | 用户明确知道用哪个子代理 |
| LLM 调用 | 普通消息 | LLM 推理 | 较慢 | 主代理自主决策 |
| @提及 | `@agent` | 用户 + LLM | 较慢 | 用户指定，LLM 决定细节 |

### 关键组件

| 组件 | 职责 | 文件路径 |
|------|------|---------|
| Agent | 代理定义 | `packages/opencode/src/agent/agent.ts` |
| TaskTool | 子代理执行 | `packages/opencode/src/tool/task.ts` |
| SubtaskPart | 声明式调用 | `packages/opencode/src/session/message-v2.ts` |
| SessionPrompt | 消息处理 | `packages/opencode/src/session/prompt.ts` |
| Session | 会话管理 | `packages/opencode/src/session/index.ts` |

## 关键代码位置

### 代理模式相关

```typescript
// packages/opencode/src/agent/agent.ts

// 代理模式定义（第 23 行）
mode: z.enum(["subagent", "primary", "all"])

// 内置代理配置（第 117-198 行）
const result: Record<string, Info> = {
  build: { mode: "primary", ... },
  plan: { mode: "primary", ... },
  general: { mode: "subagent", ... },
  explore: { mode: "subagent", ... },
}

// 过滤主代理（第 15 行，task.ts）
const agents = await Agent.list()
  .then((x) => x.filter((a) => a.mode !== "primary"))
```

### Task 工具相关

```typescript
// packages/opencode/src/tool/task.ts

// 创建子会话（第 40-44 行）
return await Session.create({
  parentID: ctx.sessionID,
  title: params.description + ` (@${agent.name} subagent)`,
})

// 工具权限控制（第 100-106 行）
tools: {
  todowrite: false,
  todoread: false,
  task: false,
  ...agent.tools,
}

// 事件订阅（第 57-77 行）
Bus.subscribe(MessageV2.Event.PartUpdated, async (evt) => {
  // 实时更新元数据
})
```

### SubtaskPart 相关

```typescript
// packages/opencode/src/session/prompt.ts

// 创建 SubtaskPart（第 1352-1364 行）
const parts = (agent.mode === "subagent" && command.subtask !== false) ||
              command.subtask === true
    ? [{ type: "subtask", agent: agent.name, ... }]
    : await resolvePromptParts(template)

// 执行 SubtaskPart（第 286-443 行）
if (task?.type === "subtask") {
  const taskTool = await TaskTool.init()
  // 创建 assistant 消息和 tool part
  // 执行 taskTool.execute()
  // 更新 part 状态
  // 添加合成用户消息
}
```

## 学习路径建议

### 第一阶段：理解基础（1-2 小时）

1. 阅读 [01-代理模式设计](./01-代理模式设计.md) - 30 分钟
2. 快速浏览 [05-完整调用流程](./05-完整调用流程.md) - 20 分钟
3. 在 OpenCode 项目中尝试使用 `/explore` 命令 - 10 分钟
4. 查看对应的子会话和消息 - 10 分钟

### 第二阶段：深入机制（3-4 小时）

1. 仔细阅读 [02-Task工具实现细节](./02-Task工具实现细节.md) - 60 分钟
2. 阅读 [03-SubtaskPart机制](./03-SubtaskPart机制.md) - 40 分钟
3. 阅读 [04-会话隔离与子会话](./04-会话隔离与子会话.md) - 50 分钟
4. 对比源代码，验证理解 - 30 分钟

### 第三阶段：实践应用（2-3 小时）

1. 阅读 [06-设计总结与最佳实践](./06-设计总结与最佳实践.md) - 40 分钟
2. 创建自定义子代理 - 30 分钟
3. 创建自定义命令 - 20 分钟
4. 实验会话复用和并行执行 - 30 分钟

## 实验建议

### 实验 1: 追踪消息流

1. 启用详细日志
2. 执行 `/explore find all tests`
3. 观察：
   - SubtaskPart 的创建
   - 子会话的创建（session ID）
   - 工具调用（glob、grep 等）
   - 合成用户消息的添加
   - 最终结果的返回

### 实验 2: 对比三种调用方式

执行相同的任务，使用三种不同方式：

```bash
# 方式 1: 命令触发
/explore find all TypeScript files

# 方式 2: LLM 调用（普通消息）
Please find all TypeScript files in the project

# 方式 3: @提及
@explore find all TypeScript files
```

观察：
- 执行速度差异
- 消息结构差异
- LLM token 消耗差异

### 实验 3: 会话复用

1. 创建子代理会话并记录 session ID
2. 使用 session_id 参数复用会话
3. 查看子会话的消息历史
4. 观察上下文是如何保持的

### 实验 4: 权限测试

创建受限子代理，尝试：
- 调用被禁用的工具（应该失败）
- 嵌套调用 Task 工具（应该失败）
- 修改文件（如果禁用了 edit/write）

## 贡献指南

如果你发现文档中的错误或需要补充：

1. 提交 Issue 说明问题
2. 或直接提交 PR 修正

文档维护原则：
- 保持准确性：与源代码同步
- 保持完整性：覆盖核心机制
- 保持清晰性：使用图表和示例
- 保持实用性：提供最佳实践

## 相关资源

### OpenCode 项目

- GitHub: [opencode-ai/opencode](https://github.com/opencode-ai/opencode)
- 官方文档: 待补充

### 相关技术

- AI SDK: [Vercel AI SDK](https://sdk.vercel.ai/)
- Zod: [Zod Schema Validation](https://zod.dev/)
- Bun: [Bun Runtime](https://bun.sh/)

## 版本信息

- 文档版本: 1.0.0
- 基于代码版本: OpenCode v1.0.191
- 最后更新: 2026-01-15

---

**开始阅读**: [01-代理模式设计.md](./01-代理模式设计.md)
