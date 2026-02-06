# 教唆reason桌面端

> 目标：用 Tauri + React(Vite) + Tailwind(shadcn/ui) 做一个“右上角常驻小控件”，一键录音，云端语音转文本（STT），调用本地 `reason-cli`（类似 Claude Code 的终端 Agent）生成回复；把回复在右上角下拉面板流式展示，并用云端文本转语音（TTS）播报。

## 1. 产品形态（MVP）

- 常驻：屏幕右上角一个小方块（Widget Window）
- 控制：一个语音开关（按一下开始录音/再按停止）
- 反馈：录音中状态、识别中状态、生成中状态
- 展示：需要时从右上角“下拉/滑出”一个面板（Panel Window），流式显示 Agent 输出
- 播报：输出完成后（MVP）把最终文本交给 TTS 播报（先不做边生成边播）

非目标（MVP 不做）：
- 多轮会话管理/历史记录
- 流式 STT/流式 TTS
- 复杂权限/多账号
- 复杂的本地知识库索引

## 2. 技术选型

### 2.1 桌面壳：Tauri（建议 v2）
选择原因：轻量、Rust 后端易于管理子进程与系统能力，前端用 Web 技术快速出 UI。

- 多窗口：Widget + Panel 两个窗口更清晰
- 能力：Rust 侧 `Command` 管理 `reason-cli` 进程；通过事件把 stdout 流式推到前端
- 插件（按需）：
  - 全局快捷键：`tauri-plugin-global-shortcut`
  - 自启动：`tauri-plugin-autostart`
  - Key 安全存储：`tauri-plugin-stronghold`（或系统 Keychain/凭据管理器）
  - 日志：`tauri-plugin-log`

### 2.2 前端：React + Vite + Tailwind + shadcn/ui
- UI 简洁：Switch/Button/ScrollArea/Toast 足够
- shadcn/ui 可用（本质是复制组件源码进项目，不依赖 Next.js）

### 2.3 音频：前端录音，后端请求云 API
- 录音：WebView 用 `MediaRecorder` 最快
- STT/TTS：Rust 后端用 `reqwest` 请求云服务（隐藏 API Key，避免前端泄露与 CORS）

### 2.4 Agent：本地 CLI（`reason-cli`）
- MVP：每次请求启动一次 `reason-cli`（简单可靠）
- 进阶：常驻子进程（需要 stdin 协议、心跳/重启等）

## 3. 目录与模块建议（可参考）

建议在仓库内形成下面结构（仅示例）：

- `src-tauri/`
  - `src/commands/`
    - `stt.rs`：云 STT
    - `tts.rs`：云 TTS
    - `agent.rs`：启动/管理 reason-cli，流式读 stdout
    - `windows.rs`：窗口定位/显示隐藏
  - `src/main.rs`：注册 commands、初始化插件
- `src/`
  - `ui/`：shadcn 组件
  - `windows/`
    - `Widget.tsx`
    - `Panel.tsx`
  - `lib/tauri.ts`：invoke/listen 封装

## 4. 关键交互流程

### 4.1 录音 → STT → 得到文本
1) 用户点击 Widget 的 Mic 开关
2) 前端开始录音（MediaRecorder），显示“录音中...”
3) 用户再次点击结束录音
4) 前端把音频 bytes 通过 `invoke(stt_transcribe, { audioBytes, mimeType })` 发送到 Rust
5) Rust 调用云 STT，返回 `transcript`
6) 前端将 `transcript` 显示在 Panel（可自动打开 Panel）

建议：MVP 用“松开/停止后一次识别”，不做流式识别。

### 4.2 文本 → reason-cli → 流式输出显示
1) 前端拿到 `transcript` 后 `invoke(agent_run, { prompt: transcript })`
2) Rust `spawn reason-cli ...`，开启任务读取 stdout
3) 每读到一段就 `window.emit(agent-output, { chunk })`
4) 前端 `listen(agent-output, ...)` 追加到 Panel 的文本区域，并滚动到底
5) 子进程退出后 `emit(agent-finished, { fullText })`

### 4.3 文本 → TTS → 播报
1) 前端收到 `agent-finished`（或用户手动点击“朗读”）
2) 前端 `invoke(tts_speak, { text })`
3) Rust 调用云 TTS，返回音频（bytes 或临时文件路径）
4) 前端用 `<audio>` 播放

MVP 推荐：等 Agent 完成后再一次性 TTS，避免实现“边生成边播”的队列/打断逻辑。

## 5. 窗口实现思路（右上角小方块 + 下拉面板）

### 5.1 两窗口方案（推荐）
- `widget`：固定 56x56（或 72x72），无边框、透明、置顶、跳过任务栏
- `panel`：固定宽度（例如 360~420px），高度 240~420px；默认隐藏；显示时定位在 widget 下方或左侧

关键点：
- 启动时把 widget 定位到“主屏右上角”
- panel 打开时跟随 widget（如果用户拖动 widget，panel 也跟随更新位置）

### 5.2 单窗口伸缩方案（更省窗口管理）
- 一个窗口，折叠态是“小方块”，展开态是“面板”
- 点击后调整窗口高度/宽度并做 CSS 动画

取舍：两窗口更清晰；单窗口更少代码但动效与点击穿透可能更麻烦。

## 6. 云 STT/TTS 接入建议

### 6.1 放在 Rust 后端的理由
- API Key 不暴露在前端
- 避免 WebView CORS
- 更容易做重试、超时、日志、代理

### 6.2 供应商选择
- 尽量选“一家同时提供 STT + TTS”的服务，配置更简单
- 优先选支持你录音格式的 STT（webm/ogg/wav）

### 6.3 配置与安全
- 开发期：`.env` 或 `tauri.conf.json`（注意不要提交到 git）
- 正式：使用 stronghold 或系统凭据存储

建议抽象配置结构：
- `STT_PROVIDER` / `TTS_PROVIDER`
- `API_KEY` / `ENDPOINT` / `MODEL` / `VOICE`

## 7. `reason-cli` 集成要点

### 7.1 最简单（推荐 MVP）
- 每次请求：启动一次 `reason-cli`
- 用参数传 prompt 或通过 stdin 写入一次
- 读取 stdout 直到 EOF

优势：
- 不需要处理“常驻进程状态机”
- 崩了也只影响一次请求

### 7.2 进阶（常驻进程）
- 适合需要多轮对话、减少冷启动
- 需要定义协议：prompt 分隔符、结束标识、错误标识、取消

## 8. Command / Event 设计（建议）

Tauri commands（前端调用 Rust）：
- `stt_transcribe(audioBytes, mimeType) -> { transcript }`
- `agent_run(prompt, options?) -> { runId }`
- `tts_speak(text, voice?, format?) -> { audioBytes | audioPath }`
- `panel_show()` / `panel_hide()` / `toggle_panel()`

事件（Rust 推到前端）：
- `agent-output`: `{ runId, chunk }`
- `agent-error`: `{ runId, message }`
- `agent-finished`: `{ runId, fullText }`

## 9. 错误处理（MVP 要有的）

- 麦克风权限被拒：给出可操作提示（打开系统设置）
- STT 失败：展示错误 + 允许重试（保留录音）
- reason-cli 未找到/退出码非 0：展示 stderr + 引导检查 PATH
- TTS 失败：允许只看文本，不阻塞主流程

## 10. 开发里程碑（建议按这个顺序做）

1) UI：Widget/Panel 两窗口、置顶、右上角定位、开关按钮
2) Agent：Rust 启动 `reason-cli`，Panel 流式显示 stdout
3) 录音：前端 MediaRecorder，能拿到音频 blob（先不 STT）
4) 云 STT：Rust 调接口拿到 transcript → 自动喂给 agent
5) 云 TTS：agent 完成后生成音频 → 前端播放
6) 体验：快捷键、托盘、自启动、拖拽位置记忆

## 11. 风险与坑（提前避坑）

- 音频格式：MediaRecorder 输出可能是 `webm/ogg`，STT 不一定支持；必要时在前端转 wav 或换录音策略
- 流式输出：CLI 输出可能带缓冲，可能需要 `stdbuf -oL`（类 Unix）或 CLI 增加 flush/无缓冲模式
- 置顶窗口：不同平台行为差异大；先以 macOS/Windows 之一为主跑通
- API Key：不要放在前端；也不要硬编码进 git

## 12. 下一步需要你确认的信息

- 目标平台：macOS / Windows / Linux（先做哪个）
- `reason-cli` 的调用方式：一次性命令还是需要常驻 stdin 交互
- 你准备选哪家云 STT/TTS（我可以按具体厂商把请求参数/返回结构写成模板）
