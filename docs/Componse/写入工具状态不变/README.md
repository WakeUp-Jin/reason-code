# 写入工具状态不变问题

## 问题描述

执行 WriteFile 等需要用户确认的工具后，工具状态图标保持黄色（pending），不会变成绿色（success），也不显示执行结果。

## 文档结构

| 文件 | 说明 |
|------|------|
| [01-问题分析.md](./01-问题分析.md) | 问题现象、根本原因、日志证据 |
| [02-解决方案.md](./02-解决方案.md) | 三种解决方案及推荐方案 |

## 快速总结

### 根本原因

Ink 的 `<Static>` 组件一旦渲染后就不会更新。工具消息在 `pending` 状态时就被添加到 `<Static>` 中，后续状态更新不会触发重新渲染。

### 推荐解决方案

1. 修改 `useCompletedMessages()` 过滤掉未完成的工具消息
2. 在动态区域显示正在执行的工具消息
3. 工具完成后，消息自动移动到 Static 区域

### 关键代码位置

- `packages/cli/src/context/store.tsx` - `useCompletedMessages()` hook
- `packages/cli/src/routes/session/index.tsx` - Session 组件
- `packages/cli/src/hooks/useExecutionMessages.ts` - 事件监听和状态更新

