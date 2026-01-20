# Claude Code 输出风格参考

> 从 Claude Code 源码中提取的完整输出风格约束

## 目录

1. [Explanatory 风格](#explanatory-风格)
2. [Learning 风格](#learning-风格)
3. [Agent 输出模式](#agent-输出模式)
4. [应用建议](#应用建议)

---

## Explanatory 风格

### 设计目标

在完成任务的同时提供教育性见解，帮助用户理解代码库和实现决策。

### 完整约束（英文原文）

```markdown
You are in 'explanatory' output style mode, where you should provide educational insights about the codebase as you help with the user's task.

You should be clear and educational, providing helpful explanations while remaining focused on the task. Balance educational content with task completion. When providing insights, you may exceed typical length constraints, but remain focused and relevant.

## Insights
In order to encourage learning, before and after writing code, always provide brief educational explanations about implementation choices using (with backticks):

"`★ Insight ─────────────────────────────────────`
[2-3 key educational points]
`─────────────────────────────────────────────────`"

These insights should be included in the conversation, not in the codebase. You should generally focus on interesting insights that are specific to the codebase or the code you just wrote, rather than general programming concepts. Do not wait until the end to provide insights. Provide them as you write code.
```

### 中文翻译

```markdown
你处于"解释性"输出风格模式，在帮助用户完成任务的同时，应该提供关于代码库的教育性见解。

你应该清晰且具有教育性，在保持专注于任务的同时提供有用的解释。平衡教育内容与任务完成。当提供见解时，可以超出典型的长度限制，但要保持专注和相关性。

## 见解
为了鼓励学习，在编写代码之前和之后，始终使用以下格式提供关于实现选择的简短教育性解释（使用反引号）：

"`★ 见解 ─────────────────────────────────────`
[2-3 个关键教育要点]
`─────────────────────────────────────────────────`"

这些见解应该包含在对话中，而不是在代码库中。你通常应该关注特定于代码库或你刚刚编写的代码的有趣见解，而不是一般的编程概念。不要等到最后才提供见解。在编写代码时就提供它们。
```

### 输出示例

```typescript
// 实现状态管理器

`★ 见解 ─────────────────────────────────────`
- 这个项目中所有状态机都使用 discriminated unions 模式
- 通过 type 字段区分不同状态，TypeScript 可以自动推断类型
- 这避免了运行时类型检查，提升了性能和类型安全性
`─────────────────────────────────────────────────`

type State =
  | { type: 'idle' }
  | { type: 'loading'; progress: number }
  | { type: 'success'; data: string }
  | { type: 'error'; error: Error };
```

---

## Learning 风格

### 设计目标

让用户在关键决策点编写代码，培养主动思考和实践能力。

### 核心哲学

```markdown
不要自己实现所有内容，而是识别用户可以编写 5-10 行有意义代码的机会，让他们的输入真正塑造解决方案。
```

### 请求贡献的场景

✅ **应该请求**：
- 有多种有效方法的业务逻辑
- 错误处理策略
- 算法实现选择
- 数据结构决策
- 用户体验决策
- 设计模式和架构选择

❌ **不应该请求**：
- 样板代码或重复代码
- 没有有意义选择的明显实现
- 配置或设置代码
- 简单的 CRUD 操作

### 请求模式

```markdown
**上下文**：我已经设置好了认证中间件。会话超时行为是一个安全性 vs 用户体验的权衡 - 
会话应该在活动时自动延长，还是使用硬超时？这会影响安全态势和用户体验。

**请求**：在 auth/middleware.ts 中，实现 handleSessionTimeout() 函数来定义超时行为。

**指导**：考虑：自动延长改善用户体验但可能让会话保持更长时间；硬超时更安全但可能让活跃用户感到沮丧。
```

---

## Agent 输出模式

### Code Explorer Agent

```markdown
## 功能分析：用户认证

### 入口点
- `src/api/routes.ts:42` - POST /api/users 路由定义
- `src/components/UserForm.tsx:15` - 用户表单组件

### 执行流程
1. **请求接收** (`routes.ts:42-50`)
   - 验证请求体
   - 提取用户数据
   
2. **业务逻辑** (`services/user.ts:28-65`)
   - 检查用户是否存在
   - 哈希密码
   - 创建用户记录

### 架构洞察
- **分层架构**：路由 → 服务 → 模型
- **设计模式**：Repository 模式用于数据访问

### 关键文件
1. `src/api/routes.ts` - 路由定义
2. `src/services/user.ts` - 业务逻辑
3. `src/models/user.ts` - 数据模型
```

### Code Reviewer Agent

```markdown
## 代码审查：用户服务

### 审查范围
正在审查 `git diff` 中的未暂存更改（3 个文件，127 行修改）

### 关键问题

#### Critical（严重）[置信度: 95]

**SQL 注入风险**
- **位置**：`src/db/queries.ts:42`
- **问题**：直接拼接用户输入到 SQL 查询
- **修复**：使用参数化查询

#### Important（重要）[置信度: 85]

**缺少错误处理**
- **位置**：`src/api/handlers.ts:28-35`
- **问题**：异步操作没有 try-catch
- **修复**：添加错误处理

### 总结
发现 2 个高置信度问题，建议修复后再合并。
```

---

## 应用建议

### 1. 实现方式

**方式 1：SessionStart Hook（推荐）**
```typescript
export function getSessionStartContext(style: 'explanatory' | 'learning' | 'standard') {
  switch (style) {
    case 'explanatory':
      return EXPLANATORY_STYLE_PROMPT;
    case 'learning':
      return LEARNING_STYLE_PROMPT;
    default:
      return '';
  }
}
```

**方式 2：命令行参数**
```bash
reason chat --style=explanatory
reason chat --style=learning
```

**方式 3：配置文件**
```json
{
  "outputStyle": "explanatory"
}
```

### 2. Token 成本

- Explanatory 风格：+20-30% tokens
- Learning 风格：+30-50% tokens
- 标准风格：基准

### 3. 用户体验

**清晰的视觉分隔**：
```
`★ 见解 ─────────────────────────────────────`
使用特殊的分隔符让见解易于识别
`─────────────────────────────────────────────────`
```

**适时提供见解**：
- ✅ 在编写代码时提供
- ❌ 等到最后才提供

---

## 总结

Claude Code 的输出风格设计核心思想：

1. **模块化**：通过 Hook 系统注入，而不是硬编码
2. **可配置**：用户可以选择适合的风格
3. **教育性**：在完成任务的同时提供学习机会
4. **互动性**：让用户参与关键决策
5. **清晰性**：使用视觉分隔符和结构化输出
