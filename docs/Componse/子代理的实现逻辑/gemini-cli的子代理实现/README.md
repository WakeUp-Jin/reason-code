# Gemini CLI 子代理实现逻辑文档

## 文档概览

本系列文档深入解析 Gemini CLI 的子代理（Subagent）系统，从架构设计到实战应用，帮助你全面理解和扩展这个强大的功能。

## 文档列表

### [01-架构总览](./01-架构总览.md)
**适合人群**：所有开发者

**内容**：
- 子代理系统的整体架构
- 核心组件介绍
- 数据流和执行流程
- 关键特性和优势

**阅读时间**：15 分钟

---

### [02-AgentDefinition详解](./02-AgentDefinition详解.md)
**适合人群**：想要创建子代理的开发者

**内容**：
- `AgentDefinition` 接口的完整说明
- 每个配置项的详细解释
- 输入输出设计最佳实践
- 常见错误和解决方案

**阅读时间**：30 分钟

---

### [03-执行流程详解](./03-执行流程详解.md)
**适合人群**：需要深入理解执行机制的开发者

**内容**：
- 从调用到返回的完整流程
- 执行循环的详细分析
- 工具调用处理机制
- 错误处理和性能优化

**阅读时间**：40 分钟

---

### [04-工具包装机制](./04-工具包装机制.md)
**适合人群**：想要理解工具系统集成的开发者

**内容**：
- `SubagentToolWrapper` 的实现原理
- 动态 Schema 生成
- 工具注册流程
- 与标准工具的对比

**阅读时间**：25 分钟

---

### [05-实战案例分析](./05-实战案例分析.md)
**适合人群**：想要学习实际应用的开发者

**内容**：
- `CodebaseInvestigatorAgent` 完整解析
- 设计决策和权衡
- 执行示例和输出分析
- 优化建议

**阅读时间**：35 分钟

---

### [06-扩展指南](./06-扩展指南.md)
**适合人群**：准备创建自定义子代理的开发者

**内容**：
- 从简单到复杂的实战案例
- 文档生成器、测试生成器、代码审查器
- 高级技巧和调试方法
- 测试策略和部署清单

**阅读时间**：45 分钟

---

## 学习路径

### 快速入门（1 小时）
1. 阅读 [01-架构总览](./01-架构总览.md)
2. 浏览 [05-实战案例分析](./05-实战案例分析.md)
3. 尝试运行 `CodebaseInvestigatorAgent`

### 深入理解（3 小时）
1. 阅读 [02-AgentDefinition详解](./02-AgentDefinition详解.md)
2. 阅读 [03-执行流程详解](./03-执行流程详解.md)
3. 阅读 [04-工具包装机制](./04-工具包装机制.md)
4. 调试和分析现有子代理

### 实战开发（5+ 小时）
1. 完成深入理解路径
2. 阅读 [06-扩展指南](./06-扩展指南.md)
3. 创建自己的子代理
4. 编写测试和文档
5. 优化和部署

## 核心概念速查

### AgentDefinition
子代理的声明式配置，包含：
- 基本信息（name, description）
- 提示配置（systemPrompt, query）
- 模型配置（model, temp, top_p）
- 运行配置（max_time_minutes, max_turns）
- 工具配置（tools）
- 输入输出配置（inputConfig, outputConfig）

### SubagentToolWrapper
将 `AgentDefinition` 包装成标准工具：
- 动态生成参数 Schema
- 实现 `DeclarativeTool` 接口
- 创建 `SubagentInvocation` 实例

### AgentExecutor
执行引擎，负责：
- 管理对话循环
- 调用 Gemini 模型
- 执行工具调用
- 处理终止条件
- 验证输出

### 执行循环
```
while (true) {
  1. 检查终止条件
  2. 调用模型
  3. 处理工具调用
  4. 检查 complete_task
  5. 构建下一条消息
}
```

### complete_task
特殊的终止工具：
- 子代理必须调用它来正常结束
- 接受输出参数
- 验证输出 Schema
- 触发任务完成

## 常见问题

### Q: 子代理和标准工具有什么区别？
A: 标准工具直接执行功能，子代理运行一个完整的 AI 代理循环，可以使用多个工具、进行推理和决策。

### Q: 如何选择模型和温度？
A: 
- 精确任务（代码分析）：`gemini-2.5-pro` + 低温度（0.1-0.3）
- 创意任务（文档生成）：`gemini-2.5-pro` + 中温度（0.5-0.7）
- 简单任务：`gemini-2.5-flash` + 中温度（0.5-0.7）

### Q: 如何调试子代理？
A: 
1. 启用详细日志（`thinkingBudget: -1`）
2. 添加活动回调监听事件
3. 检查 Scratchpad 内容
4. 使用单元测试和集成测试

### Q: 子代理可以调用其他子代理吗？
A: 理论上可以，但当前实现中子代理的工具集是隔离的，需要显式授权。不建议嵌套太深。

### Q: 如何处理超时？
A: 
1. 设置合理的 `max_time_minutes`
2. 添加 `max_turns` 作为额外保护
3. 在提示中要求子代理高效工作
4. 选择合适的模型（flash 更快）

### Q: 输出验证失败怎么办？
A: 子代理会收到错误信息并可以重试。确保：
1. Schema 定义清晰
2. 提示中说明输出格式
3. 提供输出示例（通过 `initialMessages`）

## 相关资源

### 源码位置
- 核心类型：`packages/core/src/agents/types.ts`
- 执行器：`packages/core/src/agents/executor.ts`
- 工具包装：`packages/core/src/agents/subagent-tool-wrapper.ts`
- 注册表：`packages/core/src/agents/registry.ts`
- 示例代理：`packages/core/src/agents/codebase-investigator.ts`

### 测试文件
- 执行器测试：`packages/core/src/agents/executor.test.ts`
- 工具包装测试：`packages/core/src/agents/subagent-tool-wrapper.test.ts`

### 相关文档
- Gemini CLI 主文档：`../../README.md`
- 工具系统文档：`packages/core/src/tools/README.md`
- MCP 集成文档：`docs/tools/mcp-server.md`

## 贡献指南

如果你创建了有用的子代理，欢迎贡献到 Gemini CLI：

1. Fork 仓库
2. 创建子代理定义
3. 添加到 `AgentRegistry`
4. 编写测试
5. 编写文档
6. 提交 Pull Request

## 反馈和支持

- **问题报告**：[GitHub Issues](https://github.com/google-gemini/gemini-cli/issues)
- **功能请求**：[GitHub Discussions](https://github.com/google-gemini/gemini-cli/discussions)
- **社区支持**：[Discord](https://discord.gg/gemini-cli)

## 更新日志

- **2025-01-14**：创建初始文档系列
- 后续更新将在此记录

---

**开始学习**：建议从 [01-架构总览](./01-架构总览.md) 开始！
