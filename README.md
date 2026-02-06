# Reason Code

Reason Code 是采用“渐进式构建的方式”，目前我会先专注 Reason Code 的上下文的搜索和读取功能，而将写入和命令执行功能延后。

我始终看重上下文的处理，**最重要的是 Agent 能够找到解决任务是最关键的那段上下文，我称为相关上下文**，所以先不开发写入功能是因为我觉得在上下文注入的时候不够准确，那么回应的写入和执行功能也会很糟糕，我遵循“简单有效”的原则，所以 Reason Code 的定位如下：

1. **专注于代码的解读与学习，解释代码的逻辑和代码库的结构**
2. 暂无写入工具，Reason Code 先专注确保读取和搜索准确，未来可以考虑接入写入和命令执行功能

> 上下文是Agent的核心，相关性是其精髓。为每个任务找到最契合的上下文，正是我们探索的方向。

<!-- 这是一张图片，ocr 内容为： -->

![Reason Code的演示](./home.gif)

<!-- ![Reason Code的演示](https://test.fukit.cn/autoupload/f/T1ctJDDxXuOhHOz5mOhTy9iO_OyvX7mIgxFBfDMDErs/20260206/qDfk/640X367/2%E6%9C%885%E6%97%A5_%281%29%282%29.gif) -->

## 这是什么

Reason Code 是一款智能代码理解工具，它集成于终端环境中，通过精准检索最相关的代码上下文，帮助您快速理解代码库结构、解析复杂代码逻辑，并深入学习编程实现——所有操作均可通过自然语言指令完成。未来将逐步演进为全功能的智能编程助手。

## 技术亮点

Reason Code 的核心技术设计：

- ✨ Agent 的形态：采用多智能体的设计，同时使用 Agent 的模式设计，让 Agent 专注于单一任务
- 🧰 工具系统：在设计 Agent 的工具的时候，有一些很不错的工具的设计思路：
  - Task 工具：主智能体可以借助 Task 工具来从 Agent 的模块中调起子智能体
  - Grep 和 Glob 本地搜索工具：Grep 四重降级策略（ripgrep -> git grep -> system grep -> js 实现)，Glob 两重降级策略(ripgrep -> npm glob)
  - Todo 工具：当模型推理能力不强时，使用 Todo 工具可以专注模型的推理能力，以此来提高模型的任务成功率
- ⛳ 工具执行调度和审核模块：完善工具执行流程（验证 -> 调度 -> 审核等待 -> 执行 -> 成功｜失败｜取消），在审核模块中的设计中，要约定 Agent 模式下可以直接执行的工具和需要审核的工具，较为特殊的是命令执行工具，这个工具需要审核命令执行前缀
- 📜 会话管理：采用全局模块的会话管理，统一调度历史消息的读取，和消息的写入等操作
- 📝 上下文压缩：压缩上下文中关于会话历史记录前 70%，完整的保留后 30%，**并且添加了历史文件位置的引用(参考 Cursor 的设计思路）**，最终拼接完整的上下文注入给 LLM
- 🪐 读取工具压缩：读取工具的有 2 层限制，第一层是读取文件的内容返回的结果不能大于 100000，第二层是工具模块的限制字符大于 2000 的就要让次模型进行压缩然后返回
- 🌟 LLM 模块：我给在 Reason Code 中的模型按照速度和成本分级，
  - **主模型**用于复杂任务的推理，主 Agent 首选
  - **次模型**用于快速和成本低的任务，工具的压缩等任务可以选择
  - **低模型**用于简单的分类和格式化等任

## 30 秒体验

**环境要求**：[Bun](https://bun.sh)

```bash
# 克隆 & 安装
git clone https://github.com/WakeUp-Jin/reason-code.git
cd reason-code && bun install

# 配置 API Key
cp .env.example .env
# 编辑 .env 填入 API Key

# 启动
bun run dev
```

## 架构概览

Excalidraw 文件链接：[https://my.feishu.cn/file/J2X8bq9KooFgbcxzN4WcdTArnud](https://my.feishu.cn/file/J2X8bq9KooFgbcxzN4WcdTArnud)

![](./ReasonCode核心架构设计.png)

上图是完整的 Reason Code 的核心设计，关于里面的某些模块或者工具的详细设计和实现思路访问下面链接：

👉 仓库链接：

👀 在线阅读链接：

## 目录结构

```plain
reason-code/
├── packages/
│   ├── core/src/                # 核心引擎
│   │   ├── core/
│   │   │   ├── agent/           # Agent 系统（生命周期、执行引擎）
│   │   │   ├── llm/             # LLM 服务（多供应商抽象）
│   │   │   ├── tool/            # 工具系统（调度、权限、内置工具）
│   │   │   ├── context/         # 上下文管理（Token 估算、压缩）
│   │   │   ├── session/         # 会话管理（持久化、子会话）
│   │   │   ├── promptManager/   # 提示词管理（系统提示构建）
│   │   │   ├── execution/       # 执行流（状态机、事件流）
│   │   │   └── stats/           # 统计管理（Token、费用）
│   │   ├── config/              # 配置服务
│   │   └── utils/               # 工具函数
│   │
│   └── cli/src/                 # 终端界面（Ink + React）
│       ├── component/           # UI 组件
│       │   ├── execution/       # 执行流展示
│       │   ├── message-area/    # 消息区域
│       │   ├── panel/           # 面板（确认、设置）
│       │   └── command/         # 命令系统
│       ├── context/             # React Context
│       ├── hooks/               # 自定义 Hooks
│       └── routes/              # 页面路由
│
├── docs/                        # AI 编码参考文档
├── turbo.json                   # Turbo 构建配置
└── package.json                 # Monorepo 根配置
```

## 技术栈

- **运行时**：Bun
- **语言**：TypeScript 5.8
- **构建**：Turbo (Monorepo)
- **CLI**：Ink (React for CLI)
- **LLM**：DeepSeek / OpenRouter

## 开发

```bash
bun run dev        # 开发模式
bun run typecheck  # 类型检查
bun run build      # 构建
```

## 许可证

[Apache-2.0](./LICENSE)
