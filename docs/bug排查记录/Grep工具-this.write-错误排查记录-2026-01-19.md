📐 主题：Grep 工具频繁失败（undefined is not an object (evaluating 'this.write')）排查记录
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

结论（先给结论）
------------------------------------------------------------
1) 本次 “this.write” 报错的直接根因不是 ripgrep、也不是 Bun 大字符串本身，
   而是 Logger 实例方法被当作普通函数调用导致 this 丢失（unbound method）。
2) 同时存在一个高风险诱因：搜索范围过大时 ripgrep stdout 可能膨胀到 GB 级，
   在 Bun 运行时中“把 stdout 一次性读成超大字符串”非常不安全（易 OOM/易触发内部异常）。
3) 最终修复包含两部分：
   - A. 从读取阶段对 stdout 做硬上限（bytes/lines）并在触顶时提前终止 rg
   - B. 修复 searchLogger.strategyEnd 内的 unbound logger method 调用

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1️⃣ 现象与复现
------------------------------------------------------------
【现象】
- 在 Agent/CLI 调用 Grep 工具时，经常出现：
  Failed: undefined is not an object (evaluating 'this.write')

【典型复现方式】
- 搜索路径为用户主目录（例如 /Users/xjk），pattern 较宽（例如 bun|Bun）
- 示例（来自日志调用参数）：
  - pattern: bun|Bun
  - path: /Users/xjk

【关键特征】
- 即使已经出现 “Output capped …”（表示输出被限制/提前终止）仍然会失败。
  说明：失败点发生在 ripgrep 输出限制之后的业务流程里（不是“读爆了才崩”）。

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

2️⃣ 日志证据（定位失败发生的位置）
------------------------------------------------------------
日志文件：
- logs/core/core-2026-01-19_23-55-35.log

关键片段（节选，便于理解流程；行号以日志实际为准）：
- 74: [Ripgrep:search] Starting {"cwd":"/Users/xjk","maxOutputLines":1000}
- 77: ⚠️ [Ripgrep:search] Output capped (bytes) {"maxOutputBytes":52428800,"maxOutputLines":1000}
- 78: ❌ [Search] Grep failed {"error":"undefined is not an object (evaluating 'this.write')"}

解读：
- “Output capped …” 已经证明 ripgrep 输出读取阶段已触发上限并正常返回了部分结果；
- 紧随其后的 “Grep failed this.write” 说明崩溃发生在后续日志/策略收尾/结果处理阶段。

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

3️⃣ 排查过程（为什么最初会怀疑 Bun 大字符串）
------------------------------------------------------------
【初始怀疑点】
- 之前的日志曾出现过一次性读到 1GB+ 文本后立刻失败的模式，容易联想到：
  “Bun 在超大字符串上执行 length/trim/split 等操作时可能触发内部错误”。

【验证后的新发现】
- 新日志已经出现 “Output capped (bytes/lines)”：
  说明已经在读取阶段限制住了输出规模（不再是 1GB+ 字符串）。
- 但仍然立即失败，并且错误信息完全一致：this.write
  => 这表明错误来源更可能是 “Logger.write 的 this 丢失”，而不是大字符串处理。

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

4️⃣ 根因分析（真正的 this.write 从哪来）
------------------------------------------------------------
【根因】
Logger 的 debug/info/warn/error 是依赖 this 的实例方法：
- packages/core/src/utils/logger.ts:182
  debug(message, context) { this.write('DEBUG', ...) }
- packages/core/src/utils/logger.ts:196
  warn(message, context)  { this.write('WARN', ...) }

如果把方法引用赋值给变量再调用，会丢失 this：
- “const fn = logger.warn; fn(...)” 中 fn 的 this 为 undefined
- 进入 Logger.warn 后执行 this.write(...) 立刻触发：
  undefined is not an object (evaluating 'this.write')

【触发点（项目中的具体代码）】
之前的实现（已修复）在策略结束日志里做了这种写法：
- packages/core/src/utils/logUtils.ts:339
  const logFn = duration > 5000 ? logger.warn : logger.debug;
  logFn(...)

这就是典型的 unbound method 问题。

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

5️⃣ 修复方案与落地实现
------------------------------------------------------------
5.1 修复 A：stdout 读取阶段限流（治本解决“大输出不安全”）
【目的】
- 永远不在 Bun 中构造超大字符串（避免 OOM/避免触发内部异常/避免慢到不可用）。

【实现要点】
- 新增限流读取函数：packages/core/src/core/tool/utils/spawn.ts:341
  readStreamAsTextLimited(stream, { maxBytes, maxLines, signal })
  - maxBytes 默认 50MB
  - maxLines 使用 Grep 的全局 limit（默认 1000）
  - 触发上限时返回 { truncated: true, truncatedBy: 'bytes'|'lines' }

- ripgrep 搜索改造：packages/core/src/core/tool/utils/ripgrep.ts:408
  Ripgrep.search(...) 使用 readStreamAsTextLimited 读取 stdout，
  触顶后会主动 SIGTERM 结束 rg，并直接返回已收集文本（trimEnd）。

- Grep 传递全局 limit：packages/core/src/core/tool/Grep/executors.ts:66
  options.limit = GREP_DEFAULTS.LIMIT（默认 1000）

- ripgrep 策略把 limit 下沉成 maxOutputLines：
  packages/core/src/core/tool/Grep/strategies/ripgrep.ts:40
  maxOutputLines = options.limit ?? GREP_DEFAULTS.LIMIT

5.2 修复 B：logger 调用方式修复（解决 this.write 直接崩溃）
【目的】
- 避免 unbound method；确保 Logger 的 this 不会丢失。

【实现】
- packages/core/src/utils/logUtils.ts:339
  将 “const logFn = …; logFn(…)” 改为 if/else 直接调用：
  - duration > 5000 -> logger.warn(...)
  - else -> logger.debug(...)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

6️⃣ 验证方式（建议）
------------------------------------------------------------
1) 复现之前的“大范围搜索”（例如 /Users/xjk + bun|Bun）：
   - 预期：不再出现 “evaluating 'this.write'”
   - 预期：日志出现 “⚠️ [Ripgrep:search] Output capped (bytes/lines)” 并返回有限结果

2) 额外验证：人为触发 strategyEnd 快/慢两条分支
   - 预期：两种情况下都不会报 this.write（说明 warn/debug 都正确绑定到 logger）

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

7️⃣ 经验总结 / 防回归建议
------------------------------------------------------------
1) 代码规范：避免把依赖 this 的方法当作回调直接传递或赋值
   - 典型坑：const fn = obj.method; fn()
   - 可选措施：引入 ESLint 规则 no-unbound-method（若项目启用 ESLint）

2) 对外部命令输出：默认采取“读阶段限流 + 可提前终止进程”的策略
   - 不要依赖“读完后再 substring/trim/split”的事后处理
   - 尤其在 Bun 运行时，超大 stdout 风险更高

