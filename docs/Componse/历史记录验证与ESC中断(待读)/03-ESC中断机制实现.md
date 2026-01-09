# ESC 中断机制实现

## 整体流程

```
用户按 ESC
    │
    ▼
┌─────────────────────────────────────────────────────────────────┐
│  InputArea (CLI)                                                 │
│  useInput((input, key) => {                                      │
│    if (key.escape && isExecuting) {                              │
│      abort();  // 调用 useAgent 提供的 abort 方法                │
│    }                                                             │
│  });                                                             │
└─────────────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────────┐
│  useAgent Hook                                                   │
│  const abort = useCallback(() => {                               │
│    if (agentInstance) {                                          │
│      agentInstance.abort();                                      │
│    }                                                             │
│  }, []);                                                         │
└─────────────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────────┐
│  Agent (Core)                                                    │
│  abort(): void {                                                 │
│    if (this.abortController) {                                   │
│      this.abortController.abort();  // 触发 AbortSignal          │
│    }                                                             │
│  }                                                               │
└─────────────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────────┐
│  ToolLoopExecutor                                                │
│  - 在每次迭代开始检查 signal.aborted                             │
│  - 在 LLM 调用前后检查                                           │
│  - 在工具执行后检查                                              │
│  - 检测到中断时调用 buildCancelledResult()                       │
└─────────────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────────┐
│  buildCancelledResult()                                          │
│  - 调用 contextManager.sanitizeCurrentTurn()                     │
│  - 返回 { cancelled: true, ... }                                 │
└─────────────────────────────────────────────────────────────────┘
```

## 关键代码

### 1. Agent 类 - AbortController 管理

```typescript
// packages/core/src/core/agent/Agent.ts

export class Agent {
  /** 中断控制器 */
  private abortController: AbortController | null = null;

  async run(userInput: string, options?: AgentRunOptions): Promise<AgentResult> {
    // 创建新的中断控制器
    this.abortController = new AbortController();

    try {
      const executor = new ToolLoopExecutor(
        this.llmService,
        this.contextManager,
        this.toolManager,
        {
          // ... 其他配置
          abortSignal: this.abortController.signal,  // 传递信号
        }
      );

      const loopResult = await executor.run();

      // 检查是否被中断
      if (loopResult.cancelled) {
        this.executionStream.cancel('用户取消执行');
        return {
          // ...
          success: false,
          error: '执行已暂停',
        };
      }

      // 正常完成...
    } finally {
      this.abortController = null;
    }
  }

  /**
   * 中断当前执行
   */
  abort(): void {
    if (this.abortController) {
      logger.info('Agent execution aborted by user');
      this.abortController.abort();
    }
  }

  /**
   * 检查是否正在执行
   */
  isRunning(): boolean {
    return this.abortController !== null;
  }
}
```

### 2. ToolLoopExecutor - 中断检测

```typescript
// packages/core/src/core/llm/utils/executeToolLoop.ts

export class ToolLoopExecutor {
  private abortSignal?: AbortSignal;

  /**
   * 检查是否被中断
   */
  private isAborted(): boolean {
    return this.abortSignal?.aborted ?? false;
  }

  async run(): Promise<ToolLoopResult> {
    while (this.loopCount < this.maxLoops) {
      // 检查是否被中断
      if (this.isAborted()) {
        return this.buildCancelledResult();
      }

      const result = await this.executeIteration();
      if (result.done) {
        return result.value!;
      }
    }
    return this.buildMaxLoopResult();
  }

  private async executeIteration(): Promise<IterationResult> {
    try {
      // 0. 中断检查
      if (this.isAborted()) {
        return { done: true, value: this.buildCancelledResult() };
      }

      // ... 获取上下文 ...

      // 3. 中断检查（获取上下文后）
      if (this.isAborted()) {
        return { done: true, value: this.buildCancelledResult() };
      }

      // 4. 调用 LLM
      const response = await this.llmService.complete(messages, tools);

      // 5. 中断检查（LLM 调用后）
      if (this.isAborted()) {
        return { done: true, value: this.buildCancelledResult() };
      }

      // ... 处理响应 ...

      // 8. 中断检查（工具调用后）
      if (this.isAborted()) {
        return { done: true, value: this.buildCancelledResult() };
      }

      return { done: false };
    } catch (error) {
      // 检查是否是中断错误
      if (this.isAborted()) {
        return { done: true, value: this.buildCancelledResult() };
      }
      return { done: true, value: this.buildErrorResult(error) };
    }
  }

  /**
   * 构建取消结果
   */
  private buildCancelledResult(): ToolLoopResult {
    logger.info('Execution cancelled by user');

    // 清理当前轮次中不完整的消息，保留已完成的
    this.contextManager.sanitizeCurrentTurn();

    return {
      success: false,
      cancelled: true,
      error: '执行已暂停',
      loopCount: this.loopCount,
    };
  }
}
```

### 3. InputArea - ESC 监听

```typescript
// packages/cli/src/routes/session/inputArea.tsx

export function InputArea({ onCommandPanelChange }: InputAreaProps) {
  const isExecuting = useIsExecuting();
  const { abort } = useAgent();

  // ESC 按键监听 - 在执行期间按 ESC 可以中断
  useInput(
    (input, key) => {
      if (key.escape && isExecuting) {
        logger.info('User pressed ESC to abort execution');
        abort();
      }
    },
    { isActive: isExecuting }  // 只在执行期间激活
  );

  // ...
}
```

### 4. useAgent Hook - 暴露 abort 方法

```typescript
// packages/cli/src/hooks/useAgent.ts

export function useAgent(): UseAgentReturn {
  // ...

  // 中断当前执行
  const abort = useCallback(() => {
    if (agentInstance) {
      agentInstance.abort();
      logger.info('Agent execution aborted by user');
    }
  }, []);

  // 检查是否正在执行
  const isRunning = useCallback(() => {
    if (!agentInstance) return false;
    return agentInstance.isRunning();
  }, []);

  return {
    // ...
    abort,
    isRunning,
  };
}
```

## 中断后的状态处理

### 保留策略

中断时采用"保留已完成"的策略：

1. **保留**：已完成的 assistant + tool 消息对
2. **移除**：不完整的 assistant 消息
3. **移除**：孤立的 tool 消息

### 不归档到历史

中断时 `currentTurn` 不会归档到 `history`，而是保留在 `currentTurn` 中。这样：

- 下次用户发送消息时，已完成的工具调用结果仍然可用
- LLM 可以基于已有的上下文继续工作

### UI 反馈

中断后：
1. `ExecutionStreamManager.cancel()` 被调用
2. 发出 `execution:cancel` 事件
3. CLI 层显示"执行已暂停"

