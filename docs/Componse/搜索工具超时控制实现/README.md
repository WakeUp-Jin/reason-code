# 搜索工具超时控制实现

## 问题背景

在 Agent 系统中，Glob 和 Grep 工具会调用 ripgrep 子进程来搜索文件。当搜索范围很大或遇到某些边界情况时，ripgrep 进程可能会卡住很长时间，导致整个会话无响应。

**典型场景**：
- 搜索模式 `**/*grep*.ts` 在包含大量文件的目录中执行
- 未排除 `node_modules`、`store` 等大型目录
- 网络文件系统响应缓慢

**用户体验问题**：
```
用户发送消息 → Agent 调用 Glob → ripgrep 卡住 → 用户等待 5 分钟...
```

## 设计目标

1. **超时后返回明确的错误信息**（而不是无限等待）
2. **超时后真正终止底层进程**（释放系统资源）
3. **支持外部中止信号**（用户发送新消息时能中断）
4. **代码复用**（Glob 和 Grep 共用同一套机制）

## 核心难点

### 难点 1：Promise 无法从外部取消

JavaScript 的 Promise 没有内置的取消机制。一旦 Promise 开始执行，外部无法直接终止它：

```typescript
// ❌ 这样写有问题
const promise = executeGlobStrategy(...);  // 已经开始执行了
setTimeout(() => {
  // 60 秒后想取消？太晚了，promise 已经在执行中
  // JavaScript 没有原生的 Promise.cancel()
}, 60000);
await promise;
```

### 难点 2：需要终止的是子进程，不是 Promise

即使让 `withTimeout` 抛出 `TimeoutError`，底层的 ripgrep 子进程仍在运行：

```typescript
// ❌ 这样只是停止等待，ripgrep 还在跑
try {
  await Promise.race([
    executeGlobStrategy(...),
    new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 60000))
  ]);
} catch (e) {
  // 抛出了超时错误，但 ripgrep 进程还在后台运行！
}
```

### 难点 3：流式读取的阻塞问题

即使发送了 `SIGTERM` 或 `SIGKILL`，`for await` 循环可能仍然阻塞：

```typescript
// ❌ 这段代码会卡住
for await (const chunk of proc.stdout) {
  // 即使进程被 kill，这里可能还在等待下一个 chunk
  // 因为 stdout 流没有被正确关闭
}
```

## 解决方案：AbortController + 流销毁 + 工厂函数模式

### 核心思路

1. 使用 `AbortController` 作为"取消令牌"
2. 超时时调用 `controller.abort()`，触发 signal 的 abort 事件
3. 底层进程监听 signal，收到 abort 后：
   - **先销毁 stdout 流**（让 `for await` 循环退出）
   - 再发送 `SIGTERM` 终止进程
   - 500ms 后如果还没退出，发送 `SIGKILL` 强制终止
4. 使用工厂函数，让 `withTimeout` 能够"注入" signal 到底层

### 架构图

```
┌─────────────────────────────────────────────────────────────┐
│                        执行器层                              │
│  ┌─────────────────┐         ┌─────────────────┐           │
│  │  Glob 执行器     │         │  Grep 执行器     │           │
│  └────────┬────────┘         └────────┬────────┘           │
│           │                           │                     │
│           └───────────┬───────────────┘                     │
│                       ▼                                     │
├─────────────────────────────────────────────────────────────┤
│                      超时控制层                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                   withTimeout                        │   │
│  │  ┌─────────────────────────────────────────────┐    │   │
│  │  │           createTimeoutSignal                │    │   │
│  │  │  ┌─────────────────────────────────────┐    │    │   │
│  │  │  │         AbortController              │    │    │   │
│  │  │  │  • signal: AbortSignal               │    │    │   │
│  │  │  │  • abort(): 触发取消                  │    │    │   │
│  │  │  └─────────────────────────────────────┘    │    │   │
│  │  └─────────────────────────────────────────────┘    │   │
│  └─────────────────────────────────────────────────────┘   │
│                       │                                     │
│                       ▼ signal                              │
├─────────────────────────────────────────────────────────────┤
│                       进程层                                 │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                 Ripgrep.files()                      │   │
│  │  ┌─────────────────────────────────────────────┐    │   │
│  │  │            ripgrep 子进程                    │    │   │
│  │  │  • 监听 signal.abort 事件                    │    │   │
│  │  │  • 收到 abort 后:                            │    │   │
│  │  │    1. proc.stdout.destroy() ← 关键！        │    │   │
│  │  │    2. proc.kill('SIGTERM')                  │    │   │
│  │  │    3. 500ms 后 proc.kill('SIGKILL')         │    │   │
│  │  └─────────────────────────────────────────────┘    │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

## 实现详解

### Step 1: 创建超时信号

文件：`packages/core/src/core/tool/utils/error-utils.ts`

```typescript
export function createTimeoutSignal(
  timeoutMs: number,
  externalSignal?: AbortSignal
): {
  signal: AbortSignal;
  cleanup: () => void;
  isTimeout: () => boolean;
} {
  const controller = new AbortController();
  let timedOut = false;

  // 设置超时定时器
  const timeoutId = setTimeout(() => {
    timedOut = true;
    controller.abort();  // 关键：超时时触发 abort
  }, timeoutMs);

  // 如果有外部信号（比如用户发送新消息），也要触发 abort
  const abortHandler = () => {
    clearTimeout(timeoutId);
    controller.abort();
  };
  externalSignal?.addEventListener('abort', abortHandler, { once: true });

  // 清理函数
  const cleanup = () => {
    clearTimeout(timeoutId);
    externalSignal?.removeEventListener('abort', abortHandler);
  };

  return {
    signal: controller.signal,  // 传给底层使用
    cleanup,
    isTimeout: () => timedOut,  // 用于区分是超时还是外部中止
  };
}
```

### Step 2: 工厂函数模式

为什么需要工厂函数？因为需要在 `withTimeout` 内部创建 signal，然后传给底层：

```typescript
// ❌ 直接传 Promise 的问题
withTimeout(
  executeGlobStrategy(..., { signal: ??? }),  // signal 从哪来？
  60000
);

// ✅ 工厂函数模式
withTimeout(
  (signal) => executeGlobStrategy(..., { signal }),  // signal 由 withTimeout 提供
  60000
);
```

### Step 3: withTimeout 实现

```typescript
export async function withTimeout<T>(
  promiseFactory: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  operation: string,
  externalSignal?: AbortSignal
): Promise<T> {
  if (externalSignal?.aborted) {
    throw createAbortError();
  }

  const { signal, cleanup, isTimeout } = createTimeoutSignal(timeoutMs, externalSignal);

  try {
    const result = await promiseFactory(signal);
    cleanup();
    return result;
  } catch (error) {
    cleanup();

    // 如果是超时导致的中止，抛出 TimeoutError
    if (isTimeout() && isAbortError(error)) {
      throw createTimeoutError(operation, timeoutMs);
    }

    throw error;
  }
}
```

### Step 4: 底层进程监听 signal（关键修复）

文件：`packages/core/src/core/tool/utils/ripgrep.ts`

**关键点**：必须先销毁 stdout 流，否则 `for await` 会一直阻塞！

```typescript
async *files(input: { signal?: AbortSignal; ... }) {
  const proc = spawn('rg', args);
  
  let aborted = false;
  const onAbort = () => {
    aborted = true;
    logger.debug(`🛑 [Ripgrep:Abort] Killing process`, { pid: proc.pid });

    // 关键：先销毁 stdout 流，让 for await 循环能够退出
    // 否则 for await 会一直阻塞等待下一个 chunk
    proc.stdout?.destroy();

    proc.kill('SIGTERM');  // 优雅终止

    // 500ms 后如果还没结束，强制杀死
    setTimeout(() => {
      if (!proc.killed) {
        logger.debug(`🛑 [Ripgrep:ForceKill] Forcing kill`);
        proc.kill('SIGKILL');
      }
    }, 500);
  };
  input.signal?.addEventListener('abort', onAbort, { once: true });
  
  // 流式读取输出（需要 try-catch 处理流被销毁的情况）
  try {
    for await (const chunk of proc.stdout) {
      if (aborted) break;  // 被中止时立即退出
      // ... 处理 chunk ...
    }
  } catch (streamError) {
    // 如果是因为 abort 导致的流错误，忽略它
    if (!aborted) throw streamError;
  }

  // 如果已经被中止，直接抛出 AbortError
  if (aborted) {
    throw createAbortError();
  }

  // ... 等待进程结束 ...
}
```

### Step 5: 在执行器中使用

文件：`packages/core/src/core/tool/Glob/executors.ts`

```typescript
export async function globExecutor(args: GlobArgs, context?: InternalToolContext): Promise<GlobResult> {
  try {
    const { files, strategy, warning } = await withTimeout(
      (signal) =>
        executeGlobStrategy(args.pattern, searchPath, {
          limit: GLOB_DEFAULTS.LIMIT,
          binDir: binDirForRipgrep,
          signal,  // 使用 withTimeout 提供的 signal
        }),
      TOOL_EXECUTION_TIMEOUT_MS,  // 60 秒
      'Glob',
      context?.abortSignal
    );
    // ...
  } catch (error) {
    if (isTimeoutError(error)) {
      return {
        success: false,
        error: toErrorMessage(error),  // "Glob 执行超时 (60秒)"
        data: null,
      };
    }
    // ...
  }
}
```

## 完整数据流

### 正常完成流程

```
globExecutor
    │
    ▼
withTimeout((signal) => executeGlobStrategy(..., { signal }))
    │
    ├──► createTimeoutSignal(60000)
    │         │
    │         ├──► setTimeout(abort, 60000)  ←── 设置 60 秒定时器
    │         │
    │         └──► return { signal, cleanup }
    │
    ├──► promiseFactory(signal)
    │         │
    │         ▼
    │    Ripgrep.files({ signal })
    │         │
    │         ├──► spawn('rg', args)
    │         │
    │         ├──► signal.addEventListener('abort', onAbort)
    │         │
    │         └──► for await (chunk of proc.stdout) { yield ... }
    │                   │
    │                   ▼
    │              搜索完成 (< 60秒)
    │
    ├──► cleanup()  ←── 清除定时器
    │
    └──► return result
```

### 超时流程

```
... 同上，直到 ripgrep 开始执行 ...

    │
    │    Ripgrep.files({ signal })
    │         │
    │         └──► for await (chunk of proc.stdout)
    │                   │
    │                   └──► 卡住了...

═══════════════════ 60 秒后 ═══════════════════

    │
    │    setTimeout 触发
    │         │
    │         ▼
    │    controller.abort()
    │         │
    │         ▼
    │    'abort' 事件触发
    │         │
    │         ▼
    │    onAbort() 被调用
    │         │
    │         ├──► proc.stdout.destroy()  ←── 关键！让 for await 退出
    │         │
    │         ├──► proc.kill('SIGTERM')
    │         │
    │         └──► 500ms 后 proc.kill('SIGKILL')（如果需要）
    │
    │    for await 循环因流被销毁而退出
    │         │
    │         ▼
    │    throw AbortError
    │
    ├──► catch (error)
    │         │
    │         ├──► isTimeout() === true
    │         │
    │         └──► throw TimeoutError("Glob 执行超时 (60秒)")
    │
    ▼
globExecutor catch
    │
    └──► return { success: false, error: "Glob 执行超时 (60秒)" }
```

## 为什么必须销毁 stdout 流？

这是整个实现中最关键的一点。让我们看看不销毁流会发生什么：

```typescript
// ❌ 问题代码
const onAbort = () => {
  proc.kill('SIGTERM');  // 只 kill 进程
};

for await (const chunk of proc.stdout) {
  // 即使进程被 kill 了，这里还是会阻塞！
  // 因为 Node.js 的 stream 不知道进程已经死了
  // 它还在等待 EOF 或更多数据
}
```

**原因**：
- `proc.kill()` 只是发送信号给子进程
- 子进程可能没有正确处理信号，或者在处理信号时没有 flush stdout
- Node.js 的 Readable stream 会一直等待，直到收到 `end` 事件或流被销毁

**解决方案**：
```typescript
// ✅ 正确做法
const onAbort = () => {
  proc.stdout?.destroy();  // 先销毁流！
  proc.kill('SIGTERM');
};
```

## 相关文件

| 文件 | 职责 |
|------|------|
| `packages/core/src/core/tool/utils/error-utils.ts` | 超时控制核心实现 |
| `packages/core/src/core/tool/utils/ripgrep.ts` | ripgrep 进程管理 |
| `packages/core/src/core/tool/Glob/executors.ts` | Glob 工具执行器 |
| `packages/core/src/core/tool/Grep/executors.ts` | Grep 工具执行器 |

## 配置项

```typescript
// packages/core/src/core/tool/utils/error-utils.ts

/**
 * 工具执行超时时间（毫秒）
 * 默认 60 秒，防止工具执行卡住导致整个会话无响应
 */
export const TOOL_EXECUTION_TIMEOUT_MS = 60_000;
```

## 日志输出

超时时会输出以下日志：

```
[DEBUG] 🛑 [Ripgrep:Abort] Killing process { pid: 12345, cwd: '/path/to/dir' }
[DEBUG] 🛑 [Ripgrep:ForceKill] Process did not terminate, forcing kill { pid: 12345 }
```

## 总结

这套超时控制机制的核心思想是：**用 AbortSignal 作为"取消令牌"，在各层之间传递，实现从上到下的取消链路**。

关键技术点：
1. `AbortController` + `AbortSignal` 实现取消机制
2. 工厂函数模式实现 signal 注入
3. **`proc.stdout.destroy()` 让流式读取能够退出**（最关键！）
4. 双重终止策略（SIGTERM + SIGKILL）确保进程被杀死
5. 资源自动清理防止内存泄漏

## 踩坑记录

### 问题：超时后进程被 kill 但程序仍然卡住

**现象**：日志显示 `[Ripgrep:Abort] Killing process`，但程序仍然无响应，用户需要再等几分钟。

**原因**：`for await (const chunk of proc.stdout)` 在等待下一个 chunk，即使进程被 kill 了，流也没有正确关闭。

**解决**：在 `onAbort` 中先调用 `proc.stdout?.destroy()` 销毁流，然后再 kill 进程。

