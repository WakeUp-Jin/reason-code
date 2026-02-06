---
name: 模型配置与前端选择优化
overview: 重构模型配置系统：1) ProviderConfig 添加必填的 options 字段；2) Agent 预设配置改用模型层级（ModelTier）而非直接指定 provider/model；3) 前端模型列表从配置文件动态加载。
todos:
  - id: '1'
    content: 扩展 ProviderConfig 接口，添加必填的 options 字段
    status: completed
  - id: '2'
    content: 修改 AgentConfig 类型，将 model 字段改为 modelTier
    status: completed
  - id: '3'
    content: 更新所有 Agent 预设文件（butler, explore, build），使用 modelTier
    status: completed
  - id: '4'
    content: 修改 Agent.init() 方法，从 config.modelTier 读取模型层级
    status: completed
  - id: '5'
    content: 修改 Agent.getModelConfig() 方法，基于 modelTier 获取配置
    status: completed
  - id: '6'
    content: 修改 Agent.setModel() 方法，更新对应层级的模型配置
    status: completed
  - id: '7'
    content: 修改 Agent.run() 方法，使用 modelTier 获取模型信息
    status: completed
  - id: '8'
    content: 修改 useAgent.ts，移除传递 model 覆盖，改为传递 modelTier
    status: completed
  - id: '9'
    content: 修改 Task executors，更新 subAgent.getModelConfig() 调用
    status: completed
  - id: '10'
    content: 更新 ConfigService 默认配置，添加 options 字段
    status: completed
  - id: '11'
    content: 创建模型列表加载函数，从配置文件读取 options
    status: completed
  - id: '12'
    content: 更新 store.tsx，移除硬编码模型列表，改为动态加载
    status: completed
  - id: '13'
    content: 更新 app.tsx，在启动时加载模型列表到 store
    status: completed
isProject: false
---

# 模型配置与前端选择优化计划

## 问题分析

当前系统存在以下问题：

1. 前端模型列表硬编码在 `store.tsx` 中，无法根据配置文件动态更新
2. 配置文件中的 provider 配置缺少可切换模型列表字段
3. **Agent 预设配置直接指定 provider 和 model，应该改为使用模型层级（ModelTier）**
4. 所有入口应该统一使用模型层级，具体的模型和供应商由配置文件决定

## 核心设计变更

### 架构变更

**之前**：

- Agent 预设配置：`model: { provider: 'deepseek', model: 'deepseek-chat' }`
- Agent.init() 硬编码使用 `ModelTier.PRIMARY`
- CLI 传递 `model: { provider, model }` 覆盖预设

**之后**：

- Agent 预设配置：`modelTier: ModelTier.PRIMARY`（或 SECONDARY/TERTIARY）
- Agent.init() 从 `config.modelTier` 读取，默认 `PRIMARY`
- CLI 传递 `modelTier: ModelTier.PRIMARY`（如果需要覆盖）
- 所有模型配置统一从配置文件 `model.primary/secondary/tertiary` 读取

## 实现方案

### 1. 扩展配置类型定义

**文件**: `packages/core/src/config/types.ts`

- 在 `ProviderConfig` 接口中添加 `options: string[]` 字段（**必填**）
- 该字段用于存储该 provider 下可以切换的模型列表

```typescript
export interface ProviderConfig {
  apiKey: string;
  baseUrl?: string;
  timeout?: number;
  /** 可切换的模型列表（用于前端 /model 命令展示）- 必填字段 */
  options: string[];
}
```

### 2. 修改 AgentConfig 类型

**文件**: `packages/core/src/core/agent/config/types.ts`

- 将 `model?: { provider: string; model: string }` 改为 `modelTier?: ModelTier`
- 导入 `ModelTier` 类型

```typescript
import { ModelTier } from '../../../config/types.js';

export interface AgentConfig {
  // ... 其他字段
  /** 模型层级配置（可选，默认 PRIMARY） */
  modelTier?: ModelTier;
  // 移除 model 字段
}
```

### 3. 更新所有 Agent 预设文件

**文件**:

- `packages/core/src/core/agent/config/presets/butler.ts`
- `packages/core/src/core/agent/config/presets/explore.ts`
- `packages/core/src/core/agent/config/presets/build.ts`

**修改内容**：

- `butler.ts`: 移除 `model: { provider, model }`，可选添加 `modelTier: ModelTier.SECONDARY`（或不配置，默认 PRIMARY）
- `explore.ts`: 移除 `model: { provider, model }`，可选添加 `modelTier: ModelTier.SECONDARY`（或不配置，默认 PRIMARY）
- `build.ts`: 不需要配置 `modelTier`（默认 PRIMARY）

**默认层级规则**：如果 Agent 预设没有配置 `modelTier`，自动使用 `ModelTier.PRIMARY`

```typescript
// butler.ts 示例
import { ModelTier } from '../../../config/types.js';

export const butlerAgent: AgentConfig = {
  name: 'butler',
  mode: 'primary',
  description: '...',
  systemPrompt: butlerSystem,
  modelTier: ModelTier.PRIMARY, // 或 SECONDARY
  // 移除 model 字段
};
```

### 4. 修改 Agent.init() 方法

**文件**: `packages/core/src/core/agent/Agent.ts`

- 从 `config.modelTier` 读取模型层级，如果没有则默认 `ModelTier.PRIMARY`
- 使用该层级从 ConfigService 获取模型配置
- 移除硬编码的 `ModelTier.PRIMARY`

```typescript
async init(options?: AgentInitOptions): Promise<void> {
  // 从配置读取模型层级，默认 PRIMARY
  const tier = this.config.modelTier || ModelTier.PRIMARY;

  // 使用指定层级的模型服务
  this.llmService = await llmServiceRegistry.getService(tier);

  // 获取当前模型配置（用于日志和提示词）
  const modelConfig = await configService.getModelConfig(tier);
  const model = modelConfig.model;

  // ... 其余逻辑
}
```

### 5. 修改 Agent.getModelConfig() 方法

**文件**: `packages/core/src/core/agent/Agent.ts`

- 基于 `config.modelTier` 从 ConfigService 获取配置
- 移除对 `this.config.model` 的依赖

```typescript
getModelConfig(): { provider: string; model: string } {
  // 需要异步获取，但当前是同步方法
  // 方案1: 改为异步方法
  // 方案2: 在 init() 时缓存配置
  // 建议使用方案2，在 init() 时缓存 modelConfig
  const tier = this.config.modelTier || ModelTier.PRIMARY;
  // 返回缓存的配置或从 configService 同步获取（需要调整）
}
```

**注意**：`getModelConfig()` 是同步方法，但 `configService.getModelConfig()` 是异步的。需要：

- 在 `init()` 时缓存 `modelConfig`
- 或改为异步方法（需要修改调用方）

### 6. 修改 Agent.setModel() 方法 - `/model` 指令核心逻辑

**文件**: `packages/core/src/core/agent/Agent.ts`

**重要**：`/model` 指令切换模型（如 `deepseek-chat` → `deepseek-reasoner`）时，需要同时：

1. **更新内存**：重新获取 LLM 服务实例
2. **写入配置文件**：持久化到 `model.primary`（或对应层级），下次启动生效
3. **更新缓存**：刷新 `modelConfig` 缓存

```typescript
async setModel(provider: string, model: string): Promise<void> {
  // 获取当前使用的模型层级（默认 PRIMARY）
  const tier = this.config.modelTier || ModelTier.PRIMARY;

  // 1. 写入配置文件（持久化）
  await configService.updateModel(tier, { provider, model });

  // 2. 使 LLM 服务缓存失效
  llmServiceRegistry.invalidate(tier);

  // 3. 重新获取 LLM 服务（内存更新）
  this.llmService = await llmServiceRegistry.getService(tier);

  // 4. 更新缓存的 modelConfig（供 getModelConfig() 同步返回）
  this.cachedModelConfig = { provider, model };
}
```

**配置文件更新示例**：

- 切换前：`model.primary = { provider: "deepseek", model: "deepseek-chat" }`
- 切换后：`model.primary = { provider: "deepseek", model: "deepseek-reasoner" }`

### 7. 修改 Agent.run() 方法

**文件**: `packages/core/src/core/agent/Agent.ts`

- 使用 `config.modelTier` 获取模型信息
- 移除对 `this.config.model?.model` 的依赖

```typescript
async run(userInput: string, options?: AgentRunOptions): Promise<AgentResult> {
  // ...
  const tier = this.config.modelTier || ModelTier.PRIMARY;
  const modelConfig = await configService.getModelConfig(tier);

  const engine = new ExecutionEngine(
    this.llmService,
    this.contextManager,
    isolatedToolManager,
    {
      // ...
      model: modelConfig.model, // 使用从配置读取的模型
      // ...
    }
  );
  // ...
}
```

### 8. 修改 useAgent.ts

**文件**: `packages/cli/src/hooks/useAgent.ts`

- 移除传递 `model: { provider, model }` 覆盖
- 如果需要，可以传递 `modelTier` 覆盖（但通常不需要，因为预设已配置）

```typescript
// 创建 Agent（不再传递 model 覆盖）
const agent = agentManager.createAgent(agentMode);
// 或者如果需要覆盖层级：
// const agent = agentManager.createAgent(agentMode, {
//   modelTier: ModelTier.PRIMARY
// });
```

### 9. 修改 Task executors

**文件**: `packages/core/src/core/tool/Task/executors.ts`

- 修改 `subAgent.getModelConfig()` 的调用
- 如果 `getModelConfig()` 改为异步，需要 await

```typescript
// 方案1: 如果 getModelConfig() 保持同步但内部缓存
const modelConfig = subAgent.getModelConfig();

// 方案2: 如果改为异步
const modelConfig = await subAgent.getModelConfig();

await subAgent.init({
  promptContext: {
    workingDirectory,
    modelName: modelConfig.model,
  },
});
```

### 10. 更新 ConfigService 默认配置

**文件**: `packages/core/src/config/ConfigService.ts`

- 在 `DEFAULT_CONFIG` 中为各 provider 添加 `options` 字段（**必填**）

```typescript
providers: {
  deepseek: {
    apiKey: '',
    baseUrl: 'https://api.deepseek.com',
    timeout: 60000,
    options: ['deepseek-chat', 'deepseek-reasoner'], // 必填
  },
  openrouter: {
    apiKey: '',
    baseUrl: 'https://openrouter.ai/api/v1',
    timeout: 60000,
    options: ['x-ai/grok-4.1-fast', 'anthropic/claude-sonnet-4'], // 必填
  },
  // ...
}
```

### 11. 创建模型列表加载函数

**文件**: `packages/cli/src/config/modelLoader.ts`（新建）

- 从配置文件读取所有 provider 的 `options` 字段
- 生成模型列表，格式为 `provider/model`
- 保留模型元数据映射（名称、描述、定价等）

```typescript
import { configService } from './index.js';

export interface ModelInfo {
  id: string; // provider/model
  name: string;
  provider: string;
  maxTokens?: number;
  pricing?: { input: number; output: number };
  description?: string;
}

export async function loadModelsFromConfig(): Promise<ModelInfo[]> {
  const config = await configService.getConfig();
  const models: ModelInfo[] = [];

  for (const [providerName, providerConfig] of Object.entries(config.providers)) {
    for (const modelName of providerConfig.options) {
      models.push({
        id: `${providerName}/${modelName}`,
        name: formatModelName(modelName),
        provider: providerName,
        // 可以从硬编码的元数据映射获取其他信息
        ...getModelMetadata(providerName, modelName),
      });
    }
  }

  return models;
}
```

### 12. 更新 Store 初始化

**文件**: `packages/cli/src/context/store.tsx`

- 移除硬编码的 `models` 数组
- 添加 `loadModels` action，从配置文件加载模型列表

```typescript
loadModels: async () => {
  const models = await loadModelsFromConfig();
  set({ models });
},
```

### 13. 更新应用启动逻辑

**文件**: `packages/cli/src/app.tsx`

- 在 `loadAllData` 之后，调用 `loadModels` action
- 确保模型列表在 UI 渲染前已加载完成

```typescript
(async () => {
  try {
    const loadedData = await loadAllData();
    // ... 其他初始化

    // 加载模型列表
    await useAppStore.getState().loadModels();
  } catch (error) {
    // ...
  }
})();
```

## 数据流

```
配置文件 (~/.reason-code/config.json)
  ├─ providers[provider].options → 前端模型列表
  └─ model.primary/secondary/tertiary → Agent 使用的模型

Agent 预设配置
  └─ modelTier: ModelTier.PRIMARY
      ↓
Agent.init()
  └─ 从 config.modelTier 读取层级
      ↓
ConfigService.getModelConfig(tier)
  └─ 返回 model[tier] 的配置
      ↓
LLMServiceRegistry.getService(tier)
  └─ 创建对应层级的服务
```

## 配置文件示例

```json
{
  "providers": {
    "deepseek": {
      "apiKey": "sk-xxx",
      "baseUrl": "https://api.deepseek.com",
      "timeout": 60000,
      "options": ["deepseek-chat", "deepseek-reasoner"]
    },
    "openrouter": {
      "apiKey": "sk-xxx",
      "baseUrl": "https://openrouter.ai/api/v1",
      "timeout": 60000,
      "options": ["x-ai/grok-4.1-fast", "anthropic/claude-sonnet-4"]
    }
  },
  "model": {
    "primary": {
      "provider": "deepseek",
      "model": "deepseek-chat"
    },
    "secondary": {
      "provider": "deepseek",
      "model": "deepseek-chat"
    },
    "tertiary": {
      "provider": "deepseek",
      "model": "deepseek-chat"
    }
  }
}
```

## 注意事项

1. **options 字段必填**：不再向后兼容，所有 provider 必须配置 `options` 字段
2. **模型层级统一**：所有 Agent 入口统一使用模型层级，不再直接指定 provider/model
3. **默认层级行为**：**无论主 Agent 还是子 Agent，如果没有配置 `modelTier`，一律默认使用 `PRIMARY`**
4. **getModelConfig() 同步问题**：需要解决同步/异步问题，建议在 `init()` 时缓存配置
5. **模型元数据**：定价、描述等信息可以保留在 CLI 端硬编码映射，或后续扩展配置文件支持
6. **/model 指令持久化**：切换模型时同时更新内存和配置文件，确保下次启动使用新模型

## 测试要点

1. Agent 预设配置使用 `modelTier` 后，能正确从配置文件读取模型
2. 不同 Agent（build/butler/explore）使用不同的模型层级
3. 配置文件添加 `options` 字段后，前端 `/model` 命令显示这些模型
4. 切换模型后，对应层级的配置正确更新
5. 子代理（explore）能正确使用配置的模型层级
