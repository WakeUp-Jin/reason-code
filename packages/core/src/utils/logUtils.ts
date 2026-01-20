/**
 * Core 包日志工具函数
 *
 * 设计原则（方案2：不同维度记录）：
 * - INFO 级别：关键里程碑（Session开始、Loop完成、Tool完成、错误/警告）
 * - DEBUG 级别：技术细节（事件发射、工具执行参数、LLM调用详情、完整输出）
 * - WARN 级别：警告和重要决策（如压缩触发）
 * - ERROR 级别：错误和失败
 *
 * 核心思想：
 * - INFO 不是 DEBUG 的简化版
 * - INFO = 用户视角的关键事件（完成了什么）
 * - DEBUG = 开发者视角的技术细节（具体怎么做的）
 * - 启用 DEBUG 时，两者互补而非重复
 */

import { logger } from './logger.js';

/**
 * 截断长字符串（用于 INFO 级别）
 */
function truncate(str: string, maxLength = 200): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength) + `... (${str.length} chars total)`;
}

/**
 * 工具日志封装
 */
export const toolLogger = {
  /**
   * 工具开始执行
   * DEBUG: 完整参数（技术细节）
   */
  execute(toolName: string, callId: string, args: any) {
    logger.debug(`🔧 [Tool:Execute] ${toolName}`, { callId, args });
  },

  /**
   * 工具原始输出
   * DEBUG: 完整输出（技术细节）
   */
  rawOutput(toolName: string, callId: string, output: string) {
    logger.debug(`📤 [Tool:RawOutput] ${toolName}`, {
      callId,
      size: output.length,
      tokens: Math.ceil(output.length / 4),
      output,  // ✅ DEBUG 完整输出，用于验证工具行为
    });
  },

  /**
   * 工具输出压缩
   * WARN: 压缩前后对比（DEBUG 和 INFO 都记录）
   * DEBUG: 完整的原始输出和压缩输出
   */
  compressed(
    toolName: string,
    callId: string,
    originalOutput: string,
    originalTokens: number,
    processedOutput: string,
    processedTokens: number
  ) {
    logger.warn(`🗜️ [Tool:Compressed] ${toolName}`, {
      callId,
      originalTokens,
      processedTokens,
      compressionRatio: ((1 - processedTokens / originalTokens) * 100).toFixed(1) + '%',
      originalOutput,   // ✅ DEBUG 完整原始输出，用于验证压缩算法
      processedOutput,  // ✅ DEBUG 完整压缩输出
    });
  },

  /**
   * 工具未压缩（低于阈值）
   * DEBUG: 记录跳过压缩的原因
   */
  noCompression(toolName: string, callId: string, tokens: number) {
    logger.debug(`✅ [Tool:NoCompression] ${toolName}`, {
      callId,
      reason: 'below_threshold',
      tokens,
    });
  },

  /**
   * 工具完成
   * INFO: 执行结果摘要
   */
  complete(toolName: string, callId: string, duration: number) {
    logger.info(`✅ [Tool] ${toolName} completed`, {
      callId,
      duration,
    });
  },

  /**
   * 工具失败
   * ERROR: 错误详情（包含参数帮助调试）
   */
  error(toolName: string, callId: string, error: string, args?: any) {
    logger.error(`❌ [Tool] ${toolName} failed`, {
      callId,
      error,
      args,  // 错误时记录参数
    });
  },
};

/**
 * 上下文日志封装
 */
export const contextLogger = {
  /**
   * 上下文状态
   * DEBUG: 完整消息列表（技术细节）
   */
  state(messageCount: number, tokens: number, limit: number, messages: any[]) {
    const usagePercent = (tokens / limit) * 100;

    logger.debug(`📊 [Context:State]`, {
      messageCount,
      tokens,
      limit,
      usagePercent: usagePercent.toFixed(1) + '%',
      messages,  // ✅ DEBUG 完整消息列表
    });
  },

  /**
   * 上下文压缩触发
   * WARN: 压缩触发（DEBUG 和 INFO 都记录）
   */
  compressionTriggered(usagePercent: number, totalMessages: number, tokens: number) {
    logger.warn(`🗜️ [Context:CompressionTriggered]`, {
      usagePercent: usagePercent.toFixed(1) + '%',
      totalMessages,
      tokens,
    });
  },

  /**
   * 上下文压缩详情
   * DEBUG: 压缩前后的完整消息列表（用于验证压缩算法）
   * WARN: 压缩统计
   */
  compressionDetails(
    beforeMessages: any[],
    beforeTokens: number,
    afterMessages: any[],
    afterTokens: number
  ) {
    // DEBUG: 记录压缩前的完整消息
    logger.debug(`📊 [Context:BeforeCompression]`, {
      messageCount: beforeMessages.length,
      tokens: beforeTokens,
      messages: beforeMessages,  // ✅ DEBUG 完整消息，用于验证压缩前状态
    });

    // DEBUG: 记录压缩后的完整消息
    logger.debug(`📊 [Context:AfterCompression]`, {
      messageCount: afterMessages.length,
      tokens: afterTokens,
      messages: afterMessages,  // ✅ DEBUG 完整消息，用于验证压缩后状态
    });

    // WARN: 压缩统计（DEBUG 和 INFO 都记录）
    logger.warn(`✅ [Context:Compressed]`, {
      before: { count: beforeMessages.length, tokens: beforeTokens },
      after: { count: afterMessages.length, tokens: afterTokens },
      removed: beforeMessages.length - afterMessages.length,
      saved: beforeTokens - afterTokens,
      ratio: ((1 - afterTokens / beforeTokens) * 100).toFixed(1) + '%',
    });
  },

  /**
   * 上下文溢出
   * ERROR: 上下文溢出错误
   */
  overflow(currentTokens: number, limit: number, usagePercent: number) {
    logger.error(`❌ [Context:Overflow]`, {
      currentTokens,
      limit,
      usagePercent: usagePercent.toFixed(1) + '%',
    });
  },
};

/**
 * LLM 日志封装
 */
export const llmLogger = {
  /**
   * LLM 调用请求
   * DEBUG: 完整消息列表和工具定义（技术细节）
   */
  request(messageCount: number, toolCount: number, tools: string[], messages: any[]) {
    logger.debug(`🤖 [LLM:Request]`, {
      messageCount,
      toolCount,
      tools,
      messages,  // ✅ DEBUG 完整消息列表，用于验证输入
    });
  },

  /**
   * LLM 响应
   * DEBUG: 完整响应内容（技术细节）
   */
  response(
    finishReason: string,
    content: string | undefined,
    thinkingContent: string | undefined,
    toolCalls: any[] | undefined,
    usage: any
  ) {
    logger.debug(`📥 [LLM:Response]`, {
      finishReason,
      content,           // ✅ DEBUG 完整内容
      thinkingContent,   // ✅ DEBUG 完整思考
      toolCalls,         // ✅ DEBUG 完整工具调用
      usage,
    });
  },

  /**
   * LLM 调用失败
   * ERROR: 错误详情
   */
  error(error: string, attempt: number, maxRetries: number) {
    logger.error(`❌ [LLM] Call failed`, {
      error,
      attempt,
      maxRetries,
    });
  },
};

/**
 * 事件日志封装
 * 自动过滤高频无用事件（状态轮换、流式增量）
 */
export const eventLogger = {
  /**
   * 发射事件（Core）
   * DEBUG: 完整事件数据（技术细节）
   */
  emit(eventType: string, eventData: any) {
    // 跳过高频无用事件
    const skipEvents = ['state:change', 'thinking:delta', 'content:delta'];
    if (skipEvents.includes(eventType)) return;

    logger.debug(`📡 [Event:Emit] ${eventType}`, eventData);
  },
};

/**
 * 循环日志封装
 */
export const loopLogger = {
  /**
   * 循环开始
   * INFO: 循环配置
   */
  start(maxLoops: number, enableCompression: boolean) {
    logger.info(`🚀 [Loop] Started`, { maxLoops, enableCompression });
  },

  /**
   * 循环迭代
   * DEBUG: 每次迭代（可能很频繁）
   */
  iteration(loopCount: number, maxLoops: number) {
    logger.debug(`🔄 [Loop] Iteration ${loopCount}/${maxLoops}`);
  },

  /**
   * 循环完成
   * INFO: 循环总结
   */
  complete(loopCount: number, totalTokens: number) {
    logger.info(`✅ [Loop] Completed`, { loopCount, totalTokens });
  },

  /**
   * 循环超出最大次数
   * WARN: 警告
   */
  maxLoopExceeded(maxLoops: number) {
    logger.warn(`⚠️ [Loop] Max loop count exceeded`, { maxLoops });
  },

  /**
   * 循环失败
   * ERROR: 失败原因
   */
  error(loopCount: number, error: string) {
    logger.error(`❌ [Loop] Failed`, { loopCount, error });
  },
};

/**
 * 搜索工具日志封装
 * 用于 Glob 和 Grep 工具的错误抑制和策略记录
 */
export const searchLogger = {
  /**
   * 搜索开始
   * INFO: 记录搜索参数，便于排查性能问题
   */
  start(tool: string, searchPath: string, pattern: string, include?: string) {
    logger.info(`🔍 [Search] ${tool} starting`, {
      searchPath,
      pattern,
      include,
      // 警告：如果搜索路径是用户主目录，可能会非常慢
      warning: searchPath.match(/^\/Users\/[^/]+$/) ? 'Searching entire home directory - may be slow!' : undefined,
    });
  },

  /**
   * 策略执行开始
   * DEBUG: 记录策略开始时间
   */
  strategyStart(tool: string, strategy: string, searchPath: string) {
    logger.debug(`⏱️ [Search:StrategyStart] ${tool}`, {
      strategy,
      searchPath,
      startTime: Date.now(),
    });
  },

  /**
   * 策略执行结束
   * DEBUG: 记录策略耗时
   */
  strategyEnd(tool: string, strategy: string, duration: number, resultCount: number) {
    // 超过 5 秒的搜索用 WARN 级别
    // 注意：不能把 logger.warn/debug 赋值到变量后再调用，否则 this 丢失会触发
    // "undefined is not an object (evaluating 'this.write')"。
    const payload = {
      strategy,
      duration,
      resultCount,
      slow: duration > 5000,
    };

    if (duration > 5000) {
      logger.warn(`⏱️ [Search:StrategyEnd] ${tool}`, payload);
    } else {
      logger.debug(`⏱️ [Search:StrategyEnd] ${tool}`, payload);
    }
  },

  /**
   * 文件扫描进度（用于 JavaScript 策略）
   * DEBUG: 每 1000 个文件记录一次进度
   */
  scanProgress(tool: string, scannedFiles: number, matchCount: number, currentPath?: string) {
    logger.debug(`📊 [Search:Progress] ${tool}`, {
      scannedFiles,
      matchCount,
      currentPath: currentPath ? truncate(currentPath, 100) : undefined,
    });
  },

  /**
   * 记录被抑制的错误
   * DEBUG: 错误详情（记录到日志但不中断执行）
   * 降级为 DEBUG 级别，因为权限错误在大范围搜索时非常常见
   *
   * 错误抑制是一种容错设计：单个文件的错误不应中断整个搜索。
   * 常见的可抑制错误：
   * - EACCES: 权限不足
   * - ENOENT: 文件不存在（可能在遍历过程中被删除）
   * - EISDIR: 尝试读取目录
   */
  suppressed(strategy: string, filePath: string, errorCode: string, errorMessage: string) {
    logger.debug(`🔇 [Search:Suppressed] ${strategy}`, {
      filePath,
      errorCode,
      errorMessage,
      reason: 'error_suppressed_to_continue_search',
    });
  },

  /**
   * 批量抑制错误统计
   * WARN: 当抑制的错误数量较多时，汇总记录
   */
  suppressedSummary(strategy: string, errorCount: number, samplePaths: string[]) {
    if (errorCount > 0) {
      logger.warn(`🔇 [Search:SuppressedSummary] ${strategy}`, {
        totalSuppressedErrors: errorCount,
        samplePaths: samplePaths.slice(0, 5),
        hint: errorCount > 10 ? 'Consider using a more specific search path' : undefined,
      });
    }
  },

  /**
   * 记录策略降级
   * WARN: 降级原因
   *
   * 当高性能策略不可用或执行失败时，自动降级到下一个策略。
   * 降级路径：
   * - Glob: ripgrep + Bun.stat → glob npm 包
   * - Grep: ripgrep → git grep → system grep → JavaScript
   */
  strategyFallback(fromStrategy: string, toStrategy: string, reason: string) {
    logger.warn(`⬇️ [Search:Fallback] ${fromStrategy} → ${toStrategy}`, {
      fromStrategy,
      toStrategy,
      reason,
    });
  },

  /**
   * 记录策略选择
   * DEBUG: 选择的策略和运行时环境
   */
  strategySelected(tool: string, strategy: string, runtime: string) {
    logger.debug(`🎯 [Search:Strategy] ${tool}`, {
      strategy,
      runtime,
    });
  },

  /**
   * 搜索完成
   * INFO: 搜索结果摘要
   */
  complete(tool: string, strategy: string, resultCount: number, duration: number) {
    // 超过 10 秒的搜索额外记录警告
    if (duration > 10000) {
      logger.warn(`⚠️ [Search] ${tool} slow execution`, {
        strategy,
        resultCount,
        duration,
        suggestion: 'Consider using a more specific search path or pattern',
      });
    }
    logger.info(`✅ [Search] ${tool} completed`, {
      strategy,
      resultCount,
      duration,
    });
  },

  /**
   * 搜索失败
   * ERROR: 搜索完全失败（所有策略都失败）
   */
  error(tool: string, error: string, triedStrategies: string[]) {
    logger.error(`❌ [Search] ${tool} failed`, {
      error,
      triedStrategies,
    });
  },

  /**
   * 搜索超时
   * WARN: 搜索执行超时
   */
  timeout(tool: string, timeoutMs: number, pattern: string, path: string) {
    logger.warn(`⏱️ [Search] ${tool} timeout`, {
      timeoutMs,
      pattern,
      path,
      suggestion: '请尝试使用更具体的搜索模式或路径',
    });
  },
};

/**
 * Ripgrep 日志封装
 * 用于追踪 ripgrep 二进制文件的检测、下载和使用
 */
export const ripgrepLogger = {
  /**
   * 记录 ripgrep 检测结果
   * DEBUG: 检测系统 rg 和本地缓存的结果
   */
  detection(hasSystemRg: boolean, hasLocalCache: boolean, willDownload: boolean, binDir?: string) {
    logger.debug(`🔍 [Ripgrep:Detection]`, {
      hasSystemRg,
      hasLocalCache,
      willDownload,
      binDir,
    });
  },

  /**
   * 记录使用系统 ripgrep
   * INFO: 使用系统已安装的 rg
   */
  useSystem(path: string) {
    logger.info(`✅ [Ripgrep] Using system rg`, { path });
  },

  /**
   * 记录使用本地缓存
   * INFO: 使用本地缓存的 rg
   */
  useLocalCache(path: string) {
    logger.info(`✅ [Ripgrep] Using cached rg`, { path });
  },

  /**
   * 记录下载开始
   * INFO: 下载开始（包含 URL 和目标路径）
   */
  downloadStart(url: string, targetDir: string) {
    logger.info(`⬇️ [Ripgrep:Download] Starting download`, {
      url,
      targetDir,
    });
  },

  /**
   * 记录下载进度
   * DEBUG: 下载进度（避免日志过多，仅在关键节点记录）
   */
  downloadProgress(downloadedBytes: number, totalBytes: number | null) {
    const percent = totalBytes ? ((downloadedBytes / totalBytes) * 100).toFixed(1) + '%' : 'unknown';
    logger.debug(`⬇️ [Ripgrep:Download] Progress`, {
      downloadedBytes,
      totalBytes,
      percent,
    });
  },

  /**
   * 记录下载完成
   * INFO: 下载完成（包含耗时）
   */
  downloadComplete(duration: number, targetPath: string) {
    logger.info(`✅ [Ripgrep:Download] Completed`, {
      duration,
      targetPath,
    });
  },

  /**
   * 记录下载失败
   * ERROR: 下载失败（包含错误详情）
   */
  downloadError(error: string, url: string, duration: number) {
    logger.error(`❌ [Ripgrep:Download] Failed`, {
      error,
      url,
      duration,
    });
  },

  /**
   * 记录解压开始
   * DEBUG: 解压开始
   */
  extractStart(archivePath: string, targetDir: string) {
    logger.debug(`📦 [Ripgrep:Extract] Starting`, {
      archivePath,
      targetDir,
    });
  },

  /**
   * 记录解压完成
   * DEBUG: 解压完成
   */
  extractComplete(duration: number) {
    logger.debug(`📦 [Ripgrep:Extract] Completed`, { duration });
  },

  /**
   * 记录解压失败
   * ERROR: 解压失败
   */
  extractError(error: string, archivePath: string) {
    logger.error(`❌ [Ripgrep:Extract] Failed`, {
      error,
      archivePath,
    });
  },

  /**
   * 记录 ripgrep 不可用
   * WARN: ripgrep 不可用的原因
   */
  unavailable(reason: string) {
    logger.warn(`⚠️ [Ripgrep] Unavailable`, { reason });
  },
};
