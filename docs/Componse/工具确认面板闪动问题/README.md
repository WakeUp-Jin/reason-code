# 工具确认面板闪动问题

## 概述

本文档记录了 `PanelToolConfirm` 组件显示时终端闪动的问题分析和三阶段修复过程。

## 问题现象

当 AI 执行工具需要用户确认时，显示 `PanelToolConfirm` 组件会导致：
1. **定时闪动**：每隔 3-3.5 秒闪动一次
2. **瞬时闪动**：确认面板弹出瞬间闪动
3. **视觉干扰**：确认期间 Spinner 旋转、计时器跳动

## 文档目录

### 初期分析（已过时，仅供参考）

| 文档 | 说明 |
|-----|------|
| [01-问题分析与解决方案.md](./01-问题分析与解决方案.md) | 初期问题分析（方案已调整） |
| [02-方案一-状态内部化.md](./02-方案一-状态内部化.md) | 初期方案：状态内部化（已实施） |
| [03-方案二-Static组件隔离.md](./03-方案二-Static组件隔离.md) | 初期备选方案（未采用） |
| [04-ClaudeCode参考实现分析.md](./04-ClaudeCode参考实现分析.md) | Claude Code 实现参考 |

### 实施过程（推荐阅读）

| 文档 | 说明 |
|-----|------|
| [05-第一阶段-ExecutionContext分层.md](./05-第一阶段-ExecutionContext分层.md) | 解决定时闪动（每 3.5 秒） |
| [06-第二阶段-StatusIndicator定时器暂停.md](./06-第二阶段-StatusIndicator定时器暂停.md) | 暂停确认时的所有定时器 |
| [07-第三阶段-隐藏ExecutionStream显示工具标题.md](./07-第三阶段-隐藏ExecutionStream显示工具标题.md) | 彻底解决闪动问题 |
| [08-完整总结.md](./08-完整总结.md) | **完整总结**（推荐首先阅读） |

## 快速总结

### 问题根因

1. **Ink Static 特性**：父组件重渲染时会重新打印所有内容
2. **Context 粒度过粗**：高频更新的 `snapshot` 和低频更新的控制方法放在同一个 Context
3. **Core 层持续推送事件**：在 `waiting_confirm` 状态时仍推送 `state:change` 事件

### 三阶段修复

| 阶段 | 问题 | 解决方案 | 效果 |
|------|------|---------|------|
| **第一阶段** | 每 3.5 秒闪动 | Context 分层，Session 只订阅 isExecuting | ✅ 解决定时闪动 |
| **第二阶段** | 确认时有视觉变化 | 添加 isPendingConfirm，暂停定时器 | ✅ 定时器暂停 |
| **第三阶段** | 确认时仍闪动 | 隐藏 ExecutionStream，显示静态工具标题 | ✅ 彻底解决 |

### 最终效果

- ✅ 彻底解决闪动问题
- ✅ 性能提升 80-85%（渲染次数从 9-12 次降至 2 次）
- ✅ 用户体验改善（确认时完全静止）
- ✅ 架构更清晰（UI 层不依赖业务层实现细节）

## 关键收获

1. **问题定位的层次性**：从表象到本质的递进过程
2. **Debug 日志的价值**：可视化问题链路，发现隐藏问题
3. **Context 分层设计**：高频和低频数据应该分离
4. **useEffect 依赖项优化**：只依赖真正需要的字段
5. **setState 防抖**：比较新旧值，避免不必要的更新
6. **分层架构的价值**：UI 层应该控制自己的渲染行为

## 相关文件

| 文件 | 变更内容 |
|------|---------|
| `packages/cli/src/context/execution.tsx` | 三层 Context 分离 + isPendingConfirm + pendingToolInfo |
| `packages/cli/src/routes/session/index.tsx` | 条件渲染工具标题 vs ExecutionStream |
| `packages/cli/src/routes/session/inputArea.tsx` | 同步工具信息到 Context |
| `packages/cli/src/component/execution/StatusIndicator.tsx` | 暂停定时器 + Debug 日志 |

