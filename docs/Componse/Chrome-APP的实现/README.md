# Chrome App Mode 文档目录

本文档系统详细介绍了如何使用 Chrome App Mode 为 CLI 工具添加桌面端辅助显示功能。

---

## 📚 文档列表

### [01-方案选型.md](./01-方案选型.md)
**为什么选择 Chrome App Mode？**

- 技术方案对比（Chrome App Mode vs PWA vs Tauri vs Electron）
- 选型理由和适用场景
- 开发成本和时间估算
- 技术栈介绍

**适合读者：** 技术决策者、架构师

---

### [02-核心原理.md](./02-核心原理.md)
**Chrome App Mode 是如何工作的？**

- Chrome App Mode 的基本概念
- 启动命令和参数说明
- 整体架构和数据流转
- 通信机制（HTTP 轮询 vs WebSocket）
- 核心代码结构
- 优势和局限性分析

**适合读者：** 开发者、技术爱好者

---

### [03-实现指南.md](./03-实现指南.md)
**如何实现 Chrome App Mode？**

- 项目结构设计
- 核心模块实现（Desktop Manager、Express 服务器、前端应用）
- CLI 命令集成
- 组件开发（TODO、图片、Diff、Markdown）
- 进阶功能（多窗口、WebSocket、自动启动）
- 最佳实践和调试技巧

**适合读者：** 开发者

---

### [04-使用示例.md](./04-使用示例.md)
**如何使用 Chrome App Mode？**

- 基础使用（启动、显示、停止）
- 实际场景示例（任务管理、代码审查、设计预览）
- 高级用法（自动启动、窗口控制、多窗口）
- 配置选项和快捷键
- 故障排查和性能优化

**适合读者：** 用户、开发者

---

### [05-常见问题.md](./05-常见问题.md)
**遇到问题怎么办？**

- 技术问题（轮询 vs WebSocket、浏览器兼容、端口冲突）
- 使用问题（窗口管理、样式自定义、内容导出）
- 性能问题（内存优化、启动速度）
- 安全问题（本地服务器安全、XSS 防护）
- 扩展问题（添加组件、集成第三方库、迁移到 Tauri）

**适合读者：** 所有人

---

### [06-PWA增强方案.md](./06-PWA增强方案.md) ⭐ 推荐
**为什么要结合 PWA？**

- 系统通知的实际价值（任务提醒、团队协作、长时间任务）
- PWA 带来的其他好处（双模式使用、离线缓存、自动更新）
- 最小实现方案（1 小时添加 PWA 支持）
- 系统通知完整实现（请求权限、发送通知、集成后端）
- 智能模式检测（自动适配 PWA/Chrome App/浏览器）
- 开发成本对比和推荐实施步骤

**适合读者：** 所有人（强烈推荐阅读）

---

## 🚀 快速开始

### 1. 了解方案
阅读 [01-方案选型.md](./01-方案选型.md) 了解为什么选择 Chrome App Mode

### 2. 理解原理
阅读 [02-核心原理.md](./02-核心原理.md) 理解技术实现

### 3. 动手实现
按照 [03-实现指南.md](./03-实现指南.md) 开始开发

### 4. 学习使用
参考 [04-使用示例.md](./04-使用示例.md) 了解各种用法

### 5. 解决问题
遇到问题查看 [05-常见问题.md](./05-常见问题.md)

---

## 💡 核心概念

### Chrome App Mode 是什么？

Chrome App Mode 是 Chrome 浏览器的一个特殊启动模式，通过 `--app=URL` 参数启动时，会隐藏浏览器的所有 UI 元素（地址栏、标签栏、书签栏等），让网页看起来像一个独立的桌面应用。

### 为什么适合 CLI 工具？

- ✅ **CLI 主导** - 桌面端只是辅助显示，不改变 CLI 的核心交互方式
- ✅ **按需显示** - 只在需要时打开，不影响终端使用
- ✅ **开发简单** - 就是写网页，2 小时完成开发
- ✅ **零打包成本** - 无需编译、无需签名、无需发布

### 适用场景

**✅ 适合：**
- CLI 工具的辅助显示
- 开发者工具
- 快速原型验证
- 内部工具

**❌ 不适合：**
- 独立桌面应用
- 需要系统深度集成
- 需要分发给普通用户

---

## 📊 技术栈

```
后端：Express (Node.js)
前端：HTML/CSS/JS（可选 React/Vue）
启动：child_process.exec
通信：HTTP 轮询（可选 WebSocket）
```

**代码量：** ~300 行
**开发时间：** ~2 小时

---

## 🎯 核心优势

1. **开发成本极低**
   - 会写网页就能开发
   - 无需学习新框架
   - 2 小时完成 MVP

2. **调试体验优秀**
   - Chrome DevTools
   - 热更新
   - 网络监控

3. **维护成本低**
   - 改代码即更新
   - 无需重新打包
   - 跨平台零成本

4. **未来可扩展**
   - 前端代码 100% 可复用
   - 可以迁移到 Tauri
   - 迁移成本低

---

## 🔗 相关资源

### 官方文档
- [Chrome Command Line Switches](https://peter.sh/experiments/chromium-command-line-switches/)
- [Express.js Documentation](https://expressjs.com/)

### 推荐库
- **图表**: [Chart.js](https://www.chartjs.org/), [ECharts](https://echarts.apache.org/)
- **Markdown**: [marked](https://marked.js.org/), [markdown-it](https://github.com/markdown-it/markdown-it)
- **代码高亮**: [Prism.js](https://prismjs.com/), [highlight.js](https://highlightjs.org/)
- **Diff**: [diff2html](https://diff2html.xyz/), [monaco-diff-editor](https://microsoft.github.io/monaco-editor/)

### 示例项目
- [chrome-app-demo](../../chrome-app-demo/) - 最小可运行示例

---

## 📝 贡献指南

欢迎贡献文档改进建议！

**改进方向：**
- 补充更多使用场景
- 添加更多代码示例
- 完善故障排查指南
- 翻译成其他语言

---

## 📄 许可证

本文档采用 MIT 许可证。

---

## 📮 联系方式

如有问题或建议，欢迎：
- 提交 Issue
- 发起 Pull Request
- 发送邮件

---

**最后更新：** 2026-01-13
