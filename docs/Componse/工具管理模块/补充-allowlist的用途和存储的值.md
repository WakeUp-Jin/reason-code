# Allowlist 的用途和存储的值

## 📋 目录

- [概述](#概述)
- [Shell 工具中的 Allowlist](#shell-工具中的-allowlist)
- [MCP 工具中的 Allowlist](#mcp-工具中的-allowlist)
- [Allowlist 的生命周期](#allowlist-的生命周期)
- [核心机制](#核心机制)
- [相关代码位置](#相关代码位置)

---

## 概述

### 什么是 Allowlist

`allowlist` 是一个**会话级的权限记忆系统**，用于存储用户在当前会话中已经批准过的操作。它的主要目的是：

1. **避免重复确认**：用户批准某个操作后，相同操作不再需要重复确认
2. **提升用户体验**：减少不必要的确认弹窗，让工作流更流畅
3. **会话隔离**：每次会话独立，不跨会话持久化，保证安全性

### 核心特点

- **数据结构**：`Set<string>` - 使用集合确保唯一性和快速查找
- **作用域**：会话级（session-scoped），进程退出后清空
- **填充时机**：用户选择 "ProceedAlways" 类型的确认选项时
- **查询时机**：工具执行前的 `shouldConfirmExecute()` 方法中

---

## Shell 工具中的 Allowlist

### 存储内容

**存储的是 Shell 命令的根命令名称（root command names）**

### 具体示例

| 用户输入的命令 | 提取的根命令 | 存入 allowlist 的值 |
|-------------|------------|-------------------|
| `ls -la /tmp` | `ls` | `"ls"` |
| `git status` | `git` | `"git"` |
| `npm install` | `npm` | `"npm"` |
| `/usr/bin/python3 script.py` | `python3` | `"python3"` |
| `git add . && git commit` | `git` | `"git"` （去重） |
| `echo "hello" \| grep h` | `echo`, `grep` | `"echo"`, `"grep"` |

### 提取逻辑

根命令的提取由 `getCommandRoot()` 函数完成：

```typescript
// packages/core/src/utils/shell-utils.ts:174
export function getCommandRoot(command: string): string | undefined {
  const trimmedCommand = command.trim();
  if (!trimmedCommand) {
    return undefined;
  }

  // 提取第一个"单词"，同时处理引号
  const match = trimmedCommand.match(/^"([^"]+)"|^'([^']+)'|^(\S+)/);
  if (match) {
    const commandRoot = match[1] || match[2] || match[3];
    if (commandRoot) {
      // 如果是路径，返回最后一个组件（文件名）
      return commandRoot.split(/[\\/]/).pop();
    }
  }

  return undefined;
}
```

### 工作流程

1. **命令提交**：用户执行 shell 命令
   ```typescript
   // packages/core/src/tools/shell.ts:125-126
   const command = stripShellWrapper(this.params.command);
   const rootCommands = [...new Set(getCommandRoots(command))];
   ```

2. **检查 allowlist**：过滤出需要确认的命令
   ```typescript
   // packages/core/src/tools/shell.ts:151-153
   const commandsToConfirm = rootCommands.filter(
     (command) => !this.allowlist.has(command),
   );
   ```

3. **用户确认**：如果有需要确认的命令，显示确认对话框
   ```typescript
   // packages/core/src/tools/shell.ts:159-170
   const confirmationDetails: ToolExecuteConfirmationDetails = {
     type: 'exec',
     title: 'Confirm Shell Command',
     command: this.params.command,
     rootCommand: commandsToConfirm.join(', '),
     onConfirm: async (outcome: ToolConfirmationOutcome) => {
       if (outcome === ToolConfirmationOutcome.ProceedAlways) {
         commandsToConfirm.forEach((command) => this.allowlist.add(command));
       }
     },
   };
   ```

4. **更新 allowlist**：用户选择"总是允许"时，添加到 allowlist

### 代码位置

- **定义位置**：`packages/core/src/tools/shell.ts:418`
  ```typescript
  private allowlist: Set<string> = new Set();
  ```

- **传递给 Invocation**：`packages/core/src/tools/shell.ts:489`
  ```typescript
  protected createInvocation(
    params: ShellToolParams,
  ): ToolInvocation<ShellToolParams, ToolResult> {
    return new ShellToolInvocation(this.config, params, this.allowlist);
  }
  ```

- **Invocation 接收**：`packages/core/src/tools/shell.ts:100-104`
  ```typescript
  constructor(
    private readonly config: Config,
    params: ShellToolParams,
    private readonly allowlist: Set<string>,
  ) {
    super(params);
  }
  ```

---

## MCP 工具中的 Allowlist

### 存储内容

**存储的是 MCP 服务器名称或完整的工具标识符**

### 存储格式

两种粒度的标识符：

1. **服务器级别**：`serverName`
   - 示例：`"langfuse-docs"`
   - 含义：信任整个 MCP 服务器的所有工具

2. **工具级别**：`${serverName}.${serverToolName}`
   - 示例：`"langfuse-docs.searchLangfuseDocs"`
   - 含义：只信任特定服务器的特定工具

### 具体示例

| 用户操作 | 确认结果 | 存入 allowlist 的值 |
|---------|---------|-------------------|
| 批准使用 langfuse-docs 服务器的所有工具 | ProceedAlwaysServer | `"langfuse-docs"` |
| 批准使用 langfuse-docs 的 searchLangfuseDocs 工具 | ProceedAlwaysTool | `"langfuse-docs.searchLangfuseDocs"` |
| 批准使用 context7 的 query-docs 工具 | ProceedAlwaysTool | `"context7.query-docs"` |

### 工作流程

1. **检查信任状态**：先检查是否在受信任文件夹中
   ```typescript
   // packages/core/src/tools/mcp-tool.ts:84-86
   if (this.cliConfig?.isTrustedFolder() && this.trust) {
     return false; // server is trusted, no confirmation needed
   }
   ```

2. **检查 allowlist**：生成两个 key 并检查
   ```typescript
   // packages/core/src/tools/mcp-tool.ts:81-92
   const serverAllowListKey = this.serverName;
   const toolAllowListKey = `${this.serverName}.${this.serverToolName}`;

   if (
     DiscoveredMCPToolInvocation.allowlist.has(serverAllowListKey) ||
     DiscoveredMCPToolInvocation.allowlist.has(toolAllowListKey)
   ) {
     return false; // server and/or tool already allowlisted
   }
   ```

3. **用户确认**：显示 MCP 工具确认对话框
   ```typescript
   // packages/core/src/tools/mcp-tool.ts:95-109
   const confirmationDetails: ToolMcpConfirmationDetails = {
     type: 'mcp',
     title: 'Confirm MCP Tool Execution',
     serverName: this.serverName,
     toolName: this.serverToolName,
     toolDisplayName: this.displayName,
     onConfirm: async (outcome: ToolConfirmationOutcome) => {
       if (outcome === ToolConfirmationOutcome.ProceedAlwaysServer) {
         DiscoveredMCPToolInvocation.allowlist.add(serverAllowListKey);
       } else if (outcome === ToolConfirmationOutcome.ProceedAlwaysTool) {
         DiscoveredMCPToolInvocation.allowlist.add(toolAllowListKey);
       }
     },
   };
   ```

4. **更新 allowlist**：根据用户选择，添加服务器级或工具级标识符

### 代码位置

- **定义位置**：`packages/core/src/tools/mcp-tool.ts:64`
  ```typescript
  private static readonly allowlist: Set<string> = new Set();
  ```

- **特殊性**：使用 `static` 关键字，在所有 MCP 工具实例间共享

---

## Allowlist 的生命周期

### 创建时机

- **Shell Tool**：`ShellTool` 类实例化时创建
  ```typescript
  // packages/core/src/tools/shell.ts:418
  private allowlist: Set<string> = new Set();
  ```

- **MCP Tool**：类加载时创建（静态成员）
  ```typescript
  // packages/core/src/tools/mcp-tool.ts:64
  private static readonly allowlist: Set<string> = new Set();
  ```

### 生命周期

```
┌─────────────────────────────────────────────┐
│  1. 会话开始                                 │
│     - Shell Tool 创建新的 allowlist 实例     │
│     - MCP Tool 使用静态 allowlist（跨实例）  │
└─────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│  2. 运行时填充                               │
│     - 用户首次使用命令/工具                   │
│     - 用户选择 "ProceedAlways*"              │
│     - 添加标识符到 allowlist                 │
└─────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│  3. 后续使用                                 │
│     - shouldConfirmExecute() 检查 allowlist │
│     - 命中则跳过确认                         │
│     - 未命中则提示用户                       │
└─────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│  4. 会话结束                                 │
│     - 进程退出                               │
│     - allowlist 数据清空（内存释放）         │
│     - 下次会话重新开始                       │
└─────────────────────────────────────────────┘
```

### 持久化

**不持久化**。allowlist 是内存中的数据结构，进程退出后完全清空。

**设计理由**：
- 安全性优先：避免过度信任
- 环境变化：命令/工具在不同会话中可能有不同含义
- 简化实现：无需处理存储、迁移等问题

---

## 核心机制

### 1. 权限确认流程

```typescript
// 通用流程（伪代码）
async shouldConfirmExecute(): Promise<ToolCallConfirmationDetails | false> {
  // Step 1: 提取标识符
  const identifiers = extractIdentifiers(this.params);

  // Step 2: 过滤出需要确认的
  const needConfirm = identifiers.filter(id => !this.allowlist.has(id));

  // Step 3: 如果都在 allowlist 中，直接通过
  if (needConfirm.length === 0) {
    return false; // 无需确认
  }

  // Step 4: 返回确认详情
  return {
    type: 'exec' | 'mcp',
    onConfirm: async (outcome) => {
      if (outcome === ToolConfirmationOutcome.ProceedAlways) {
        needConfirm.forEach(id => this.allowlist.add(id));
      }
    },
  };
}
```

### 2. Shell 特有：命令解析

Shell 工具需要处理复杂的命令语法：

- **管道**：`cat file | grep pattern` → `["cat", "grep"]`
- **逻辑组合**：`git add . && git commit` → `["git"]` (去重)
- **路径命令**：`/usr/bin/python3` → `"python3"`
- **引号处理**：`"my command" -arg` → `"my command"`

关键函数：
- `splitCommands()`: 按 `|`, `&&`, `||`, `;` 分割命令
- `getCommandRoot()`: 提取单个命令的根部分
- `getCommandRoots()`: 组合以上两者，去重

### 3. MCP 特有：双层粒度

MCP 工具提供两种信任粒度：

```
服务器级信任（粗粒度）
    ↓
  更宽松，信任所有工具
  适合：已知安全的服务器

工具级信任（细粒度）
    ↓
  更精确，只信任特定工具
  适合：部分信任或测试
```

用户可以根据信任程度选择：
- `ProceedAlwaysServer`：信任整个服务器
- `ProceedAlwaysTool`：只信任当前工具

---

## 相关代码位置

### Shell 工具

| 功能 | 文件路径 | 行号 |
|-----|---------|------|
| allowlist 定义 | `packages/core/src/tools/shell.ts` | 418 |
| allowlist 传递 | `packages/core/src/tools/shell.ts` | 489 |
| allowlist 接收 | `packages/core/src/tools/shell.ts` | 103 |
| allowlist 检查 | `packages/core/src/tools/shell.ts` | 151-153 |
| allowlist 更新 | `packages/core/src/tools/shell.ts` | 166 |
| 命令根提取 | `packages/core/src/utils/shell-utils.ts` | 174-196 |
| 批量根提取 | `packages/core/src/utils/shell-utils.ts` | 198-205 |

### MCP 工具

| 功能 | 文件路径 | 行号 |
|-----|---------|------|
| allowlist 定义 (static) | `packages/core/src/tools/mcp-tool.ts` | 64 |
| key 生成 | `packages/core/src/tools/mcp-tool.ts` | 81-82 |
| allowlist 检查 | `packages/core/src/tools/mcp-tool.ts` | 88-92 |
| allowlist 更新（服务器级） | `packages/core/src/tools/mcp-tool.ts` | 103 |
| allowlist 更新（工具级） | `packages/core/src/tools/mcp-tool.ts` | 105 |

### 工具确认系统

| 功能 | 文件路径 | 说明 |
|-----|---------|------|
| 确认详情类型定义 | `packages/core/src/tools/base.ts` | 定义 `ToolCallConfirmationDetails` |
| 确认结果枚举 | `packages/core/src/tools/base.ts` | 定义 `ToolConfirmationOutcome` |
| shouldConfirmExecute 方法 | `packages/core/src/tools/base.ts` | 基类定义的抽象方法 |

---

## 相关文档

- [01-权限验证系统总览.md](./01-权限验证系统总览.md) - 了解 allowlist 在整体架构中的位置
- [02-工具验证层实现指南.md](./02-工具验证层实现指南.md) - 工具验证层的详细实现，包括 allowlist 机制
