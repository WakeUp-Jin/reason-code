# CLI 终端应用开发文档

> 基于 Bun + Ink 的优雅终端 AI 对话应用
>
> 创建日期：2025-12-23
> 状态：📝 文档完成，待开发实现

---

## 📚 文档概述

这是一套完整的 CLI 终端应用开发文档集，涵盖从架构设计到具体实现的所有细节。参考 **OpenCode** 项目的 UI 设计，使用现代化技术栈重新实现。

### 🎯 项目定位

一个**基于 Ink 的终端 AI 对话应用**，提供：
- 🎨 优雅的终端 UI
- 💬 流畅的 AI 对话体验
- 📝 完整的 Session 管理
- 🎯 强大的命令面板
- 🌈 丰富的主题系统

---

## 🛠️ 技术栈

| 技术 | 版本 | 用途 |
|------|------|------|
| **Bun** | ^1.0.0 | 运行时和包管理器 |
| **Ink** | ^4.4.1 | 终端 UI 框架（React for Terminal） |
| **React** | ^18.2.0 | UI 组件框架 |
| **Zustand** | ^4.4.7 | 轻量级状态管理 |
| **TypeScript** | ^5.3.0 | 类型系统 |
| **fuzzysort** | ^3.1.0 | 模糊搜索 |
| **chalk** | ^5.3.0 | 终端颜色工具 |

---

## ✨ 核心特性

### 🎨 主题系统
- 6 个精选主题（Kanagawa、GitHub、Solarized、Dracula、Nord、Catppuccin）
- 46 个语义化颜色
- Dark/Light 模式自动切换
- 终端背景色自动检测（OSC 11）

### 💬 AI 对话
- 流式输出，实时反馈
- 支持多模型切换
- Tool 调用可视化
- 完整的对话历史

### 📝 Session 管理
- 多会话并行
- 会话分支（Fork）
- 重命名和删除
- 时间线视图

### 🎯 命令面板
- 模糊搜索（fuzzysort）
- 33+ 预定义命令
- 快捷键支持
- 分类显示

### 📊 状态监控
- TODO 列表追踪
- Permission 确认提示
- 工具调用监控
- 实时状态反馈

### 🔧 系统集成
- 剪贴板支持（OSC 52）
- 外部编辑器集成（$EDITOR）
- 代码高亮显示
- Diff 对比查看

---

## 📖 文档结构

### 核心文档（4 个）

| 文档 | 说明 | 字数 |
|------|------|------|
| [01-整体架构设计.md](./01-整体架构设计.md) | 项目架构、技术选型、目录结构、模块划分 | ~6,000 字 |
| [02-数据流和状态管理.md](./02-数据流和状态管理.md) | Zustand 状态管理、事件总线、JSON 持久化 | ~5,000 字 |
| [03-核心UI组件实现指南.md](./03-核心UI组件实现指南.md) | DialogSelect、Prompt、Dialog 系统、Toast | ~6,000 字 |
| [04-主题系统设计.md](./04-主题系统设计.md) | 主题 JSON 格式、颜色系统、终端检测 | ~5,000 字 |

### 补充文档

- [../最终组件清单.md](../最终组件清单.md) - 完整的组件清单（42 个组件）
- [../通信机制/](../通信机制/) - 通信架构设计文档

---

## 🗺️ 学习路线

### 第一阶段：理解架构（1-2 天）

1. **阅读顺序**：
   ```
   最终组件清单.md
        ↓
   01-整体架构设计.md
        ↓
   02-数据流和状态管理.md
   ```

2. **重点理解**：
   - 单进程架构 vs 多进程架构
   - Zustand 状态管理
   - 事件总线（Bus）系统
   - JSON 文件持久化

### 第二阶段：UI 实现（3-5 天）

1. **阅读顺序**：
   ```
   03-核心UI组件实现指南.md
        ↓
   04-主题系统设计.md
   ```

2. **重点实现**：
   - DialogSelect（最核心组件）
   - Prompt 输入框
   - Dialog 系统
   - ThemeProvider

### 第三阶段：功能完善（5-8 天）

1. **业务组件**：
   - DialogCommand（命令面板）
   - DialogStatus（状态监控）
   - TODO 列表
   - Permission 确认

2. **高级功能**：
   - 代码高亮
   - Diff 显示
   - 剪贴板集成
   - 外部编辑器

### 第四阶段：测试与优化（2-3 天）

1. **性能优化**：
   - React.memo 避免重渲染
   - 虚拟化长列表
   - 主题缓存

2. **测试**：
   - 单元测试
   - 集成测试
   - 用户体验测试

---

## 🚀 快速开始

### 1. 阅读文档

```bash
# 按顺序阅读核心文档
cat 01-整体架构设计.md
cat 02-数据流和状态管理.md
cat 03-核心UI组件实现指南.md
cat 04-主题系统设计.md
```

### 2. 创建项目

```bash
# 使用 Bun 创建项目
bun init

# 安装依赖
bun add ink react zustand fuzzysort chalk
bun add -d @types/react @types/node typescript
```

### 3. 目录结构

```
my-cli-app/
├── src/
│   ├── index.ts                    # 入口文件
│   ├── cli/main.tsx                # CLI 主函数
│   ├── routes/                     # 路由页面
│   ├── ui/                         # 基础 UI 组件
│   ├── components/                 # 业务组件
│   ├── contexts/                   # Context Providers
│   ├── agent/                      # Agent 层
│   ├── storage/                    # 持久化层
│   ├── bus/                        # 事件总线
│   ├── themes/                     # 主题文件
│   └── utils/                      # 工具函数
├── data/                           # 数据目录（运行时生成）
└── docs/                           # 文档
```

### 4. Hello World

```typescript
// src/index.ts
#!/usr/bin/env bun
import { render, Box, Text } from 'ink'
import React from 'react'

function App() {
  return (
    <Box flexDirection="column" padding={1}>
      <Text color="cyan" bold>
        Hello World!
      </Text>
      <Text dimColor>
        Welcome to CLI App
      </Text>
    </Box>
  )
}

render(<App />)
```

---

## 📊 开发计划

### 时间估算（15-20 天）

| 阶段 | 任务 | 时间 |
|------|------|------|
| **第 1-2 天** | 阅读文档，理解架构 | 2 天 |
| **第 3-5 天** | 搭建项目，实现核心组件 | 3 天 |
| **第 6-8 天** | 实现 Dialog 系统和主题 | 3 天 |
| **第 9-12 天** | 实现业务组件和功能 | 4 天 |
| **第 13-15 天** | Agent 集成和 Storage | 3 天 |
| **第 16-18 天** | 高级功能（代码高亮、Diff） | 3 天 |
| **第 19-20 天** | 测试和优化 | 2 天 |

### 里程碑

```
✅ 阶段 0：文档完成（当前）
   └─ 4 个核心文档 + 组件清单

⏳ 阶段 1：基础框架（第 1-5 天）
   ├─ 项目搭建
   ├─ 核心 UI 组件
   └─ 基础布局

⏳ 阶段 2：状态管理（第 6-10 天）
   ├─ Zustand Store
   ├─ Event Bus
   └─ Dialog 系统

⏳ 阶段 3：业务功能（第 11-15 天）
   ├─ Session 管理
   ├─ AI 对话
   └─ 命令面板

⏳ 阶段 4：完善优化（第 16-20 天）
   ├─ 高级功能
   ├─ 性能优化
   └─ 测试发布
```

---

## 🎨 架构概览

```
┌─────────────────────────────────────────────────────────┐
│                    CLI 应用（单进程）                    │
│                                                          │
│  ┌────────────────────────────────────────────────────┐ │
│  │              UI 层（Ink + React）                   │ │
│  │  Routes  Components  Dialogs                       │ │
│  └─────────────────────┬──────────────────────────────┘ │
│                        │                                 │
│  ┌─────────────────────┴──────────────────────────────┐ │
│  │         Context Providers（状态管理）              │ │
│  │  Theme  Store  Dialog  Toast  Route  Command       │ │
│  └─────────────────────┬──────────────────────────────┘ │
│                        │                                 │
│  ┌─────────────────────┴──────────────────────────────┐ │
│  │          业务逻辑层（Agent + Storage）             │ │
│  │  Agent  Storage  Bus                               │ │
│  └─────────────────────┬──────────────────────────────┘ │
│                        │                                 │
│  ┌─────────────────────┴──────────────────────────────┐ │
│  │              工具层（Utils）                        │ │
│  │  terminal  clipboard  editor  highlight  diff      │ │
│  └────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

---

## 📈 性能指标

| 指标 | 目标 | 说明 |
|------|------|------|
| **启动时间** | < 100ms | Bun 快速启动 + 预加载 |
| **内存占用** | < 150MB | 单进程，无多余依赖 |
| **UI 渲染** | 60 FPS | Ink 高性能渲染 |
| **事件延迟** | < 5ms | 内存事件总线 |

---

## 🔗 相关资源

### 官方文档

- [Bun 文档](https://bun.sh/docs)
- [Ink 文档](https://github.com/vadimdemedes/ink)
- [Zustand 文档](https://github.com/pmndrs/zustand)
- [React 文档](https://react.dev)

### 参考项目

- [OpenCode](https://github.com/yourusername/opencode) - 原始参考项目
- [gemini-cli](https://github.com/yourusername/gemini-cli) - 单进程架构参考

### 主题参考

- [Kanagawa](https://github.com/rebelot/kanagawa.nvim)
- [Solarized](https://ethanschoonover.com/solarized/)
- [Dracula](https://draculatheme.com/)
- [Nord](https://www.nordtheme.com/)
- [Catppuccin](https://github.com/catppuccin/catppuccin)

---

## 💡 核心概念速查

### Ink 基础

```typescript
import { Box, Text, useInput } from 'ink'

<Box flexDirection="column">      // 类似 div
  <Text color="green">Hello</Text>  // 类似 span
</Box>

useInput((input, key) => {         // 键盘监听
  if (key.return) { /* Enter */ }
})
```

### Zustand Store

```typescript
import { create } from 'zustand'

const useStore = create((set) => ({
  count: 0,
  increment: () => set((state) => ({ count: state.count + 1 }))
}))

// 使用
const count = useStore((state) => state.count)
```

### Event Bus

```typescript
// 发布
Bus.publish(MessageEvent.PartUpdated, { delta: 'Hello' })

// 订阅
Bus.subscribe(MessageEvent.PartUpdated, (event) => {
  console.log(event.delta)
})
```

### 主题

```typescript
const { theme } = useTheme()

<Text color={theme.primary}>Text</Text>
<Box borderColor={theme.border}>Content</Box>
```

---

## 🤝 贡献指南

### 文档改进

如果您发现文档中的错误或需要补充：
1. Fork 项目
2. 创建分支
3. 提交 PR

### 代码实现

开始实现时，建议：
1. 严格遵循文档中的架构设计
2. 保持代码风格一致
3. 添加必要的注释
4. 编写单元测试

---

## 📝 更新日志

### v1.0 (2025-12-23)

- ✅ 完成 4 个核心开发文档
- ✅ 完成最终组件清单
- ✅ 完成 README 导航文档

### 下一步

- ⏳ 开始项目搭建
- ⏳ 实现核心 UI 组件
- ⏳ 集成 Agent 层

---

## 📧 联系方式

- **项目地址**：`/Users/xjk/Desktop/ScriptCode/opencode/`
- **文档路径**：`mydocs/cli的页面及其组件开发/`
- **创建日期**：2025-12-23

---

**祝开发顺利！🚀**

如有疑问，请先查阅相关文档，或参考 OpenCode 原始项目实现。
