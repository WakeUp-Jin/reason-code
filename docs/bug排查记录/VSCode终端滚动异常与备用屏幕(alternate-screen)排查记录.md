# VSCode 终端滚动异常与备用屏幕（alternate screen）排查记录

## 现象

- 同一台机器、同一个 VSCode 下，不同项目/不同命令的终端表现不一致。
- 普通输出命令（如 `seq 1 5000`）在 VSCode 集成终端中有滚动条，可正常向上滚动。
- 运行 `reason`（或类似全屏 TUI）后：
  - 终端右侧滚动条消失或明显缩短。
  - 鼠标滚轮/触控板无法像预期那样滚动查看历史输出；体感像在“翻输入历史”。
- iTerm2 中运行同样命令时，更容易“仍然能滚回去看输出”（体验更像有 scrollback）。

## 结论（根因）

`reason` 这类全屏终端程序会切换到 **备用屏幕缓冲区**（alternate screen buffer，也叫 alternate screen / alt screen）。

- VSCode 集成终端使用 `xterm.js` 模拟终端。进入备用屏幕后，通常不再使用主屏幕的 scrollback（回滚缓冲区），因此会表现为滚动条消失/无法回滚。
- iTerm2 对备用屏幕的处理更“宽松”（并且有相关选项），可能仍允许查看/保留一定的回滚历史，所以看起来“还能滚”。

这不是 `$TERM` 不一致导致的问题：在 iTerm2 与 VSCode 中 `$TERM` 都可能是 `xterm-256color`，但终端实现对备用屏幕/scrollback 的策略不同。

## 关键验证（可复现）

在终端里手动切换备用屏幕，可以复现“滚动条消失”的行为：

```bash
# 进入备用屏幕（常用于 vim/less/fzf 等全屏应用）
printf '\e[?1049h'

# 退出备用屏幕
printf '\e[?1049l'
```

- 在 VSCode 集成终端中：进入备用屏幕后，滚动条通常会消失或不可回滚；退出后恢复。
- 在 iTerm2 中：进入备用屏幕后，可能仍能看到滚动条/回滚（取决于 iTerm2 设置与实现）。

## 补充观察（为什么“同一个 VSCode 不同项目不一样”）

“是否进入备用屏幕”取决于**运行的程序**（例如 `reason`），而不是项目本身：

- `seq 1 5000` 只是普通输出 → 留在主屏幕缓冲区 → VSCode 终端可回滚。
- `reason` 是全屏 TUI → 切到备用屏幕 → VSCode 终端基本不提供主 scrollback 回滚 → 看起来不能滚。

## 处理建议

### 1) 优先使用 TUI 自己的滚动方式

很多 TUI/分页器会提供 `PgUp/PgDn`、`j/k`、`Ctrl+u/d` 等滚动按键；此时不要依赖终端 scrollback。

### 2) 如果 CLI 支持，禁用备用屏幕/全屏模式

不同工具参数不同，常见关键字：

- `--no-alt-screen`
- `--no-fullscreen`
- `--pager=never` / `--no-pager`

（具体以 `reason --help` 或项目文档为准）

### 3) 需要保留输出时，写日志或管道保存

```bash
reason ... | tee reason.log
```

### 4) 排除“scrollback 太小”造成的误判

VSCode 设置建议：

- `terminal.integrated.scrollback`: 调大（例如 `10000`）
- `terminal.integrated.scrollbar.visible`: `auto` 或 `visible`

## 快速判断清单

- 运行普通大量输出是否能滚：`seq 1 5000`
- 是否进入备用屏幕：`printf '\e[?1049h'` 后滚动条是否变化
- 环境差异（可选）：`echo $TERM_PROGRAM`（iTerm2 常为 `iTerm.app`，VSCode 常为 `vscode`）

