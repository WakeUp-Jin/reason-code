# Bug 修复：子代理 ExecutionStream 事件未触发

## 🐛 Bug 描述

在 `TaskTool` 执行器中，创建了子代理的 `ExecutionStream` 并订阅了事件，但这些事件永远不会被触发，导致 CLI 无法实时显示子代理的工具调用进度。

## 🔍 问题分析

### 当前代码流程（有问题）

```typescript
// packages/core/src/core/tool/Task/executors.ts

// 1. 创建子代理的 ExecutionStream
const subExecStream = new ExecutionStreamManager();

// 2. 订阅子代理事件
const unsubscribe = subExecStream.on((event) => {
  // 处理事件并转发...
});

// 3. 手动启动
subExecStream.start();

// 4. 执行子代理（❌ 没有传入 subExecStream）
const result = await subAgent.run(prompt, {
  sessionId: sessionId || context?.sessionId || 'unknown',
  approvalMode: context?.approvalMode,
  onConfirmRequired: context?.onConfirmRequired,
  // ❌ 缺少：executionStream: subExecStream
});

// 5. 手动完成
if (result.success) {
  subExecStream.complete();
} else {
  subExecStream.error(result.error || 'Unknown error');
}
```

### Agent.run() 内部实现

```typescript
// packages/core/src/core/agent/Agent.ts

async run(userInput: string, options?: AgentRunOptions): Promise<AgentResult> {
  // ...

  // ❌ 总是使用内部的 executionStream
  this.executionStream.start();

  try {
    const executor = new ToolLoopExecutor(
      this.llmService,
      this.contextManager,
      isolatedToolManager,
      {
        executionStream: this.executionStream,  // ❌ 使用内部的
        // ...
      }
    );

    const loopResult = await executor.run();

    this.executionStream.complete(costCNY);

    return { ... };
  } catch (error) {
    this.executionStream.error(errorMessage);
    return { ... };
  }
}
```

### 问题根源

**两个独立的 ExecutionStream 互不相干**：

```
TaskTool 创建的 subExecStream
  ├─ 订阅事件 ✓
  ├─ 手动 start() ✓
  ├─ 手动 complete() ✓
  └─ ❌ 但没有传给 Agent

Agent 内部的 this.executionStream
  ├─ 自动 start() ✓
  ├─ 发射事件 ✓
  └─ 自动 complete() ✓

结果：subExecStream 的订阅回调永远不会被触发！
```

## 🎯 修复方案

### 核心思路

**让 Agent 支持使用外部传入的 ExecutionStream，而不是总是使用内部的 `this.executionStream`**

---

## 📝 修改步骤

### 步骤 1：修改 `AgentRunOptions` 类型

**文件**：`packages/core/src/core/agent/Agent.ts`

**位置**：第 64-83 行

```typescript
/**
 * Agent 运行选项
 */
export interface AgentRunOptions {
  /** 模型的 Token 限制（由 CLI 层传入） */
  modelLimit?: number;

  /** 会话 ID（用于压缩时引用历史文件） */
  sessionId: string;

  /** 工具确认回调（由 CLI 层提供） */
  onConfirmRequired?: (
    callId: string,
    toolName: string,
    details: ConfirmDetails
  ) => Promise<ConfirmOutcome>;

  /** 批准模式 */
  approvalMode?: ApprovalMode;

  /** 压缩完成回调（用于 CLI 保存检查点） */
  onCompressionComplete?: (event: CompressionCompleteEvent) => void;

  /** ✅ 新增：外部 ExecutionStream（用于子代理） */
  executionStream?: ExecutionStreamManager;
}
```

---

### 步骤 2：修改 `Agent.run()` 方法

**文件**：`packages/core/src/core/agent/Agent.ts`

**位置**：第 305-409 行

**关键修改**：

```typescript
async run(userInput: string, options?: AgentRunOptions): Promise<AgentResult> {
  if (!this.initialized || !this.llmService) {
    throw new Error('Agent not initialized. Call init() first.');
  }

  // 创建新的中断控制器
  this.abortController = new AbortController();

  // 重置事件收集器
  eventBus.reset();

  // 记录执行前的累计费用（用于计算本次执行费用）
  const costBeforeRun = this.sessionStats.getTotalCostCNY();

  // 发射 Agent 调用事件
  eventBus.emit('agent:call', { agentName: this.config.name });

  // ✅ 修改：使用外部传入的 executionStream（如果有），否则使用内部的
  const executionStream = options?.executionStream || this.executionStream;

  // 启动执行流
  executionStream.start();  // ✅ 修改：使用选择的 executionStream

  try {
    // 设置用户输入
    this.contextManager.setUserInput(userInput);

    // 获取过滤后的工具
    const filteredTools = this.filterTools();

    // 创建临时 ToolManager（只包含过滤后的工具）
    const isolatedToolManager = new ToolManager();
    isolatedToolManager.clear();
    filteredTools.forEach((tool) => isolatedToolManager.register(tool));

    // 执行工具循环
    const executor = new ToolLoopExecutor(
      this.llmService,
      this.contextManager,
      isolatedToolManager,
      {
        maxLoops: this.config.execution?.maxLoops || 100,
        agentName: this.config.name,
        executionStream: executionStream,  // ✅ 修改：使用选择的 executionStream
        model: this.config.model?.model || 'deepseek-chat',
        modelLimit: options?.modelLimit,
        sessionId: options?.sessionId,
        onConfirmRequired: options?.onConfirmRequired,
        approvalMode: options?.approvalMode,
        abortSignal: this.abortController.signal,
        sessionStats: this.sessionStats,
      }
    );

    // 保存当前执行器引用
    this.currentExecutor = executor;

    const loopResult = await executor.run();

    // 清理执行器引用
    this.currentExecutor = null;

    // 检查是否被中断
    if (loopResult.cancelled) {
      // 中断时不归档到历史，保留 currentTurn 中已完成的消息
      // sanitize 已在 executor 中调用
      executionStream.cancel('用户取消执行');  // ✅ 修改

      const collected = eventBus.getData();
      return {
        agents: collected.agents,
        tools: collected.tools,
        finalResponse: '',
        success: false,
        error: '执行已暂停',
      };
    }

    // 完成当前轮次（归档到历史）
    this.contextManager.finishTurn();

    // 计算本次执行的费用（CNY）= 当前累计 - 执行前累计
    const costCNY = this.sessionStats.getTotalCostCNY() - costBeforeRun;

    // 完成执行流，传递本次执行费用
    executionStream.complete(costCNY);  // ✅ 修改

    // 从事件系统获取收集的数据
    const collected = eventBus.getData();

    return {
      agents: collected.agents,
      tools: collected.tools,
      finalResponse: loopResult.result || '',
      success: loopResult.success,
      error: loopResult.error,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    // 清理执行器引用
    this.currentExecutor = null;

    // 执行流错误
    executionStream.error(errorMessage);  // ✅ 修改

    // 从事件系统获取收集的数据
    const collected = eventBus.getData();

    return {
      agents: collected.agents,
      tools: collected.tools,
      finalResponse: '',
      success: false,
      error: errorMessage,
    };
  } finally {
    // 清理中断控制器
    this.abortController = null;
  }
}
```

**修改点总结**：
1. 添加 `const executionStream = options?.executionStream || this.executionStream;`
2. 将所有 `this.executionStream` 替换为 `executionStream`（共 5 处）

---

### 步骤 3：修改 `TaskTool` 执行器

**文件**：`packages/core/src/core/tool/Task/executors.ts`

**位置**：第 124-165 行

**修改前**：

```typescript
try {
  // 6. 初始化子代理
  await subAgent.init();

  // 7. 启动子执行流
  subExecStream.start();  // ❌ 删除这行

  // 8. 执行子代理
  const result = await subAgent.run(prompt, {
    sessionId: sessionId || context?.sessionId || 'unknown',
    approvalMode: context?.approvalMode,
    onConfirmRequired: context?.onConfirmRequired,
    // ❌ 缺少：executionStream: subExecStream
  });

  // 9. 完成子执行流
  if (result.success) {
    subExecStream.complete();  // ❌ 删除这行
  } else {
    subExecStream.error(result.error || 'Unknown error');  // ❌ 删除这行
  }

  logger.info('TaskTool completed', {
    agentName: subagent_type,
    success: result.success,
    toolCallCount: toolSummary.length,
  });

  // 10. 返回结果
  return {
    success: result.success,
    output: result.finalResponse || result.error || '',
    metadata: {
      agentName: subagent_type,
      sessionId: sessionId || context?.sessionId || 'unknown',
      summary: toolSummary,
    },
  };
} finally {
  // 清理订阅
  unsubscribe();
}
```

**修改后**：

```typescript
try {
  // 6. 初始化子代理
  await subAgent.init();

  // 7. 执行子代理（✅ 传入 subExecStream）
  const result = await subAgent.run(prompt, {
    sessionId: sessionId || context?.sessionId || 'unknown',
    approvalMode: context?.approvalMode,
    onConfirmRequired: context?.onConfirmRequired,
    executionStream: subExecStream,  // ✅ 新增：传入外部 ExecutionStream
  });

  logger.info('TaskTool completed', {
    agentName: subagent_type,
    success: result.success,
    toolCallCount: toolSummary.length,
  });

  // 8. 返回结果
  return {
    success: result.success,
    output: result.finalResponse || result.error || '',
    metadata: {
      agentName: subagent_type,
      sessionId: sessionId || context?.sessionId || 'unknown',
      summary: toolSummary,
    },
  };
} finally {
  // 清理订阅
  unsubscribe();
}
```

**修改点总结**：
1. ❌ 删除 `subExecStream.start()`（Agent 内部会启动）
2. ✅ 添加 `executionStream: subExecStream` 到 `subAgent.run()` 参数
3. ❌ 删除 `subExecStream.complete()` 和 `subExecStream.error()`（Agent 内部会处理）

---

## 📊 修改前后对比

### 修改前（有问题）

```
TaskTool 创建 subExecStream
  ↓
TaskTool 订阅 subExecStream.on(...)
  ↓
TaskTool 手动 subExecStream.start()
  ↓
TaskTool 调用 subAgent.run({ ... })  ← ❌ 没有传 executionStream
  ↓
Agent 使用 this.executionStream.start()  ← ❌ 使用内部的
  ↓
Agent 发射事件到 this.executionStream  ← ❌ 不是 subExecStream
  ↓
TaskTool 的订阅回调永远不会被触发  ← ❌ Bug！
```

### 修改后（正确）

```
TaskTool 创建 subExecStream
  ↓
TaskTool 订阅 subExecStream.on(...)
  ↓
TaskTool 调用 subAgent.run({ executionStream: subExecStream })  ← ✅ 传入
  ↓
Agent 使用传入的 subExecStream.start()  ← ✅ 使用外部的
  ↓
Agent 发射事件到 subExecStream  ← ✅ 正确的 stream
  ↓
TaskTool 的订阅回调被触发  ← ✅ 正常工作！
  ↓
转发为 tool:progress 事件
  ↓
CLI 收到事件，更新 UI  ← ✅ 实时显示子代理进度
```

---

## ✅ 修复效果

### 事件流转（修复后）

```
1. TaskTool 创建 subExecStream
   ↓
2. TaskTool 订阅 subExecStream.on(...)
   ↓
3. TaskTool 调用 subAgent.run({ executionStream: subExecStream })
   ↓
4. Agent 内部使用传入的 subExecStream
   ↓
5. Agent 调用 subExecStream.start()
   ↓
6. 子代理执行工具（如 glob）
   ↓
7. subExecStream.emit('tool:validating', ...)
   ↓
8. TaskTool 的订阅回调被触发 ✅
   ↓
9. 转发为 tool:progress 事件
   ↓
10. CLI 收到事件，更新 UI ✅
```

### UI 显示效果

```
◉ task (explore codebase)
├ ⠋ glob (searching...)          ← 实时显示
├ ● glob → Found 15 files        ← 完成后更新
├ ⠋ read_file (reading...)       ← 实时显示
├ ● read_file → Read 245 lines   ← 完成后更新
└ ⠋ grep (searching...)          ← 实时显示
```

---

## 🎯 总结

### 需要修改的文件

1. ✅ `packages/core/src/core/agent/Agent.ts`
   - 添加 `executionStream?: ExecutionStreamManager` 到 `AgentRunOptions`（第 82 行）
   - 修改 `run()` 方法，支持使用外部 ExecutionStream（第 322、343、356、374、393 行）

2. ✅ `packages/core/src/core/tool/Task/executors.ts`
   - 删除 `subExecStream.start()`（第 129 行）
   - 添加 `executionStream: subExecStream` 到 `subAgent.run()`（第 136 行）
   - 删除 `subExecStream.complete()` 和 `error()`（第 140-142 行）

### 核心改进

| 改进点 | 修改前 | 修改后 |
|--------|--------|--------|
| **ExecutionStream 来源** | Agent 总是使用内部的 | 支持外部传入 |
| **生命周期管理** | TaskTool 手动管理 | Agent 自动管理 |
| **事件触发** | ❌ 永远不会触发 | ✅ 正确触发 |
| **代码复杂度** | 高（手动管理） | 低（自动管理） |
| **向后兼容** | - | ✅ 主 Agent 仍使用内部 stream |

### 优势

1. ✅ **事件正确触发**：subExecStream 的事件会被正确发射和捕获
2. ✅ **生命周期自动管理**：不需要手动 start/complete/error
3. ✅ **代码更简洁**：TaskTool 只需创建、订阅、传入、清理
4. ✅ **向后兼容**：主代理仍然使用内部的 executionStream
5. ✅ **实时进度显示**：CLI 可以实时看到子代理的工具调用进度

---

## 🔧 验证步骤

修改完成后，可以通过以下步骤验证：

1. **类型检查**：
   ```bash
   bun run typecheck
   ```

2. **运行 CLI**：
   ```bash
   bun run --cwd packages/cli dev
   ```

3. **测试子代理**：
   - 输入一个需要调用 task 工具的问题
   - 观察 CLI 是否实时显示子代理的工具调用进度
   - 检查是否有树形结构显示（`├ ⠋ glob (searching...)`）

4. **检查日志**：
   ```bash
   # 查看事件日志
   cat logs/llm-last-request.json
   ```

---

**修复完成后，子代理的实时进度显示功能将正常工作！** 🎉
