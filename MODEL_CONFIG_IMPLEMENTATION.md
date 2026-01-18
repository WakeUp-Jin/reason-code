# Agent 模型配置传递 - 最终实现总结

## 🎯 实现目标

解决主代理的模型配置传递问题：
- CLI 传递的 `provider` 和 `model` 能正确传给主代理
- 子代理从预设文件读取模型配置

## ✅ 实现内容

### 1. AgentManager.createAgent 支持配置覆盖

**文件**: `packages/core/src/core/agent/AgentManager.ts`

```typescript
createAgent(name: string, overrides?: Partial<AgentConfig>): Agent {
  const config = this.configs.get(name);
  
  // 合并配置：预设（副）+ 覆盖（主）
  const finalConfig: AgentConfig = {
    ...config,      // 从预设文件读取
    ...overrides,   // 传递进来的覆盖
  };
  
  return new Agent(finalConfig, this.sharedRuntime);
}
```

**优先级**: `overrides` > `preset`

---

### 2. CLI 传递模型配置

**文件**: `packages/cli/src/hooks/useAgent.ts`

```typescript
// 解析用户配置的模型
const { provider, model } = parseModelId(config.model.current);

// 配置 AgentManager
agentManager.configure({
  apiKey: providerConfig.apiKey,
  baseURL: providerConfig.baseUrl,
});

// 创建 Agent，传递模型配置
const agent = agentManager.createAgent('build', {
  model: { provider, model }, // 覆盖预设的模型
});
```

---

### 3. 子代理从预设文件读取模型

**文件**: `packages/core/src/core/tool/Task/executors.ts`

```typescript
// 直接使用预设配置
const subAgent = agentManager.createAgent('explore');
// ✅ 模型从 explore 预设文件读取
```

**预设文件**: `packages/core/src/core/agent/config/presets/explore.ts`

```typescript
export const exploreAgent: AgentConfig = {
  name: 'explore',
  mode: 'subagent',
  description: 'Fast agent for exploring codebases',
  model: { provider: 'deepseek', model: 'deepseek-chat' }, // 可以在这里配置
  tools: { write_file: false },
};
```

---

## 📊 配置流转图

### 主代理

```
CLI 用户配置
  ↓
parseModelId() → { provider, model }
  ↓
agentManager.createAgent('build', { model })
  ↓
Agent { config.model = { provider, model } }
```

### 子代理

```
Task Tool
  ↓
agentManager.createAgent('explore')
  ↓
读取 explore 预设文件
  ↓
Agent { config.model = preset.model || undefined }
  ↓
Agent.init() 使用 config.model 或默认值
```

---

## 🎯 使用示例

### 主代理

```typescript
// CLI 配置：用户选择 GPT-4
const { provider, model } = parseModelId('openai/gpt-4');

// 创建主代理
const agent = agentManager.createAgent('build', {
  model: { provider: 'openai', model: 'gpt-4' },
});

// ✅ 主代理使用 GPT-4
```

### 子代理

```typescript
// explore.ts 预设文件
export const exploreAgent: AgentConfig = {
  name: 'explore',
  mode: 'subagent',
  model: { provider: 'deepseek', model: 'deepseek-chat' },
};

// Task 工具调用
const subAgent = agentManager.createAgent('explore');
// ✅ 子代理使用 DeepSeek（从预设读取）
```

---

## ✅ 验证结果

- ✅ TypeScript 编译通过
- ✅ 主代理能接收 CLI 传递的模型配置
- ✅ 子代理从预设文件读取模型配置
- ✅ 配置优先级正确：传递 > 预设 > 默认值

---

## 🚀 优势

1. **灵活覆盖**: CLI 可以覆盖任何预设配置
2. **预设控制**: 子代理的模型在预设文件中配置
3. **简洁 API**: `createAgent(name, { model })` 一行搞定
4. **符合直觉**: 传递的是主，预设的是副
5. **易于维护**: 子代理配置集中在预设文件
