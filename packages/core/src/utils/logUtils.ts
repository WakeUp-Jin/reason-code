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
   * 记录被抑制的错误
   * ERROR: 错误详情（记录到日志但不中断执行）
   *
   * 错误抑制是一种容错设计：单个文件的错误不应中断整个搜索。
   * 常见的可抑制错误：
   * - EACCES: 权限不足
   * - ENOENT: 文件不存在（可能在遍历过程中被删除）
   * - EISDIR: 尝试读取目录
   */
  suppressed(strategy: string, filePath: string, errorCode: string, errorMessage: string) {
    logger.error(`🔇 [Search:Suppressed] ${strategy}`, {
      filePath,
      errorCode,
      errorMessage,
      reason: 'error_suppressed_to_continue_search',
    });
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
};
