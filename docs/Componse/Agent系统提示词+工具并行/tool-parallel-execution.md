# 工具并行执行实现方案

> 基于 Gemini CLI 和 Claude Code 的最佳实践

## 目录

1. [架构对比](#架构对比)
2. [实现步骤](#实现步骤)
3. [代码修改清单](#代码修改清单)
4. [测试验证](#测试验证)

---

## 架构对比

### Gemini CLI 的实现

**核心特点**：
1. **明确的并行指令**：系统提示词中直接说明可以并行
2. **状态机管理**：完整的工具调用状态流
3. **批量调度**：支持单个或批量请求

**关键代码**：
```typescript
// packages/core/src/core/coreToolScheduler.ts
async schedule(
  request: ToolCallRequestInfo | ToolCallRequestInfo[], 
  signal: AbortSignal
): Promise<void> {
  const requests = Array.isArray(request) ? request : [request];
  
  // 创建工具调用记录
  const newToolCalls = requests.map(reqInfo => {
    // 验证、创建 invocation
    return {
      status: 'validating',
      request: reqInfo,
      tool: toolInstance,
      invocation: invocationOrError,
      startTime: Date.now(),
    };
  });
  
  // 并行验证和确认
  for (const toolCall of newToolCalls) {
    // 异步验证，不阻塞其他工具
  }
  
  // 所有工具验证完成后，并行执行
  const allCallsFinalOrScheduled = this.toolCalls.every(
    (call) => call.status === 'scheduled' || /* 其他终态 */
  );
  
  if (allCallsFinalOrScheduled) {
    const callsToExecute = this.toolCalls.filter(
      (call) => call.status === 'scheduled'
    );
    
    // 并行执行所有已调度的工具
    callsToExecute.forEach((toolCall) => {
      this.executeToolCall(toolCall, signal); // 不 await
    });
  }
}
```

**系统提示词**：
```markdown
## Tool Usage
- **Parallelism:** Execute multiple independent tool calls in parallel when feasible (i.e. searching the codebase).
```

---

### Reason Code 的当前实现

**当前问题**：
```typescript
// packages/core/src/core/tool/ToolScheduler.ts
async scheduleBatchFromToolCalls(
  toolCalls: Array<{...}>,
  context?: InternalToolContext,
  options?: { thinkingContent?: string }
): Promise<ScheduleResult[]> {
  const results: ScheduleResult[] = [];
  
  // ❌ 串行执行 + 固定延迟
  for (const toolCall of toolCalls) {
    const result = await this.schedule(...);  // 阻塞等待
    results.push(result);
    await sleep(500);  // 固定延迟
  }
  
  return results;
}
```

**性能影响**：
- 5 个 ListFiles 调用：5 × (200ms + 500ms) = 3.5 秒
- 并行执行：max(200ms) = 0.2 秒
- **性能提升：17.5 倍**

---

## 实现步骤

### 步骤 1：添加系统提示词指令

**位置**：`packages/core/src/core/promptManager/prompts.ts`

**修改内容**：

```typescript
export const SIMPLE_AGENT_PROMPT = `
你是一个智能编程助手，专注于帮助用户完成软件开发任务。

## 核心能力

1. **代码理解**：深入分析代码库结构和实现
2. **代码生成**：编写高质量、符合项目规范的代码
3. **问题诊断**：快速定位和修复 bug
4. **架构设计**：提供合理的技术方案

## 工具使用指南

### 并行执行原则

**重要**：当多个工具调用相互独立时，应该并行执行以提高效率。

**适合并行的场景**：
- 探索代码库时，同时列出多个目录（多个 ListFiles）
- 读取多个不相关的文件（多个 ReadFile）
- 搜索多个不同的模式（多个 Grep）
- 查找多个不同的文件（多个 Glob）

**必须串行的场景**：
- 写操作（WriteFile、ExecuteCommand）
- 有依赖关系的操作（先读取再修改）
- 需要前一个结果的操作

**示例**：

✅ **好的做法（并行）**：
\`\`\`
用户：列出 src、tests、docs 三个目录的内容

你的响应：同时调用 3 个 ListFiles 工具
- ListFiles({ path: "/project/src" })
- ListFiles({ path: "/project/tests" })
- ListFiles({ path: "/project/docs" })
\`\`\`

❌ **不好的做法（串行）**：
\`\`\`
先调用 ListFiles({ path: "/project/src" })
等待结果...
再调用 ListFiles({ path: "/project/tests" })
等待结果...
再调用 ListFiles({ path: "/project/docs" })
\`\`\`

### 工具分类

**只读工具（可并行）**：
- ListFiles：列出目录内容
- ReadFile：读取文件内容
- Grep：搜索文本模式
- Glob：查找文件路径

**写操作工具（必须串行）**：
- WriteFile：写入文件
- ExecuteCommand：执行命令
- DeleteFile：删除文件

## 输出风格

- **简洁直接**：避免冗长的解释，直接给出答案
- **结构清晰**：使用 Markdown 格式化输出
- **引用准确**：提供 \`file:line\` 格式的代码引用
- **可操作性**：给出具体的修改建议，而不是模糊的描述
`;
```

---

### 步骤 2：修改 ToolScheduler 支持并行

**位置**：`packages/core/src/core/tool/ToolScheduler.ts`

**修改内容**：

```typescript
/**
 * 批量调度原始 LLM 工具调用
 * 自动判断是否可以并行执行
 */
async scheduleBatchFromToolCalls(
  toolCalls: Array<{
    id: string;
    function: { name: string; arguments: string };
  }>,
  context?: InternalToolContext,
  options?: { thinkingContent?: string }
): Promise<ScheduleResult[]> {
  // 1. 判断是否可以并行
  const canParallel = this.canExecuteInParallel(toolCalls);

  if (canParallel) {
    // 2. 并行执行（只读工具）
    logger.info('Executing tools in parallel', { 
      count: toolCalls.length,
      tools: toolCalls.map(tc => tc.function.name)
    });

    let isFirstToolCall = true;
    const promises = toolCalls.map(toolCall => {
      const thinkingContent = isFirstToolCall ? options?.thinkingContent : undefined;
      isFirstToolCall = false;

      return this.schedule(
        {
          callId: toolCall.id,
          toolName: toolCall.function.name,
          rawArgs: toolCall.function.arguments,
          thinkingContent,
        },
        context
      );
    });

    return Promise.all(promises);
  } else {
    // 3. 串行执行（写操作或有依赖）
    logger.info('Executing tools serially', { 
      count: toolCalls.length,
      tools: toolCalls.map(tc => tc.function.name)
    });

    const results: ScheduleResult[] = [];
    let isFirstToolCall = true;

    for (const toolCall of toolCalls) {
      const result = await this.schedule(
        {
          callId: toolCall.id,
          toolName: toolCall.function.name,
          rawArgs: toolCall.function.arguments,
          thinkingContent: isFirstToolCall ? options?.thinkingContent : undefined,
        },
        context
      );
      isFirstToolCall = false;
      results.push(result);

      // 等待避免请求过快
      await sleep(500);
    }

    return results;
  }
}

/**
 * 判断工具调用是否可以并行执行
 * 只有全部是只读工具时才并行
 */
private canExecuteInParallel(
  toolCalls: Array<{ function: { name: string } }>
): boolean {
  return toolCalls.every(toolCall => {
    const tool = this.toolManager.getTool(toolCall.function.name);
    
    if (!tool) {
      // 工具不存在，保守处理：串行
      return false;
    }

    // 检查工具是否是只读的
    const isReadOnly = tool.isReadOnly?.() ?? false;
    
    logger.debug('Tool parallel check', {
      toolName: toolCall.function.name,
      isReadOnly,
    });

    return isReadOnly;
  });
}
```

---

### 步骤 3：确保工具正确标记 isReadOnly

**位置**：`packages/core/src/core/tool/builtin/`

**检查清单**：

```typescript
// ✅ 只读工具
export class ListFilesTool implements InternalTool {
  name = 'ListFiles';
  
  isReadOnly(): boolean {
    return true;  // ✅ 正确标记
  }
  
  // ...
}

export class ReadFileTool implements InternalTool {
  name = 'ReadFile';
  
  isReadOnly(): boolean {
    return true;  // ✅ 正确标记
  }
  
  // ...
}

export class GrepTool implements InternalTool {
  name = 'Grep';
  
  isReadOnly(): boolean {
    return true;  // ✅ 正确标记
  }
  
  // ...
}

// ❌ 写操作工具
export class WriteFileTool implements InternalTool {
  name = 'WriteFile';
  
  isReadOnly(): boolean {
    return false;  // ✅ 正确标记
  }
  
  // ...
}

export class ExecuteCommandTool implements InternalTool {
  name = 'ExecuteCommand';
  
  isReadOnly(): boolean {
    return false;  // ✅ 正确标记
  }
  
  // ...
}
```

---

## 代码修改清单

### 文件 1：系统提示词

**路径**：`packages/core/src/core/promptManager/prompts.ts`

**修改**：
- [ ] 添加"工具使用指南"章节
- [ ] 添加"并行执行原则"说明
- [ ] 添加正反示例
- [ ] 添加工具分类说明

### 文件 2：ToolScheduler

**路径**：`packages/core/src/core/tool/ToolScheduler.ts`

**修改**：
- [ ] 修改 `scheduleBatchFromToolCalls` 方法
- [ ] 添加 `canExecuteInParallel` 私有方法
- [ ] 添加并行/串行执行的日志

### 文件 3：工具定义

**路径**：`packages/core/src/core/tool/builtin/*.ts`

**检查**：
- [ ] ListFilesTool：`isReadOnly() => true`
- [ ] ReadFileTool：`isReadOnly() => true`
- [ ] GrepTool：`isReadOnly() => true`
- [ ] GlobTool：`isReadOnly() => true`
- [ ] WriteFileTool：`isReadOnly() => false`
- [ ] ExecuteCommandTool：`isReadOnly() => false`

---

## 测试验证

### 测试用例 1：并行读取多个目录

**输入**：
```
列出 src、tests、docs 三个目录的内容
```

**预期行为**：
1. LLM 返回 3 个 ListFiles 工具调用
2. ToolScheduler 检测到全部是只读工具
3. 并行执行 3 个 ListFiles
4. 总耗时 ≈ max(单个执行时间) ≈ 200-500ms

**验证日志**：
```
[INFO] Executing tools in parallel { count: 3, tools: ['ListFiles', 'ListFiles', 'ListFiles'] }
[DEBUG] Tool parallel check { toolName: 'ListFiles', isReadOnly: true }
[DEBUG] Tool parallel check { toolName: 'ListFiles', isReadOnly: true }
[DEBUG] Tool parallel check { toolName: 'ListFiles', isReadOnly: true }
```

### 测试用例 2：混合读写操作

**输入**：
```
读取 config.json 并修改其中的 port 配置
```

**预期行为**：
1. LLM 返回 2 个工具调用：ReadFile + WriteFile
2. ToolScheduler 检测到包含写操作
3. 串行执行
4. 总耗时 ≈ sum(执行时间) + 500ms

**验证日志**：
```
[INFO] Executing tools serially { count: 2, tools: ['ReadFile', 'WriteFile'] }
[DEBUG] Tool parallel check { toolName: 'ReadFile', isReadOnly: true }
[DEBUG] Tool parallel check { toolName: 'WriteFile', isReadOnly: false }
```

### 测试用例 3：探索代码库

**输入**：
```
分析 Agent 的实现，看看它如何处理工具调用
```

**预期行为**：
1. LLM 返回多个工具调用：Glob + Grep + ReadFile
2. ToolScheduler 检测到全部是只读工具
3. 并行执行
4. 显著提升探索速度

---

## 性能对比

### 场景：探索代码库（5 个只读工具调用）

**串行执行（当前）**：
```
ListFiles(/src)     → 200ms
  ↓ sleep(500ms)
ListFiles(/tests)   → 200ms
  ↓ sleep(500ms)
Grep("Agent")       → 300ms
  ↓ sleep(500ms)
ReadFile(agent.ts)  → 150ms
  ↓ sleep(500ms)
ReadFile(types.ts)  → 150ms

总耗时：200+500+200+500+300+500+150+500+150 = 3000ms
```

**并行执行（优化后）**：
```
ListFiles(/src)     ┐
ListFiles(/tests)   ├─ 并行执行
Grep("Agent")       ├─ max(200, 200, 300, 150, 150) = 300ms
ReadFile(agent.ts)  │
ReadFile(types.ts)  ┘

总耗时：300ms
```

**性能提升：10 倍**

---

## 总结

### 关键改动

1. **系统提示词**：明确告诉 LLM 可以并行调用工具
2. **ToolScheduler**：智能判断并行/串行执行
3. **工具标记**：正确标记 `isReadOnly` 属性

### 安全保障

- 只有全部是只读工具才并行
- 包含写操作自动降级为串行
- 保持原有的错误处理逻辑

### 预期效果

- 代码探索速度提升 5-10 倍
- 用户体验显著改善
- 保持系统稳定性和安全性
