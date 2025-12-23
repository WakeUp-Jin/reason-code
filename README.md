# Reason CLI

基于 **Monorepo + Workspace + Core/CLI 分层架构** 构建的 AI Agent 命令行工具。

## 架构特点

- **Monorepo 管理**：使用 Bun Workspaces 统一管理多个包
- **分层设计**：Core（核心逻辑）与 CLI（终端界面）分离
- **智能构建**：Turbo 智能缓存和并行构建
- **源码暴露**：开发时直接使用 TypeScript 源码，实现热更新
- **类型安全**：完整的 TypeScript 类型支持

## 项目结构

```
reason-cli/
├── package.json              # 根配置（workspaces + catalog）
├── turbo.json                # Turbo 构建配置
├── tsconfig.json             # TypeScript 根配置
└── packages/
    ├── core/                 # 核心逻辑包
    │   ├── src/
    │   │   ├── agent.ts      # Agent 引擎
    │   │   ├── llm.ts        # LLM 接口
    │   │   ├── tools.ts      # 工具系统
    │   │   └── index.ts      # 主导出
    │   └── package.json
    └── cli/                  # CLI 界面包
        ├── src/
        │   └── index.ts      # CLI 入口
        └── package.json
```

## 快速开始

### 安装依赖

```bash
bun install
```

这会自动：
- 安装所有依赖
- 创建符号链接（node_modules/@reason-cli/core -> packages/core）
- 提升共同依赖到根目录

### 开发运行

```bash
# 运行 CLI
bun run --cwd packages/cli dev

# 或者使用以下命令
cd packages/cli
bun run dev
```

### 可用命令

```bash
# 聊天命令
bun run --cwd packages/cli dev chat "你好，你好吗？"

# 查看信息
bun run --cwd packages/cli dev info
```

## 开发指南

### 核心机制

**1. 源码暴露**
- CLI 通过 `workspace:*` 依赖 Core
- Core 的 `exports` 指向 `.ts` 源码
- 符号链接：`node_modules/@reason-cli/core -> packages/core`
- 修改 Core 代码立即在 CLI 中生效

**2. 依赖管理**
- 使用 Bun Workspaces 管理多个包
- 共同依赖自动提升到根 `node_modules`
- Catalog 统一管理依赖版本

**3. 智能构建**
- Turbo 自动分析依赖关系
- 智能缓存构建结果
- 并行执行无依赖任务

### 常用命令

```bash
# 类型检查所有包
bun run typecheck

# 构建所有包
bun run build

# 清理构建产物
bun run clean
```

### 包结构说明

**Core 包**（`@reason-cli/core`）
- 纯业务逻辑，无 UI 依赖
- 包含 Agent 引擎、LLM 接口、工具系统
- 导出源码，支持热更新
- 可被 CLI、Web、Desktop 等多平台复用

**CLI 包**（`@reason-cli/cli`）
- 终端界面层
- 依赖 Core 包（`workspace:*`）
- 使用 Commander、Chalk、Ora 等 CLI 工具
- 命令名称：`reason`

## 架构优势

### 1. 开发体验好
- 修改 Core，CLI 立即看到效果
- 完整的 TypeScript 类型信息
- 精确的错误堆栈和调试信息

### 2. 多平台复用
- Core 可被 CLI、Web、Desktop 共享
- 一次修改，所有平台生效
- 保持核心逻辑稳定

### 3. 易于测试
- Core 独立于 UI，易于单元测试
- 无需启动 CLI 或浏览器
- 测试运行快速可靠

### 4. 版本管理清晰
- Core 保持稳定，很少更新
- UI 层可以快速迭代
- 依赖版本统一管理

## 验证步骤

### 1. 检查符号链接

```bash
# Bun workspaces 内部解析包
# 可以通过在 CLI 中导入来验证
```

### 2. 类型检查

```bash
bun run typecheck
# 所有包应该通过类型检查
```

### 3. 运行 CLI

```bash
bun run --cwd packages/cli dev info
# 应该显示项目信息
```

### 4. 测试热更新

1. 修改 `packages/core/src/agent.ts`
2. 重新运行 CLI
3. 立即看到修改效果

## 技术栈

- **运行时**：Bun
- **语言**：TypeScript 5.8.2
- **构建工具**：Turbo 2.5.6
- **CLI 框架**：Commander 12.0.0
- **终端美化**：Chalk 5.0.0、Ora 8.0.0
- **数据验证**：Zod 4.1.8

## 核心概念

### Monorepo
多个相关包在同一个仓库中管理，便于代码共享和原子化提交。

### Workspaces
包管理器提供的多包管理功能，自动创建符号链接和依赖提升。

### Core/CLI 分层
业务逻辑（Core）与表现层（CLI）分离，实现多平台复用。

### 源码暴露
开发时直接使用 `.ts` 源码，无需构建，实现热更新。

### Catalog
统一管理依赖版本，避免版本冲突。

### Turbo
智能构建系统，缓存构建结果，加速开发。

## 参考资料

本项目完全遵循现代化的 Monorepo 架构设计，详细文档请参考：
- Monorepo 架构概述
- Core + CLI 分层架构
- 依赖管理和源码暴露
- Turbo 构建系统

## 许可证

MIT

## 作者

Reason CLI Team
