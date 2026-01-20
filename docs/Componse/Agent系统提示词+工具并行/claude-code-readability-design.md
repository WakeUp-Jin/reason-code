# Claude Code 输出可读性设计精髓

> 提取影响输出可读性的关键提示词设计

## 🎯 核心发现

Claude Code 的输出之所以**极其可读**，关键在于以下几个设计原则：

---

## 1. 明确的输出指导（Output Guidance）

### Code Explorer 的输出指导

```markdown
## Output Guidance

Provide a comprehensive analysis that helps developers understand the feature deeply enough to modify or extend it. Include:

- Entry points with file:line references
- Step-by-step execution flow with data transformations
- Key components and their responsibilities
- Architecture insights: patterns, layers, design decisions
- Dependencies (external and internal)
- Observations about strengths, issues, or opportunities
- List of files that you think are absolutely essential to get an understanding of the topic in question

Structure your response for maximum clarity and usefulness. Always include specific file paths and line numbers.
```

**关键要素**：
1. ✅ **具体的输出结构**：明确列出要包含的内容
2. ✅ **file:line 引用**：提供精确的代码位置
3. ✅ **分层组织**：入口点 → 执行流程 → 组件 → 架构洞察
4. ✅ **可操作性**：开发者能够直接使用这些信息

---

### Code Architect 的输出指导

```markdown
## Output Guidance

Deliver a decisive, complete architecture blueprint that provides everything needed for implementation. Include:

- **Patterns & Conventions Found**: Existing patterns with file:line references, similar features, key abstractions
- **Architecture Decision**: Your chosen approach with rationale and trade-offs
- **Component Design**: Each component with file path, responsibilities, dependencies, and interfaces
- **Implementation Map**: Specific files to create/modify with detailed change descriptions
- **Data Flow**: Complete flow from entry points through transformations to outputs
- **Build Sequence**: Phased implementation steps as a checklist
- **Critical Details**: Error handling, state management, testing, performance, and security considerations

Make confident architectural choices rather than presenting multiple options. Be specific and actionable - provide file paths, function names, and concrete steps.
```

**关键要素**：
1. ✅ **决策性**：做出明确的选择，而不是列出多个选项
2. ✅ **完整性**：提供实现所需的一切
3. ✅ **结构化**：使用粗体标题分隔不同部分
4. ✅ **可执行性**：具体的文件路径、函数名称、步骤

---

### Code Reviewer 的输出指导

```markdown
## Output Guidance

Start by clearly stating what you're reviewing. For each high-confidence issue, provide:

- Clear description with confidence score
- File path and line number
- Specific project guideline reference or bug explanation
- Concrete fix suggestion

Group issues by severity (Critical vs Important). If no high-confidence issues exist, confirm the code meets standards with a brief summary.

Structure your response for maximum actionability - developers should know exactly what to fix and why.
```

**关键要素**：
1. ✅ **置信度评分**：让用户知道问题的可靠性
2. ✅ **分组组织**：按严重程度分类
3. ✅ **具体修复**：不只是指出问题，还提供解决方案
4. ✅ **可操作性**：开发者能立即采取行动

---

## 2. 结构化的呈现（Structure Your Response）

### 通用模式

```markdown
Structure your response for maximum clarity and usefulness.
```

这句话出现在多个 Agent 中，强调了**结构化输出**的重要性。

### 具体实现

**Code Explorer 的输出结构**：
```markdown
## 功能分析：[功能名称]

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

**Code Architect 的输出结构**：
```markdown
## 架构蓝图：[功能名称]

### 发现的模式和约定
- **模块结构**：`src/features/[feature]/` 模式
- **状态管理**：使用 Zustand，文件位于 `src/stores/`
- **API 调用**：统一通过 `src/api/client.ts`

### 架构决策
**选择方案**：基于现有模式的增量实现

**理由**：
- 与现有代码库无缝集成
- 最小化学习曲线
- 复用现有抽象

**权衡**：
- ✅ 快速实现
- ✅ 一致性高
- ⚠️ 可能需要未来重构

### 组件设计

#### 1. UserAuthService (`src/services/auth.ts`)
**职责**：
- 处理用户认证逻辑
- 管理会话状态
- 验证令牌

**依赖**：
- `src/api/client.ts` - API 调用
- `src/stores/auth.ts` - 状态存储

**接口**：
```typescript
interface UserAuthService {
  login(credentials: Credentials): Promise<User>;
  logout(): Promise<void>;
  validateToken(token: string): Promise<boolean>;
}
```

### 实现映射

#### 创建的文件
1. **`src/services/auth.ts`**
   - 实现 UserAuthService 接口
   - 添加 login、logout、validateToken 方法
   - 集成 API client

2. **`src/stores/auth.ts`**
   - 创建 Zustand store
   - 管理用户状态和令牌
   - 提供 actions 和 selectors

#### 修改的文件
1. **`src/api/client.ts`**
   - 添加认证相关的 API 端点
   - 实现令牌刷新逻辑

### 数据流
```
用户输入 → LoginForm
  ↓
UserAuthService.login()
  ↓
API Client → POST /api/auth/login
  ↓
AuthStore.setUser()
  ↓
UI 更新（重定向到 Dashboard）
```

### 构建序列

**Phase 1: 基础设施**
- [ ] 创建 `src/services/auth.ts` 骨架
- [ ] 创建 `src/stores/auth.ts` store
- [ ] 添加 API 端点到 `src/api/client.ts`

**Phase 2: 核心功能**
- [ ] 实现 login 方法
- [ ] 实现 logout 方法
- [ ] 实现令牌验证

**Phase 3: 集成**
- [ ] 连接 LoginForm 组件
- [ ] 添加路由守卫
- [ ] 实现自动令牌刷新

**Phase 4: 测试**
- [ ] 单元测试 AuthService
- [ ] 集成测试认证流程
- [ ] E2E 测试登录/登出

### 关键细节

**错误处理**：
- 使用统一的错误处理中间件
- 区分网络错误和认证错误
- 提供用户友好的错误消息

**状态管理**：
- 令牌存储在 localStorage
- 用户状态存储在 Zustand
- 自动同步跨标签页

**测试**：
- Mock API 调用
- 测试所有错误路径
- 验证状态更新

**性能**：
- 令牌缓存
- 避免不必要的 API 调用
- 优化状态更新

**安全**：
- HTTPS only
- HttpOnly cookies for refresh tokens
- CSRF 保护
```

---

## 3. 呈现方式（Present）

### Feature Development Command 的呈现指令

```markdown
**Phase 2: Codebase Exploration**
3. Present comprehensive summary of findings and patterns discovered

**Phase 3: Clarifying Questions**
3. **Present all questions to the user in a clear, organized list**

**Phase 4: Architecture Design**
3. Present to user: brief summary of each approach, trade-offs comparison, **your recommendation with reasoning**, concrete implementation differences

**Phase 6: Quality Review**
3. **Present findings to user and ask what they want to do** (fix now, fix later, or proceed as-is)
```

**关键模式**：
1. ✅ **主动呈现**：不等用户问，主动展示发现
2. ✅ **组织化列表**：使用清晰的列表结构
3. ✅ **包含推荐**：不只是列出选项，还给出建议
4. ✅ **互动性**：询问用户的决策

---

## 4. 视觉分隔和格式化

### 使用 Markdown 结构

```markdown
## 主标题（功能/模块名称）

### 二级标题（阶段/部分）

**粗体强调**：关键信息

- 列表项
  - 嵌套列表

`代码引用`

```代码块```

---
分隔线
```

### 使用符号和图标

```markdown
✅ 优点
⚠️ 注意事项
❌ 缺点

→ 流程箭头
↓ 数据流向

[Phase 1] 阶段标记
```

---

## 5. 精确的引用（file:line references）

### 始终包含具体位置

```markdown
❌ 不好的示例：
"在路由文件中定义了用户端点"

✅ 好的示例：
"`src/api/routes.ts:42` - POST /api/users 路由定义"
```

### 引用格式

```markdown
- `file/path.ts:42` - 单行引用
- `file/path.ts:42-50` - 多行引用
- `file/path.ts:42-50` (`functionName`) - 带函数名
```

---

## 6. 分层组织（Layered Organization）

### Code Explorer 的分层

```markdown
1. 入口点（Entry Points）
   ↓
2. 执行流程（Execution Flow）
   ↓
3. 组件职责（Component Responsibilities）
   ↓
4. 架构洞察（Architecture Insights）
   ↓
5. 依赖关系（Dependencies）
   ↓
6. 观察和建议（Observations）
```

### Code Architect 的分层

```markdown
1. 发现的模式（Patterns Found）
   ↓
2. 架构决策（Architecture Decision）
   ↓
3. 组件设计（Component Design）
   ↓
4. 实现映射（Implementation Map）
   ↓
5. 数据流（Data Flow）
   ↓
6. 构建序列（Build Sequence）
   ↓
7. 关键细节（Critical Details）
```

---

## 7. 可操作性（Actionability）

### 提供具体步骤

```markdown
❌ 不好的示例：
"需要实现认证功能"

✅ 好的示例：
**Phase 1: 基础设施**
- [ ] 创建 `src/services/auth.ts` 文件
- [ ] 添加 UserAuthService 接口
- [ ] 实现 login 方法签名

**Phase 2: 核心功能**
- [ ] 在 login 方法中调用 API
- [ ] 处理成功和失败情况
- [ ] 更新 AuthStore 状态
```

### 提供代码示例

```markdown
**接口定义**：
```typescript
interface UserAuthService {
  login(credentials: Credentials): Promise<User>;
  logout(): Promise<void>;
}
```

**使用示例**：
```typescript
const authService = new UserAuthService();
const user = await authService.login({ email, password });
```
```

---

## 8. 关键短语（Key Phrases）

### 在系统提示词中使用的关键短语

```markdown
1. "Structure your response for maximum clarity and usefulness"
   → 强调结构化和实用性

2. "Always include specific file paths and line numbers"
   → 强调精确引用

3. "Provide a comprehensive analysis"
   → 强调完整性

4. "Make confident architectural choices rather than presenting multiple options"
   → 强调决策性

5. "Be specific and actionable"
   → 强调可操作性

6. "Developers should know exactly what to fix and why"
   → 强调明确性

7. "Present to user"
   → 强调主动呈现

8. "Organize in a clear list"
   → 强调组织性
```

---

## 9. 完整示例：Code Explorer 输出

```markdown
## 功能分析：用户认证系统

### 入口点
- `src/pages/Login.tsx:15` - 登录页面组件
- `src/api/routes.ts:42` - POST /api/auth/login 路由
- `src/middleware/auth.ts:10` - 认证中间件

### 执行流程

**1. 用户提交登录表单** (`Login.tsx:25-40`)
- 收集用户名和密码
- 验证表单输入
- 调用 authService.login()

**2. 认证服务处理** (`services/auth.ts:18-45`)
- 发送 POST 请求到 /api/auth/login
- 接收 JWT token
- 存储 token 到 localStorage
- 更新全局状态

**3. API 端点验证** (`api/routes.ts:42-68`)
- 验证用户凭据
- 查询数据库
- 生成 JWT token
- 返回用户信息

**4. 状态更新** (`stores/auth.ts:30-42`)
- 更新 isAuthenticated 状态
- 存储用户信息
- 触发 UI 重新渲染

### 架构洞察

**分层架构**：
- **展示层**：React 组件 (`src/pages/`, `src/components/`)
- **业务逻辑层**：服务类 (`src/services/`)
- **数据层**：API 路由和数据库 (`src/api/`, `src/models/`)

**设计模式**：
- **Service Pattern**：认证逻辑封装在 AuthService
- **Repository Pattern**：数据访问通过 UserRepository
- **Observer Pattern**：Zustand store 用于状态管理

**横切关注点**：
- **认证**：JWT 中间件 (`middleware/auth.ts`)
- **日志**：Winston logger (`utils/logger.ts`)
- **错误处理**：全局错误处理器 (`middleware/error.ts`)

### 关键组件

**1. AuthService** (`src/services/auth.ts`)
- **职责**：处理所有认证相关逻辑
- **依赖**：API client, AuthStore
- **关键方法**：login(), logout(), refreshToken()

**2. AuthStore** (`src/stores/auth.ts`)
- **职责**：管理认证状态
- **状态**：user, token, isAuthenticated
- **Actions**：setUser(), clearUser()

**3. AuthMiddleware** (`src/middleware/auth.ts`)
- **职责**：保护需要认证的路由
- **验证**：检查 JWT token 有效性
- **错误处理**：返回 401 Unauthorized

### 依赖关系

**外部依赖**：
- `jsonwebtoken` - JWT 生成和验证
- `bcrypt` - 密码哈希
- `zustand` - 状态管理

**内部依赖**：
- `Login.tsx` → `AuthService`
- `AuthService` → `API Client` → `Auth Routes`
- `Auth Routes` → `UserRepository` → `Database`

### 数据流

```
用户输入
  ↓
Login.tsx (表单验证)
  ↓
AuthService.login() (业务逻辑)
  ↓
API Client (HTTP 请求)
  ↓
POST /api/auth/login (路由处理)
  ↓
UserRepository.findByEmail() (数据查询)
  ↓
bcrypt.compare() (密码验证)
  ↓
jwt.sign() (生成 token)
  ↓
返回 { user, token }
  ↓
AuthStore.setUser() (状态更新)
  ↓
UI 重定向到 Dashboard
```

### 观察

**优点**：
- ✅ 清晰的职责分离
- ✅ 良好的错误处理
- ✅ 使用行业标准库（JWT, bcrypt）
- ✅ 状态管理集中化

**改进机会**：
- ⚠️ 可以添加 refresh token 机制
- ⚠️ 考虑实现 OAuth 2.0 支持
- ⚠️ 添加速率限制防止暴力破解
- ⚠️ 实现多因素认证（MFA）

**技术债务**：
- Token 存储在 localStorage（考虑使用 HttpOnly cookies）
- 缺少 CSRF 保护
- 密码策略较弱（可以加强复杂度要求）

### 关键文件（必读）

1. **`src/services/auth.ts`** - 认证核心逻辑
2. **`src/api/routes.ts`** - API 端点定义
3. **`src/stores/auth.ts`** - 状态管理
4. **`src/middleware/auth.ts`** - 认证中间件
5. **`src/models/user.ts`** - 用户数据模型
```

---

## 10. 应用到 Reason Code

### 立即可用的改进

**1. 添加输出指导到系统提示词**

```typescript
export const CODE_ANALYSIS_PROMPT = `
你是一个代码分析专家，专注于理解和解释代码库。

## 输出指导

提供全面的分析，帮助开发者深入理解功能。包括：

- **入口点**：带有 file:line 引用
- **执行流程**：逐步说明数据转换
- **关键组件**：职责和依赖关系
- **架构洞察**：模式、层次、设计决策
- **依赖关系**：外部和内部
- **观察**：优势、问题或机会
- **关键文件列表**：理解主题必读的文件

**结构化你的响应以获得最大的清晰度和实用性。始终包含具体的文件路径和行号。**
`;
```

**2. 强制使用结构化输出**

```typescript
export const STRUCTURED_OUTPUT_INSTRUCTION = `
## 输出格式要求

使用以下结构组织你的响应：

### 主要发现
[总结关键发现]

### 详细分析
**1. [方面1]**
- 具体细节
- file:line 引用

**2. [方面2]**
- 具体细节
- file:line 引用

### 建议
- [ ] 可操作的步骤1
- [ ] 可操作的步骤2

始终使用：
- ✅ 优点
- ⚠️ 注意事项
- ❌ 问题
- → 流程指示
`;
```

**3. 添加呈现指令**

```typescript
export const PRESENTATION_INSTRUCTION = `
## 呈现方式

- **主动呈现**：不等用户问，主动展示发现
- **组织化**：使用清晰的标题和列表
- **包含推荐**：给出你的建议和理由
- **互动性**：在关键决策点询问用户

**示例**：
"我发现了 3 种实现方法。基于现有代码库，我推荐方法 2，因为...你同意吗？"
`;
```

---

## 总结

Claude Code 输出可读性的**核心秘诀**：

1. **明确的输出指导**：告诉 AI 输出什么、如何组织
2. **结构化响应**：使用标题、列表、分隔符
3. **精确引用**：file:line 格式
4. **分层组织**：从高层到细节
5. **可操作性**：提供具体步骤和代码示例
6. **视觉分隔**：使用符号和格式化
7. **主动呈现**：不等用户问就展示发现
8. **决策性**：给出明确建议而不是列出选项

这些设计可以直接应用到 Reason Code 的系统提示词中！
