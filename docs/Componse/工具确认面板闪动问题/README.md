# 工具确认面板闪动问题

## 概述

本文档记录了 `PanelToolConfirm` 组件显示时终端闪动的问题分析和解决方案。

## 问题现象

当 AI 执行工具需要用户确认时，显示 `PanelToolConfirm` 组件会导致终端在确认面板和 REASON logo 之间来回闪动。

## 文档目录

| 文档 | 说明 |
|-----|------|
| [01-问题分析与解决方案.md](./01-问题分析与解决方案.md) | 问题根因分析和方案概述 |
| [02-方案一-状态内部化.md](./02-方案一-状态内部化.md) | 推荐方案：将状态移到 InputArea 内部 |
| [03-方案二-Static组件隔离.md](./03-方案二-Static组件隔离.md) | 备选方案：使用 memo 隔离 Static 组件 |

## 快速总结

### 问题根因

`PanelToolConfirm` 的状态来自 `useAgent()` hook，当状态变化时会触发 `ExecutionContext` 更新，导致整个 `Session` 组件重新渲染，进而导致 Ink 的 `Static` 组件重新打印 REASON logo。

### 为什么 `/model` 不闪动

`/model` 命令的状态 `commandPanelState` 是 `InputArea` 组件内部的 `useState`，状态变化只会影响 `InputArea`，不会影响 `Session`。

### 推荐方案

**方案一：状态内部化**

将 `pendingConfirm` 状态从 `useAgent()` 移到 `InputArea` 内部管理，和 `/model` 的模式保持一致。

## 相关文件

- `packages/cli/src/routes/session/inputArea.tsx`
- `packages/cli/src/routes/session/index.tsx`
- `packages/cli/src/hooks/useAgent.ts`
- `packages/cli/src/context/execution.tsx`
- `packages/cli/src/component/panel/panel-tool-confirm.tsx`

