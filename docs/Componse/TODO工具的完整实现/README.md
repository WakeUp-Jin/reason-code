# TODO 工具的完整实现

> OpenCode 项目中 TODO 任务管理工具的完整设计与实现
>
> 日期：2026-01-04
>
> 这是一个**教科书级别的 LLM 工具设计案例**

---

## 📋 目录

1. [概述](#概述)
2. [文档结构](#文档结构)
3. [核心设计思想](#核心设计思想)
4. [技术亮点](#技术亮点)
5. [快速导航](#快速导航)

---

## 一、概述

### 1.1 功能定位

TODO 工具是 OpenCode 中用于**任务规划和进度跟踪**的核心工具，帮助 AI Agent：
- 规划复杂多步骤任务
- 跟踪执行进度
- 向用户展示工作计划
- 内部检查任务状态

### 1.2 设计特点

| 特点 | 说明 |
|------|------|
| 🎯 **读写分离** | TodoWrite（展示给用户）+ TodoRead（内部查询） |
| 📝 **详尽的工具描述** | 167 行的 TodoWrite 描述 vs 15 行的 TodoRead 描述 |
| 🔄 **事件驱动架构** | 使用 Bus 发布/订阅模式实现实时同步 |
| 💾 **文件持久化** | 基于 JSON 文件存储，按 sessionID 隔离 |
| 🎨 **双位置渲染** | 主区域显示工具调用，Sidebar 显示状态概览 |
| 🚫 **UI 过滤机制** | TodoRead 不显示在 UI，避免噪音 |

---

## 二、文档结构

```
TODO工具的完整实现/
├── README.md                          # 本文件 - 总览
├── 01-工具定义与实现.md                # 核心代码实现
├── 02-工具描述文档.md                  # 工具描述（英文+中文）
├── 03-系统提示词.md                    # 系统提示词（英文+中文）
├── 04-核心实现逻辑.md                  # 深度分析
└── 05-CLI-UI渲染参考.md                # UI 渲染机制（可选参考）
```

### 文档说明

| 文件 | 内容 | 重要性 |
|------|------|--------|
| `01-工具定义与实现.md` | 完整的代码实现：工具定义、业务逻辑、事件总线、存储层 | ⭐⭐⭐⭐⭐ |
| `02-工具描述文档.md` | 发送给 LLM 的工具描述（英文原文+中文翻译） | ⭐⭐⭐⭐⭐ |
| `03-系统提示词.md` | 系统提示词中的 TODO 相关部分（英文+中文） | ⭐⭐⭐⭐⭐ |
| `04-核心实现逻辑.md` | 设计思路、架构分析、数据流程 | ⭐⭐⭐⭐⭐ |
| `05-CLI-UI渲染参考.md` | CLI 前端如何渲染 TODO（参考） | ⭐⭐⭐ |

---

## 三、核心设计思想

### 3.1 读写分离（CQRS）

```typescript
// Command（命令）- 修改状态，展示给用户
TodoWriteTool: {
  description: "167 行详细指导",
  UI: "显示在用户界面",
  purpose: "规划和展示任务"
}

// Query（查询）- 只读状态，用户不可见
TodoReadTool: {
  description: "15 行简短说明",
  UI: "完全隐藏",
  purpose: "AI 内部状态检查"
}
```

### 3.2 事件驱动架构

```
工具执行 → 持久化存储 → 发布事件 → UI 订阅更新
   ↓           ↓           ↓          ↓
Todo.update  Storage    Bus.publish  setStore
```

### 3.3 多层次强化学习

确保 LLM 正确使用工具的三层策略：

1. **工具描述层**：167 行详细指导 + 8 个示例（4 正面 + 4 反面）
2. **系统提示词层**：专门的 "Task Management" 章节 + 2 个完整示例
3. **多次重复强化**：在提示词中 3 次强调使用 TODO 工具

---

## 四、技术亮点

### 4.1 提示词工程

| 技术 | 应用 |
|------|------|
| **Few-Shot Learning** | 8 个示例（正面+反面） |
| **Reasoning 标签** | 每个示例都有 `<reasoning>` 解释 |
| **对比学习** | "When to Use" vs "When NOT to Use" |
| **状态机设计** | pending → in_progress → completed |
| **约束强调** | "ONE task in_progress at a time" |

### 4.2 架构设计

```typescript
// 1. 类型安全（Zod Schema）
export const Info = z.object({
  content: z.string(),
  status: z.string(),
  priority: z.string(),
  id: z.string(),
})

// 2. 事件定义
export const Event = {
  Updated: BusEvent.define("todo.updated", ...)
}

// 3. 业务逻辑
export async function update(input) {
  await Storage.write(["todo", sessionID], todos)  // 持久化
  Bus.publish(Event.Updated, input)                // 发布事件
}
```

### 4.3 UI 可见性控制

```typescript
// UI 层过滤 TodoRead
export function AssistantMessageDisplay(props) {
  const filteredParts = createMemo(() => {
    return props.parts?.filter((x) => {
      return x.type !== "tool" || x.tool !== "todoread"  // 隐藏
    })
  })
}
```

---

## 五、快速导航

### 如果你想了解...

- **如何实现工具** → 查看 `01-工具定义与实现.md`
- **如何编写工具描述** → 查看 `02-工具描述文档.md`
- **如何设计系统提示词** → 查看 `03-系统提示词.md`
- **为什么这样设计** → 查看 `04-核心实现逻辑.md`
- **前端如何渲染** → 查看 `05-CLI-UI渲染参考.md`

### 核心文件位置

```
opencode/
├── packages/opencode/src/
│   ├── tool/
│   │   ├── todo.ts              # 工具定义
│   │   ├── todowrite.txt        # TodoWrite 描述
│   │   └── todoread.txt         # TodoRead 描述
│   ├── session/
│   │   └── todo.ts              # 业务逻辑
│   ├── storage/
│   │   └── storage.ts           # 存储层
│   ├── bus/
│   │   └── index.ts             # 事件总线
│   └── session/prompt/
│       └── anthropic.txt        # 系统提示词
```

---

## 六、为什么这个设计优雅？

### 6.1 单一职责原则

每个模块只做一件事：
- `tool/todo.ts`：工具定义和参数验证
- `session/todo.ts`：业务逻辑和事件发布
- `storage/storage.ts`：数据持久化
- `bus/index.ts`：事件通信

### 6.2 开闭原则

- 对扩展开放：可以轻松添加新的事件订阅者
- 对修改封闭：修改 UI 不影响后端逻辑

### 6.3 依赖倒置

```
Tool → Todo (业务逻辑) → Storage (抽象)
                      → Bus (抽象)
```

工具不直接依赖具体实现，而是依赖抽象接口。

### 6.4 用户体验优先

- **读操作对用户透明**：避免 UI 噪音
- **写操作向用户展示**：提供进度反馈
- **实时更新**：事件驱动，无需轮询
- **多位置展示**：主区域 + Sidebar

---

## 七、学习路径

### 初级：理解基本概念
1. 阅读 `README.md`（本文件）
2. 查看 `04-核心实现逻辑.md` 的"数据流程图"
3. 理解"为什么分成两个工具"

### 中级：掌握实现细节
1. 阅读 `01-工具定义与实现.md`
2. 理解事件驱动架构
3. 学习如何编写工具描述

### 高级：提示词工程
1. 精读 `02-工具描述文档.md`
2. 分析 `03-系统提示词.md` 的强化策略
3. 理解 Few-Shot Learning 的应用

### 实战：构建类似工具
1. 参考本设计实现其他工具
2. 应用读写分离模式
3. 使用事件驱动架构

---

## 八、最佳实践总结

### 8.1 工具设计

✅ **DO**：
- 读写分离（CQRS）
- 详尽的工具描述
- 提供正反示例
- 使用类型验证

❌ **DON'T**：
- 将读写混在一个工具
- 工具描述过于简短
- 缺少使用示例
- 忽略类型安全

### 8.2 提示词工程

✅ **DO**：
- 多层次强化（工具描述 + 系统提示词）
- 使用 `<reasoning>` 标签
- 提供对比示例
- 明确状态机

❌ **DON'T**：
- 只在一个地方说明
- 缺少推理过程
- 只提供正面示例
- 状态管理混乱

### 8.3 架构设计

✅ **DO**：
- 事件驱动
- 单一职责
- 依赖抽象
- 类型安全

❌ **DON'T**：
- 紧耦合
- 职责混乱
- 直接依赖
- 缺少验证

---

## 九、相关资源

### 代码仓库
- OpenCode: https://github.com/sst/opencode
- @opentui: https://github.com/phinxcz/opentui

### 相关文档
- `../通信机制/01-当前方案-CLI直接调用.md`
- `../cli的页面及其组件开发/01-整体架构设计.md`

### 技术栈
- **SolidJS**: https://www.solidjs.com/
- **Zod**: https://zod.dev/
- **Bun**: https://bun.sh/

---

## 十、更新日志

| 日期 | 版本 | 更新内容 |
|------|------|----------|
| 2026-01-04 | 1.0 | 初始版本，完整文档 |

---

**结论**：这是一个将**提示词工程**、**架构设计**、**用户体验**完美结合的案例，值得深入学习和参考！
