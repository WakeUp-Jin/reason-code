# Token 显示与费用计算修复

## 问题背景

### 问题 1: Processing 行显示的 token 不对
- **当前**：显示 `totalTokens`（inputTokens + outputTokens，累积的上下文大小）
- **期望**：显示 `outputTokens`（本次 LLM 生成的 token 数）

### 问题 2: Footer token 使用自己估算的值，不够精确
- **当前**：`getTokenUsage()` 用 `TokenEstimator` 估算
- **期望**：直接使用 LLM API 返回的 `prompt_tokens`（精确值）

### 问题 3: 价格计算一直为 0
- **原因**：`SessionStats.update()` 从未被调用

### 问题 4: Footer 更新时机不对
- **当前**：只在对话结束后更新
- **期望**：每次 LLM 输出后实时更新

## 数据流简化

```
LLM API 返回
  ├── prompt_tokens → inputTokens → Footer 显示的上下文 token
  ├── completion_tokens → outputTokens → Processing 行显示
  └── 两者用于计算费用 → totalCost → Footer 显示的费用
```

## 修改方案

### 1. 修改 Processing 行显示 outputTokens

**文件**: `packages/cli/src/component/execution/StatusIndicator.tsx`

```tsx
// 修改前
{stats.totalTokens > 0 && ` · ↓ ${stats.totalTokens} tokens`}

// 修改后
{stats.outputTokens > 0 && ` · ↓ ${stats.outputTokens} tokens`}
```

### 2. 在 ToolLoopExecutor 中更新 SessionStats（修复价格）

**文件**: `packages/core/src/core/llm/types/index.ts`

添加 `sessionStats` 到 `ToolLoopConfig` 接口：

```typescript
import type { SessionStats } from '../../stats/index.js';

export interface ToolLoopConfig {
  // ... 其他字段 ...

  // ============================================================
  // 统计相关
  // ============================================================

  /** 会话统计（用于费用计算） */
  sessionStats?: SessionStats;
}
```

**文件**: `packages/core/src/core/llm/utils/executeToolLoop.ts`

修改 `updateStats()` 方法：

```typescript
private updateStats(response: LLMResponse): void {
  if (response.reasoningContent) {
    this.executionStream?.completeThinking(response.reasoningContent);
  }
  if (response.usage) {
    // 更新 SessionStats 计算费用
    if (this.sessionStats) {
      this.sessionStats.update({
        inputTokens: response.usage.promptTokens,
        outputTokens: response.usage.completionTokens,
      });
    }

    // 获取累计费用
    const totalCost = this.sessionStats?.getTotalCostUSD() ?? 0;

    // 更新执行流统计（携带 totalCost）
    this.executionStream?.updateStats({
      inputTokens: response.usage.promptTokens,
      outputTokens: response.usage.completionTokens,
    }, totalCost);

    this.contextManager.updateTokenCount(response.usage.promptTokens);
  }
}
```

**文件**: `packages/core/src/core/agent/Agent.ts`

传递 `sessionStats` 给 `ToolLoopExecutor`：

```typescript
const executor = new ToolLoopExecutor(
  this.llmService,
  this.contextManager,
  this.toolManager,
  {
    // ... 其他配置 ...
    sessionStats: this.sessionStats,
  }
);
```

### 3. 扩展 stats:update 事件携带 totalCost

**文件**: `packages/core/src/core/execution/events.ts`

```typescript
// 修改前
| { type: 'stats:update'; stats: Partial<ExecutionStats> };

// 修改后
| { type: 'stats:update'; stats: Partial<ExecutionStats>; totalCost?: number };
```

**文件**: `packages/core/src/core/execution/ExecutionStreamManager.ts`

```typescript
// 修改前
updateStats(stats: Partial<ExecutionStats>): void {
  Object.assign(this.snapshot.stats, stats);
  this.snapshot.stats.totalTokens =
    this.snapshot.stats.inputTokens + this.snapshot.stats.outputTokens;
  this.emit({ type: 'stats:update', stats });
}

// 修改后
updateStats(stats: Partial<ExecutionStats>, totalCost?: number): void {
  Object.assign(this.snapshot.stats, stats);
  this.snapshot.stats.totalTokens =
    this.snapshot.stats.inputTokens + this.snapshot.stats.outputTokens;
  this.emit({ type: 'stats:update', stats, totalCost });
}
```

### 4. 简化 useAgentStats，直接使用事件数据

**文件**: `packages/cli/src/hooks/useAgentStats.ts`

完全重写，删除 `cachedStats`、`updateAgentStats()`、`resetAgentStats()` 和定期刷新：

```typescript
export function useAgentStats(): AgentStats {
  const [stats, setStats] = useState<AgentStats>(DEFAULT_STATS);
  const { subscribe } = useExecutionState();
  const currency = useAppStore((state) => state.config.currency);
  const exchangeRate = useAppStore((state) => state.config.exchangeRate);
  const currentModel = useAppStore((state) => state.currentModel);

  // 获取当前模型的 token 限制
  const maxTokens = currentModel ? getModelTokenLimit(currentModel) : 64000;

  // 监听执行流事件，实时更新统计
  useEffect(() => {
    const unsubscribe = subscribe((event) => {
      // 当有 token 统计更新时，直接使用事件数据
      if (event.type === 'stats:update') {
        const inputTokens = event.stats.inputTokens || 0;
        const totalCost = event.totalCost || 0;

        setStats({
          contextTokens: inputTokens,
          maxTokens,
          percentage: Math.round((inputTokens / maxTokens) * 100),
          totalCost,
          hasData: true,
        });
      }
    });

    return unsubscribe;
  }, [subscribe, maxTokens]);

  // 转换费用货币（USD → CNY）
  const displayCost = currency === 'USD'
    ? stats.totalCost
    : stats.totalCost * exchangeRate;

  return {
    ...stats,
    totalCost: displayCost,
  };
}
```

### 5. 清理 useAgent.ts 中不再需要的代码

**文件**: `packages/cli/src/hooks/useAgent.ts`

删除以下内容：
- `import { updateAgentStats, resetAgentStats }` 导入
- Agent 初始化后的 `updateAgentStats()` 调用
- `sendMessage` 完成后的 `updateAgentStats()` 调用
- `getTokenUsage` 方法定义和返回
- `getTotalCost` 方法定义和返回

## 修改文件清单

| 文件 | 修改内容 |
|------|----------|
| `packages/cli/src/component/execution/StatusIndicator.tsx` | 显示 `outputTokens` |
| `packages/core/src/core/llm/types/index.ts` | 添加 `sessionStats` 到 config |
| `packages/core/src/core/llm/utils/executeToolLoop.ts` | 调用 `sessionStats.update()` |
| `packages/core/src/core/agent/Agent.ts` | 传递 `sessionStats` |
| `packages/core/src/core/execution/events.ts` | 添加 `totalCost` 字段 |
| `packages/core/src/core/execution/ExecutionStreamManager.ts` | 发送 `totalCost` |
| `packages/cli/src/hooks/useAgentStats.ts` | 简化，直接使用事件数据 |
| `packages/cli/src/hooks/useAgent.ts` | 删除不再需要的代码 |

## 删除的代码清单

| 文件 | 删除内容 |
|------|----------|
| `useAgentStats.ts` | `cachedStats` 变量、`updateAgentStats()` 函数、`resetAgentStats()` 函数、定期刷新 interval |
| `useAgent.ts` | `import { updateAgentStats, resetAgentStats }`、两处 `updateAgentStats()` 调用、`getTokenUsage` 方法、`getTotalCost` 方法 |

