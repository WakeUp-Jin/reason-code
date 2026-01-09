# Claude Code 系统提示词研究 - 索引

> 完整提取和分析 Claude Code 的系统提示词设计

## 📚 文档列表

### 0. [claude-code-system-prompts-extracted.md](./claude-code-system-prompts-extracted.md)
**从编译代码中提取的系统提示词**

- ✅ 从 5190 行编译 JavaScript 中提取的角色定义
- ✅ 20+ 专业化 Agent 角色（命令执行、文件搜索、架构设计等）
- ✅ 输出格式指令和约束
- ✅ 与插件提示词的对比分析
- ⚠️ **注意**：编译代码提取有限，完整提示词请参考下面的插件文档

**适用场景**：快速了解 Claude Code 的核心角色定义和约束

---

### 1. [agent-system-prompt-design.md](./agent-system-prompt-design.md)
**Agent 系统提示词设计指南**

- ✅ 核心设计原则（明确性、可操作性、结构化）
- ✅ 标准模板结构
- ✅ 实际示例（Code Explorer Agent）
- ✅ 输出风格约束基础

**适用场景**：学习如何设计高质量的 Agent 系统提示词

---

### 2. [tool-parallel-execution.md](./tool-parallel-execution.md)
**工具并行执行实现方案**

- ✅ Gemini CLI vs Reason Code 架构对比
- ✅ 完整实现步骤（3 个关键修改点）
- ✅ 代码修改清单
- ✅ 测试验证方案
- ✅ 性能对比分析（10倍提升）

**适用场景**：实现工具并行执行以提升性能

---

### 3. [claude-code-output-styles.md](./claude-code-output-styles.md)
**Claude Code 输出风格参考**

- ✅ Explanatory 风格完整约束（中英对照）
- ✅ Learning 风格核心哲学
- ✅ Agent 输出模式示例
- ✅ 应用建议和实现方式

**适用场景**：学习 Claude Code 的输出风格设计

---

### 4. [claude-code-all-prompts.md](./claude-code-all-prompts.md)
**Claude Code 完整系统提示词集合**

- ✅ Feature Development Agents（3个）
  - Code Explorer
  - Code Reviewer
  - Code Architect
  
- ✅ PR Review Toolkit Agents（5个）
  - Silent Failure Hunter
  - Comment Analyzer
  - Code Simplifier
  - PR Test Analyzer
  - Type Design Analyzer
  
- ✅ Commands（2个）
  - Feature Development Command（7阶段工作流）
  - Code Review Command（8步骤流程）
  
- ✅ Output Styles（2个）
  - Explanatory Style
  - Learning Style

**适用场景**：查阅完整的系统提示词参考

---

## 🎯 快速导航

### 按需求查找

**我想学习系统提示词设计**
→ 阅读 `agent-system-prompt-design.md`

**我想实现工具并行执行**
→ 阅读 `tool-parallel-execution.md`

**我想了解输出风格设计**
→ 阅读 `claude-code-output-styles.md`

**我想查看具体的提示词示例**
→ 阅读 `claude-code-all-prompts.md`

---

### 按 Agent 类型查找

**代码分析类**
- Code Explorer（代码探索）
- Code Architect（架构设计）

**代码审查类**
- Code Reviewer（代码审查）
- Silent Failure Hunter（静默失败检测）
- Comment Analyzer（注释分析）
- PR Test Analyzer（测试覆盖率分析）
- Type Design Analyzer（类型设计分析）

**代码优化类**
- Code Simplifier（代码简化）

**工作流类**
- Feature Development Command（功能开发工作流）
- Code Review Command（代码审查工作流）

---

## 💡 核心洞察

### 1. 系统提示词设计原则

```markdown
You are [具体角色] specializing in [特定领域].

## Core Mission
[一句话描述核心使命]

## Core Responsibilities
1. [主要职责]
2. [次要职责]

## [任务] Process
**1. [阶段]**
- [步骤]

## Output Format
[明确的输出结构]
```

### 2. 工具并行执行

```markdown
## Tool Usage
- **Parallelism**: Execute multiple independent tool calls in parallel when feasible
```

```typescript
// 智能判断并行/串行
const canParallel = toolCalls.every(tc => tool.isReadOnly());
if (canParallel) {
  return Promise.all(toolCalls.map(tc => this.schedule(tc)));
}
```

### 3. 输出风格约束

```markdown
`★ 见解 ─────────────────────────────────────`
- 特定于代码库的见解
- 实现决策的解释
`─────────────────────────────────────────────────`
```

---

## 🚀 应用到 Reason Code

### 立即可用的改进

1. **系统提示词优化**
   - 采用 Claude Code 的结构化模板
   - 添加明确的角色定义和核心使命
   - 提供具体的流程步骤

2. **工具并行执行**
   - 修改 `ToolScheduler.ts`
   - 添加系统提示词指令
   - 标记工具的 `isReadOnly` 属性

3. **输出风格增强**
   - 实现 Explanatory 风格（教育性见解）
   - 实现 Learning 风格（互动学习）
   - 通过配置文件切换

### 长期规划

1. **Agent 系统**
   - 实现专门的 Code Explorer Agent
   - 实现 Code Reviewer Agent
   - 实现 Code Architect Agent

2. **工作流自动化**
   - 实现 Feature Development 工作流
   - 实现 Code Review 工作流
   - 支持多阶段任务管理

3. **质量保证**
   - 实现置信度评分系统
   - 实现误报过滤机制
   - 实现自动化测试覆盖率分析

---

## 📊 对比分析

| 特性 | Claude Code | Gemini CLI | Reason Code（当前）|
|------|-------------|------------|-------------------|
| 系统提示词 | 插件化 Agent | 单一大型 | 单一简单 |
| 工具并行 | 隐式暗示 | 明确指令 | 串行执行 |
| 输出风格 | Hook 注入 | 内置 | 无 |
| Agent 系统 | 完整 | 无 | 无 |
| 工作流 | 多阶段 | 单一 | 单一 |

---

## 🎓 学习路径

### 初学者
1. 阅读 `agent-system-prompt-design.md` 了解基础
2. 查看 `claude-code-all-prompts.md` 中的简单示例
3. 尝试修改 Reason Code 的系统提示词

### 中级
1. 阅读 `tool-parallel-execution.md` 实现并行
2. 学习 `claude-code-output-styles.md` 的风格设计
3. 实现一个简单的 Agent

### 高级
1. 研究完整的 Feature Development 工作流
2. 实现多 Agent 协作系统
3. 设计自定义的工作流和 Agent

---

## 📝 总结

Claude Code 的系统提示词设计体现了：

1. **专业化**：每个 Agent 专注于特定领域
2. **结构化**：清晰的流程和输出格式
3. **实用主义**：平衡完美与可行性
4. **用户中心**：关键决策需要用户参与
5. **质量优先**：高置信度、低误报

这些设计原则可以直接应用到 Reason Code 项目中，显著提升用户体验和代码质量。
