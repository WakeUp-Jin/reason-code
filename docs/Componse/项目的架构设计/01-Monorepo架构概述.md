# Monorepo + Workspace 架构概述

## 什么是 Monorepo？

**Monorepo（单一仓库）** 是一种将多个相关项目放在同一个 Git 仓库中管理的架构模式。

### 传统多仓库 vs Monorepo

```
传统多仓库（Multi-repo）：
├── agent-core/          # 独立仓库 1
│   └── .git
├── agent-cli/           # 独立仓库 2
│   └── .git
└── agent-web/           # 独立仓库 3
    └── .git

Monorepo（单一仓库）：
my-agent-project/        # 一个仓库
├── .git                 # 共享的 Git
└── packages/
    ├── core/
    ├── cli/
    └── web/
```

## Monorepo 的优势

### 1. 代码共享更容易

```typescript
// packages/core/src/agent.ts
export class Agent {
  run() { /* ... */ }
}

// packages/cli/src/index.ts
import { Agent } from '@my-agent/core'  // ✅ 直接引用，无需发布到 npm

// packages/web/src/app.tsx
import { Agent } from '@my-agent/core'  // ✅ 同样可以引用
```

### 2. 原子化提交

```bash
# 一次提交可以同时修改多个包
git commit -m "feat: add new Agent feature"
  modified: packages/core/src/agent.ts
  modified: packages/cli/src/index.ts
  modified: packages/web/src/app.tsx

# ✅ 保证三个包的一致性
# ✅ 避免版本不匹配
```

### 3. 统一的工具链

```json
{
  "devDependencies": {
    "typescript": "5.8.2",    // 所有包共享
    "prettier": "3.6.2",      // 统一代码格式化
    "turbo": "2.5.6"          // 统一构建工具
  }
}
```

### 4. 简化依赖管理

```bash
# 传统方式：每个仓库独立安装
cd agent-core && npm install
cd agent-cli && npm install
cd agent-web && npm install

# Monorepo：一次安装所有依赖
bun install  # ✅ 一条命令搞定
```

## Workspace 是什么？

**Workspace（工作区）** 是 npm/yarn/bun 提供的功能，用于在 Monorepo 中管理多个包。

### 核心机制

```json
// 根 package.json
{
  "workspaces": {
    "packages": ["packages/*"]  // 声明工作区
  }
}
```

当运行 `bun install` 时，Workspace 会：

1. **扫描所有子包** - 读取 `packages/*` 下的所有 `package.json`
2. **分析依赖关系** - 确定哪个包依赖哪个包
3. **创建符号链接** - 将内部包链接到 `node_modules`
4. **提升共同依赖** - 相同依赖只安装一份到根目录

## 目录结构

```
my-agent-project/
├── package.json                    # 根配置（声明 workspaces）
├── node_modules/                   # 共享依赖
│   ├── @my-agent/
│   │   ├── core -> ../../packages/core    # 符号链接
│   │   └── cli -> ../../packages/cli      # 符号链接
│   ├── typescript/                 # 共享依赖
│   └── zod/                        # 共享依赖
├── packages/
│   ├── core/
│   │   ├── package.json
│   │   └── src/
│   ├── cli/
│   │   ├── package.json
│   │   └── src/
│   └── web/
│       ├── package.json
│       └── src/
├── turbo.json                      # Turbo 配置
└── tsconfig.json                   # 共享 TypeScript 配置
```

## 依赖提升（Hoisting）

### 原理

当多个包使用相同依赖时，Workspace 会将其"提升"到根 `node_modules`。

```json
// packages/core/package.json
{
  "dependencies": {
    "zod": "4.1.8"
  }
}

// packages/cli/package.json
{
  "dependencies": {
    "zod": "4.1.8"  // 相同版本
  }
}
```

**结果：**
```
node_modules/
└── zod/                 # ✅ 只安装一份
    └── 4.1.8/

packages/core/node_modules/  # ❌ 空（依赖被提升）
packages/cli/node_modules/   # ❌ 空（依赖被提升）
```

### 版本冲突处理

```json
// packages/core/package.json
{
  "dependencies": {
    "lodash": "4.0.0"
  }
}

// packages/cli/package.json
{
  "dependencies": {
    "lodash": "5.0.0"  // 不同版本
  }
}
```

**结果：**
```
node_modules/
└── lodash/              # 主版本（更常用的）
    └── 5.0.0/

packages/core/node_modules/
└── lodash/              # 特殊版本
    └── 4.0.0/
```

## Catalog 统一版本管理

### 配置

```json
// 根 package.json
{
  "workspaces": {
    "catalog": {
      "typescript": "5.8.2",
      "zod": "4.1.8",
      "@types/node": "22.13.9"
    }
  }
}
```

### 使用

```json
// packages/core/package.json
{
  "dependencies": {
    "typescript": "catalog:",  // 自动使用 5.8.2
    "zod": "catalog:"          // 自动使用 4.1.8
  }
}

// packages/cli/package.json
{
  "dependencies": {
    "typescript": "catalog:",  // 也使用 5.8.2
    "zod": "catalog:"          // 也使用 4.1.8
  }
}
```

### 优势

- ✅ 一处修改，全局生效
- ✅ 避免版本冲突
- ✅ 保证类型兼容性
- ✅ 更容易维护

## 适用场景

Monorepo 适合以下项目：

1. **多平台应用** - CLI、Web、Desktop、Mobile 共享核心代码
2. **组件库 + 应用** - UI 组件库和使用它的应用
3. **前端 + 后端** - 全栈应用，共享类型定义
4. **插件系统** - 核心 + 多个插件
5. **微服务** - 多个服务共享基础库

## 业界案例

- **Google** - 整个公司使用一个 Monorepo
- **Facebook** - React、Jest、Metro 等都在一个仓库
- **Vercel** - Next.js 及其生态系统
- **Microsoft** - TypeScript、VS Code
- **Nx** - 企业级 Monorepo 工具
