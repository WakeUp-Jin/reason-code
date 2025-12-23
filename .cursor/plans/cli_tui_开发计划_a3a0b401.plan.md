---
name: CLI TUI 开发计划
overview: 基于你整理的 CLI 开发文档，为 reason-cli 项目构建一个完整的终端 TUI 界面系统，采用 Bun + Ink + React + Zustand 技术栈，实现类似 OpenCode 的优雅终端 AI 对话体验。
todos:
  - id: phase-a-1
    content: "中计划1: 项目依赖和目录结构搭建"
    status: completed
  - id: phase-a-1-1
    content: "  1.1 更新 package.json 添加 Ink/React/Zustand 依赖"
    status: completed
    dependencies:
      - phase-a-1
  - id: phase-a-1-2
    content: "  1.2 创建目录结构（routes/ui/component/context/themes/util）"
    status: completed
    dependencies:
      - phase-a-1-1
  - id: phase-a-1-3
    content: "  1.3 创建 app.tsx 入口和 render 启动逻辑"
    status: completed
    dependencies:
      - phase-a-1-2
  - id: phase-a-2
    content: "中计划2: Context Provider 系统（7个Provider）"
    status: completed
    dependencies:
      - phase-a-1-3
  - id: phase-a-2-1
    content: "  2.1 ThemeProvider - 主题状态和切换"
    status: completed
    dependencies:
      - phase-a-2
  - id: phase-a-2-2
    content: "  2.2 StoreProvider - Zustand 全局状态"
    status: completed
    dependencies:
      - phase-a-2
  - id: phase-a-2-3
    content: "  2.3 DialogProvider - 对话框堆栈管理"
    status: completed
    dependencies:
      - phase-a-2
  - id: phase-a-2-4
    content: "  2.4 ToastProvider - 通知队列管理"
    status: completed
    dependencies:
      - phase-a-2
  - id: phase-a-2-5
    content: "  2.5 RouteProvider - 路由状态管理"
    status: completed
    dependencies:
      - phase-a-2
  - id: phase-a-3
    content: "中计划3: 路由系统和基础布局（Home/Session）"
    status: completed
    dependencies:
      - phase-a-2-5
  - id: phase-a-3-1
    content: "  3.1 routes/home.tsx - 主页（Logo + 输入框占位）"
    status: completed
    dependencies:
      - phase-a-3
  - id: phase-a-3-2
    content: "  3.2 routes/session/index.tsx - 会话主界面框架"
    status: completed
    dependencies:
      - phase-a-3
  - id: phase-a-3-3
    content: "  3.3 routes/session/header.tsx - 顶部标题栏"
    status: completed
    dependencies:
      - phase-a-3-2
  - id: phase-a-3-4
    content: "  3.4 routes/session/footer.tsx - 底部状态栏"
    status: completed
    dependencies:
      - phase-a-3-2
  - id: phase-b-4
    content: "中计划4: 主题系统（6个主题 + Dark/Light）"
    status: completed
    dependencies:
      - phase-a-2-1
  - id: phase-b-4-1
    content: "  4.1 定义主题 JSON 格式（defs + theme 结构）"
    status: completed
    dependencies:
      - phase-b-4
  - id: phase-b-4-2
    content: "  4.2 创建 kanagawa.json 默认主题（46个语义色）"
    status: completed
    dependencies:
      - phase-b-4-1
  - id: phase-b-4-3
    content: "  4.3 创建其他5个主题 JSON 文件"
    status: completed
    dependencies:
      - phase-b-4-2
  - id: phase-b-4-4
    content: "  4.4 实现主题加载器和颜色解析器"
    status: completed
    dependencies:
      - phase-b-4-2
  - id: phase-b-4-5
    content: "  4.5 实现 OSC 11 终端背景色检测"
    status: completed
    dependencies:
      - phase-b-4-4
  - id: phase-b-5
    content: "中计划5: 基础UI组件（DialogSelect核心）"
    status: completed
    dependencies:
      - phase-b-4-4
  - id: phase-b-5-1
    content: "  5.1 ui/dialog.tsx - 对话框基础容器"
    status: completed
    dependencies:
      - phase-b-5
  - id: phase-b-5-2
    content: "  5.2 ui/dialog-select.tsx - 模糊搜索选择（核心）"
    status: completed
    dependencies:
      - phase-b-5-1
  - id: phase-b-5-3
    content: "  5.3 ui/dialog-confirm.tsx - 确认对话框"
    status: completed
    dependencies:
      - phase-b-5-1
  - id: phase-b-5-4
    content: "  5.4 ui/dialog-prompt.tsx - 输入对话框"
    status: completed
    dependencies:
      - phase-b-5-1
  - id: phase-b-5-5
    content: "  5.5 ui/toast.tsx - 通知组件"
    status: completed
    dependencies:
      - phase-b-5
  - id: phase-b-6
    content: "中计划6: Prompt输入系统和历史记录"
    status: completed
    dependencies:
      - phase-a-3-1
  - id: phase-b-6-1
    content: "  6.1 component/prompt/index.tsx - 主输入框组件"
    status: completed
    dependencies:
      - phase-b-6
  - id: phase-b-6-2
    content: "  6.2 component/prompt/history.tsx - 历史记录 Hook"
    status: completed
    dependencies:
      - phase-b-6-1
  - id: phase-b-6-3
    content: "  6.3 实现上下键翻阅历史功能"
    status: completed
    dependencies:
      - phase-b-6-2
  - id: phase-c-7
    content: "中计划7: Session管理和持久化"
    status: completed
    dependencies:
      - phase-b-5-2
      - phase-b-6-3
  - id: phase-c-7-1
    content: "  7.1 定义 Session/Message 数据类型"
    status: completed
    dependencies:
      - phase-c-7
  - id: phase-c-7-2
    content: "  7.2 实现 Storage 层（JSON 文件读写）"
    status: completed
    dependencies:
      - phase-c-7-1
  - id: phase-c-7-3
    content: "  7.3 Zustand Store 添加 Session 状态和 Actions"
    status: completed
    dependencies:
      - phase-c-7-2
  - id: phase-c-7-4
    content: "  7.4 component/dialog-session-list.tsx - 会话列表"
    status: completed
    dependencies:
      - phase-c-7-3
  - id: phase-c-7-5
    content: "  7.5 component/dialog-session-rename.tsx - 重命名"
    status: completed
    dependencies:
      - phase-c-7-4
  - id: phase-c-8
    content: "中计划8: 消息显示和流式输出"
    status: completed
    dependencies:
      - phase-c-7-3
  - id: phase-c-8-1
    content: "  8.1 component/message-list.tsx - 消息列表组件"
    status: completed
    dependencies:
      - phase-c-8
  - id: phase-c-8-2
    content: "  8.2 component/message-item.tsx - 单条消息渲染"
    status: completed
    dependencies:
      - phase-c-8-1
  - id: phase-c-8-3
    content: "  8.3 实现流式输出状态更新"
    status: completed
    dependencies:
      - phase-c-8-2
  - id: phase-c-8-4
    content: "  8.4 component/dialog-message.tsx - 消息详情"
    status: completed
    dependencies:
      - phase-c-8-2
  - id: phase-c-9
    content: "中计划9: 命令面板和业务对话框"
    status: completed
    dependencies:
      - phase-b-5-2
  - id: phase-c-9-1
    content: "  9.1 component/dialog-command.tsx - 命令面板"
    status: completed
    dependencies:
      - phase-c-9
  - id: phase-c-9-2
    content: "  9.2 定义命令列表和快捷键映射"
    status: completed
    dependencies:
      - phase-c-9-1
  - id: phase-c-9-3
    content: "  9.3 component/dialog-theme.tsx - 主题选择"
    status: completed
    dependencies:
      - phase-c-9-1
  - id: phase-c-9-4
    content: "  9.4 component/dialog-status.tsx - 系统状态"
    status: completed
    dependencies:
      - phase-c-9-1
  - id: phase-c-9-5
    content: "  9.5 component/dialog-model.tsx - 模型选择（Mock）"
    status: completed
    dependencies:
      - phase-c-9-1
  - id: phase-d-10
    content: "中计划10: Mock Agent 和事件总线（模拟数据）"
    status: completed
    dependencies:
      - phase-c-8-3
  - id: phase-d-10-1
    content: "  10.1 实现简单的事件总线 Bus"
    status: completed
    dependencies:
      - phase-d-10
  - id: phase-d-10-2
    content: "  10.2 创建 MockAgent 返回固定响应"
    status: completed
    dependencies:
      - phase-d-10-1
  - id: phase-d-10-3
    content: "  10.3 模拟流式输出效果（定时器分段返回）"
    status: completed
    dependencies:
      - phase-d-10-2
  - id: phase-d-11
    content: "中计划11: 代码高亮和Diff显示"
    status: completed
    dependencies:
      - phase-c-8-2
  - id: phase-d-11-1
    content: "  11.1 component/code-block.tsx - 代码块渲染"
    status: completed
    dependencies:
      - phase-d-11
  - id: phase-d-11-2
    content: "  11.2 集成 highlight.js 语法高亮"
    status: completed
    dependencies:
      - phase-d-11-1
  - id: phase-d-11-3
    content: "  11.3 component/diff-view.tsx - Diff 显示"
    status: completed
    dependencies:
      - phase-d-11-1
  - id: phase-d-12
    content: "中计划12: 系统工具集成（剪贴板/编辑器）"
    status: completed
    dependencies:
      - phase-a-1-2
  - id: phase-d-12-1
    content: "  12.1 util/clipboard.ts - OSC 52 剪贴板"
    status: completed
    dependencies:
      - phase-d-12
  - id: phase-d-12-2
    content: "  12.2 util/editor.ts - 外部编辑器集成"
    status: completed
    dependencies:
      - phase-d-12
  - id: phase-d-12-3
    content: "  12.3 util/terminal.ts - 终端工具函数"
    status: completed
    dependencies:
      - phase-d-12
---

# CLI TUI 界面开发总计划（修订版）

基于你整理的 5 份核心文档，结合 reason-cli 项目现有的 Monorepo 架构（cli + core 两个包），制定以下开发计划。---

## 当前项目状态分析

- **项目结构**: Monorepo（packages/cli + packages/core）
- **现有 CLI**: 使用 Commander.js 的简单命令行工具
- **Core 包**: 已有 Agent、LLM、Tools 基础实现
- **目标**: 将 CLI 升级为基于 Ink 的 TUI 交互式界面

---

## 大计划概览（4 个阶段）

```javascript
阶段 A: 基础架构搭建（3-4 天）
    └── 中计划 1: 项目依赖和目录结构（3 个小任务）
    └── 中计划 2: Context Provider 系统（5 个小任务）
    └── 中计划 3: 路由系统和基础布局（4 个小任务）

阶段 B: 核心 UI 组件（4-5 天）
    └── 中计划 4: 主题系统（5 个小任务）
    └── 中计划 5: 基础 UI 组件（5 个小任务）
    └── 中计划 6: Prompt 输入系统（3 个小任务）

阶段 C: 业务功能实现（5-6 天）
    └── 中计划 7: Session 管理（5 个小任务）
    └── 中计划 8: 消息显示和流式输出（4 个小任务）
    └── 中计划 9: 命令面板和对话框系统（5 个小任务）

阶段 D: 高级功能和集成（3-4 天）
    └── 中计划 10: Mock Agent 和事件总线（3 个小任务）
    └── 中计划 11: 代码高亮和 Diff 显示（3 个小任务）
    └── 中计划 12: 系统工具集成（3 个小任务）
```

---

## 阶段 A: 基础架构搭建

### 中计划 1: 项目依赖和目录结构

**目标**: 在 [packages/cli](packages/cli) 中搭建 TUI 基础结构**小任务**:

- **1.1** 更新 `package.json`，添加 Ink、React、Zustand、fuzzysort 等依赖
- **1.2** 创建目录结构（直接在 src/ 下，不使用 tui 子目录）
- **1.3** 创建 `app.tsx` 入口组件和 Ink render 启动逻辑

**目录结构**（调整后）:

```javascript
packages/cli/src/
├── index.ts              # CLI 入口（保留 Commander.js）
├── app.tsx               # TUI 根组件
├── routes/               # 路由页面
│   ├── home.tsx
│   └── session/
│       ├── index.tsx
│       ├── header.tsx
│       └── footer.tsx
├── ui/                   # 基础 UI 组件
│   ├── dialog.tsx
│   ├── dialog-select.tsx
│   └── toast.tsx
├── component/            # 业务组件
│   ├── prompt/
│   ├── dialog-command.tsx
│   └── ...
├── context/              # Context Providers
│   ├── theme.tsx
│   ├── store.tsx
│   └── ...
├── themes/               # 主题 JSON 文件
│   ├── kanagawa.json
│   └── ...
└── util/                 # 工具函数
    ├── clipboard.ts
    └── ...
```

---

### 中计划 2: Context Provider 系统

**目标**: 实现 5 个核心 Context Provider（简化版）**小任务**:

- **2.1** `context/theme.tsx` - ThemeProvider（主题状态和切换）
- **2.2** `context/store.tsx` - StoreProvider（Zustand 全局状态）
- **2.3** `context/dialog.tsx` - DialogProvider（对话框堆栈管理）
- **2.4** `context/toast.tsx` - ToastProvider（通知队列管理）
- **2.5** `context/route.tsx` - RouteProvider（路由状态管理）

**Provider 嵌套顺序**:

```tsx
<ThemeProvider>
  <StoreProvider>
    <DialogProvider>
      <ToastProvider>
        <RouteProvider>
          <App />
        </RouteProvider>
      </ToastProvider>
    </DialogProvider>
  </StoreProvider>
</ThemeProvider>
```

---

### 中计划 3: 路由系统和基础布局

**目标**: 实现 Home 和 Session 两个主页面**小任务**:

- **3.1** `routes/home.tsx` - 主页（Logo + 输入框占位）
- **3.2** `routes/session/index.tsx` - 会话主界面框架
- **3.3** `routes/session/header.tsx` - 顶部标题栏
- **3.4** `routes/session/footer.tsx` - 底部状态栏（快捷键提示）

---

## 阶段 B: 核心 UI 组件

### 中计划 4: 主题系统

**目标**: 实现 6 个精选主题 + Dark/Light 模式**小任务**:

- **4.1** 定义主题 JSON 格式（defs + theme 结构）
- **4.2** 创建 `kanagawa.json` 默认主题（46 个语义化颜色）
- **4.3** 创建其他 5 个主题 JSON 文件
- **4.4** 实现主题加载器和颜色解析器
- **4.5** 实现 OSC 11 终端背景色检测

**主题列表**: Kanagawa(默认)、GitHub、Solarized、Dracula、Nord、Catppuccin---

### 中计划 5: 基础 UI 组件

**目标**: 实现核心 UI 组件库**小任务**:

- **5.1** `ui/dialog.tsx` - 对话框基础容器
- **5.2** `ui/dialog-select.tsx` - 模糊搜索选择（最核心组件）
- fuzzysort 模糊搜索
- 键盘导航（上下键）
- 分类显示
- 当前项高亮
- **5.3** `ui/dialog-confirm.tsx` - 确认对话框
- **5.4** `ui/dialog-prompt.tsx` - 输入对话框
- **5.5** `ui/toast.tsx` - 通知组件

---

### 中计划 6: Prompt 输入系统

**目标**: 实现用户输入框和历史记录**小任务**:

- **6.1** `component/prompt/index.tsx` - 主输入框组件
- **6.2** `component/prompt/history.tsx` - 历史记录 Hook
- **6.3** 实现上下键翻阅历史功能

**功能**:

- 多行文本输入
- Enter 提交
- 上下键翻阅历史
- ESC 取消

---

## 阶段 C: 业务功能实现

### 中计划 7: Session 管理

**目标**: 实现完整的会话管理功能**小任务**:

- **7.1** 定义 Session/Message 数据类型
- **7.2** 实现 Storage 层（JSON 文件读写）
- **7.3** Zustand Store 添加 Session 状态和 Actions
- **7.4** `component/dialog-session-list.tsx` - 会话列表
- **7.5** `component/dialog-session-rename.tsx` - 会话重命名

**持久化路径**: `~/.reason-cli/sessions/`---

### 中计划 8: 消息显示和流式输出

**目标**: 实现消息渲染和实时流式显示**小任务**:

- **8.1** `component/message-list.tsx` - 消息列表组件
- **8.2** `component/message-item.tsx` - 单条消息渲染
- **8.3** 实现流式输出状态更新
- **8.4** `component/dialog-message.tsx` - 消息详情对话框

---

### 中计划 9: 命令面板和对话框系统

**目标**: 实现命令面板和业务对话框**小任务**:

- **9.1** `component/dialog-command.tsx` - 命令面板
- **9.2** 定义命令列表和快捷键映射（Ctrl+P 触发）
- **9.3** `component/dialog-theme.tsx` - 主题选择
- **9.4** `component/dialog-status.tsx` - 系统状态
- **9.5** `component/dialog-model.tsx` - 模型选择（Mock 数据）

---

## 阶段 D: 高级功能和集成

### 中计划 10: Mock Agent 和事件总线（模拟数据）

**目标**: 创建模拟 Agent，返回固定数据，验证 UI 流程**小任务**:

- **10.1** 实现简单的事件总线 Bus（发布/订阅模式）
- **10.2** 创建 MockAgent 返回固定响应
  ````typescript
        // 固定返回示例
        const mockResponse = "这是一个模拟的 AI 响应。\n\n```typescript\nconsole.log('Hello World')\n```"
  ````




- **10.3** 模拟流式输出效果（定时器分段返回文本）

**说明**: 这里只做 UI 层的模拟，真正的 Agent 集成后续手动开发。---

### 中计划 11: 代码高亮和 Diff 显示

**目标**: 实现代码块和差异对比显示**小任务**:

- **11.1** `component/code-block.tsx` - 代码块渲染
- **11.2** 集成 highlight.js 语法高亮
- **11.3** `component/diff-view.tsx` - Diff 显示

---

### 中计划 12: 系统工具集成

**目标**: 实现系统级功能集成**小任务**:

- **12.1** `util/clipboard.ts` - OSC 52 剪贴板
- **12.2** `util/editor.ts` - 外部编辑器集成（$EDITOR）
- **12.3** `util/terminal.ts` - 终端工具函数

---

## 技术栈总结

**新增依赖**:

```json
{
  "dependencies": {
    "ink": "^4.4.1",
    "react": "^18.2.0",
    "zustand": "^4.4.7",
    "fuzzysort": "^3.1.0",
    "diff": "^5.1.0",
    "highlight.js": "^11.9.0"
  }
}
```

---

## 开发时间估算

| 阶段 | 中计划 | 小任务数 | 预计时间 ||------|--------|----------|----------|| A | 1-3 | 12 | 3-4 天 || B | 4-6 | 13 | 4-5 天 || C | 7-9 | 14 | 5-6 天 || D | 10-12 | 9 | 2-3 天 || **总计** | 12 | **48** | **14-18 天** |---

## 建议开发顺序

1. **先完成中计划 1-3**: 搭建基础框架，确保 Ink 能正常运行
2. **重点攻克中计划 5**: DialogSelect 是最核心组件
3. **中计划 4 和 6 可并行**: 主题系统和输入框相对独立
4. **中计划 7-9 按顺序**: Session -> 消息 -> 命令面板
5. **最后完成 10-12**: 高级功能和集成

---