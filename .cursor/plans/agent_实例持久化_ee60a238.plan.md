---
name: Agent 实例持久化
overview: ""
todos:
  - id: agent-module-level
    content: 将 Agent 实例从 useRef 改为模块级变量
    status: pending
  - id: manager-module-level
    content: 将 ExecutionStreamManager 引用改为模块级变量
    status: pending
  - id: init-guard
    content: 添加初始化保护，防止重复初始化和并发初始化
    status: pending
  - id: rebind-on-remount
    content: 在 remount 后重新绑定 manager 订阅
    status: pending
---

# 解决 Remount 时 Agent 执行中断问题

## 问题分析

当前架构中，`ctrl+o` 触发 `remountApp()` 会导致：

```javascript
remountApp()
    ↓
Ink 组件树卸载
    ↓
useAgent Hook 卸载（agentRef.current 丢失）
    ↓
Agent.run() 正在执行的 Promise 失去引用
    ↓
虽然 Core 层 Agent 还在运行，但 CLI 层无法接收结果
```

**核心问题**：`useAgent` 中的 `agentRef` 是组件级的 `useRef`，remount 后会重新初始化。

## 解决方案：将 Agent 实例提升到模块级

与 `persistedThinkingExpanded` 相同的策略：将 Agent 实例存储在模块级变量中。

### 架构变更

```javascript
之前：
┌─────────────────────────────────────────┐
│  InputArea 组件                          │
│  └─ useAgent Hook                        │
│      └─ agentRef = useRef<Agent>()  ← 组件级，remount 后丢失
└─────────────────────────────────────────┘

之后：
┌─────────────────────────────────────────┐
│  useAgent.ts 模块级                      │
│  └─ let agentInstance: Agent | null  ← 模块级，跨 remount 持久化
│  └─ let agentInitialized = false     ← 防止重复初始化
└─────────────────────────────────────────┘
```



## 修改文件

### 1. [packages/cli/src/hooks/useAgent.ts](packages/cli/src/hooks/useAgent.ts)

**变更内容**：

1. 将 `agentRef` 改为模块级变量 `agentInstance`
2. 添加 `agentInitialized` 标记防止重复初始化
3. 添加 `agentInitPromise` 防止并发初始化
4. 在 `useEffect` 中检查是否已初始化
```typescript
// 模块级变量（跨 remount 持久化）
let agentInstance: Agent | null = null;
let agentInitialized = false;
let agentInitPromise: Promise<void> | null = null;

export function useAgent(): UseAgentReturn {
  // 不再使用 useRef，改用模块级变量
  const [isReady, setIsReady] = useState(agentInitialized && agentInstance !== null);
  
  useEffect(() => {
    // 如果已经初始化，直接使用现有实例
    if (agentInitialized && agentInstance) {
      setIsReady(true);
      bindManager(agentInstance.getExecutionStream());
      return;
    }
    
    // 如果正在初始化，等待完成
    if (agentInitPromise) {
      agentInitPromise.then(() => {
        if (agentInstance) {
          setIsReady(true);
          bindManager(agentInstance.getExecutionStream());
        }
      });
      return;
    }
    
    // 首次初始化
    agentInitPromise = initAgent();
  }, []);
}
```




### 2. [packages/cli/src/context/execution.tsx](packages/cli/src/context/execution.tsx)

**变更内容**：将 `managerRef` 也改为模块级变量，确保 ExecutionStreamManager 的订阅在 remount 后保持。

```typescript
// 模块级变量（跨 remount 持久化）
let managerInstance: ExecutionStreamManager | null = null;
let managerBound = false;



```