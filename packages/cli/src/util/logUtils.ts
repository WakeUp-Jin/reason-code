/**
 * CLI 包日志工具函数
 *
 * 设计原则：
 * - DEBUG 级别：记录完整数据，用于开发调试
 * - INFO 级别：记录执行流程和里程碑，自动截断长内容
 * - WARN 级别：警告和重要决策
 * - ERROR 级别：错误和失败
 */

import { logger } from './logger.js';

/**
 * 应用启动日志
 */
export const appLogger = {
  /**
   * CLI 启动
   */
  start(platform: string, nodeVersion: string, cwd: string) {
    logger.info(`🚀 [App] CLI starting`, { platform, nodeVersion, cwd });
  },

  /**
   * CLI 关闭
   */
  shutdown(reason: string) {
    logger.info(`👋 [App] CLI shutting down`, { reason });
  },

  /**
   * 未捕获异常
   */
  uncaughtException(error: string, stack?: string) {
    logger.error(`❌ [App] Uncaught exception`, { error, stack });
  },

  /**
   * 未处理的 Promise 拒绝
   */
  unhandledRejection(reason: string) {
    logger.error(`❌ [App] Unhandled rejection`, { reason });
  },
};

/**
 * 会话日志
 */
export const sessionLogger = {
  /**
   * 加载会话
   */
  load(sessionCount: number, currentSessionId: string | null) {
    logger.info(`📂 [Session] Loaded ${sessionCount} sessions`, { currentSessionId });
  },

  /**
   * 创建会话
   */
  create(sessionId: string) {
    logger.info(`✨ [Session] Created`, { sessionId });
  },

  /**
   * 加载历史消息
   */
  loadHistory(sessionId: string, messageCount: number) {
    logger.debug(`📜 [Session] Loaded history`, { sessionId, messageCount });
  },

  /**
   * 保存会话
   * DEBUG: 完整消息统计
   * INFO: 简要信息
   */
  save(sessionId: string, totalMessages: number, assistantMessages: number, withMetadata: number) {
    logger.debug(`💾 [Session] Saving`, {
      sessionId,
      totalMessages,
      assistantMessages,
      withMetadata,
    });

    logger.info(`💾 [Session] Saved`, { sessionId });
  },

  /**
   * 保存完成
   */
  saveComplete(sessionId: string) {
    logger.info(`✅ [Session] Save completed`, { sessionId });
  },

  /**
   * 保存失败
   */
  saveError(sessionId: string, error: string) {
    logger.error(`❌ [Session] Save failed`, { sessionId, error });
  },

  /**
   * 批量保存
   */
  saveBatch(savedCount: number, failedCount: number) {
    logger.info(`💾 [Session] Batch save`, { savedCount, failedCount });
  },
};

/**
 * Agent 日志
 */
export const agentLogger = {
  /**
   * Agent 初始化
   */
  init(provider: string, model: string, sessionId: string) {
    logger.info(`🤖 [Agent] Initialized`, { provider, model, sessionId });
  },

  /**
   * 切换模型
   */
  switch(provider: string, model: string) {
    logger.info(`🔄 [Agent] Switched`, { provider, model });
  },

  /**
   * 发送消息
   * DEBUG: 完整消息内容
   * INFO: 消息 ID
   */
  sendMessage(messageId: string, content: string) {
    logger.debug(`📤 [Agent] Sending message`, { messageId, content });
    logger.info(`📤 [Agent] Sending message`, { messageId });
  },

  /**
   * Agent 未就绪
   */
  notReady() {
    logger.warn(`⚠️ [Agent] Not ready`);
  },

  /**
   * Agent 错误
   */
  error(error: string) {
    logger.error(`❌ [Agent] Error`, { error });
  },
};

/**
 * 事件日志（CLI 接收）
 * 自动过滤高频无用事件
 */
export const eventLogger = {
  /**
   * 接收事件
   * DEBUG: 完整事件对象
   * INFO: 事件类型 + 关键字段
   */
  receive(eventType: string, event: any) {
    // 跳过高频无用事件
    const skipEvents = ['state:change', 'thinking:delta', 'content:delta'];
    if (skipEvents.includes(eventType)) return;

    // DEBUG 级别：记录完整事件对象
    logger.debug(`📥 [Event:Receive] ${eventType}`, event);

    // INFO 级别：记录事件类型和关键信息
    const info: any = { type: eventType };

    // 根据事件类型提取关键字段
    switch (eventType) {
      case 'execution:start':
        info.timestamp = event.timestamp;
        break;

      case 'execution:complete':
        info.stats = event.stats;
        break;

      case 'execution:error':
        info.error = event.error;
        break;

      case 'thinking:complete':
        info.contentLength = event.content?.length || 0;
        break;

      case 'assistant:message':
        info.contentLength = event.content?.length || 0;
        info.toolCallsCount = event.tool_calls?.length || 0;
        info.toolNames = event.tool_calls?.map((tc: any) => tc.function.name) || [];
        break;

      case 'tool:validating':
      case 'tool:executing':
        info.toolCallId = event.toolCall?.id;
        info.toolName = event.toolCall?.toolName;
        info.toolCategory = event.toolCall?.toolCategory;
        if (event.toolCall?.params) {
          info.paramsCount = Object.keys(event.toolCall.params).length;
        }
        if (event.toolCall?.thinkingContent) {
          info.hasThinking = true;
        }
        break;

      case 'tool:complete':
        info.toolCallId = event.toolCall?.id;
        info.toolName = event.toolCall?.toolName;
        info.status = event.toolCall?.status;
        info.duration = event.toolCall?.duration;
        if (event.toolCall?.result) {
          info.resultLength = event.toolCall.result.length;
        }
        break;

      case 'tool:error':
      case 'tool:cancelled':
        info.toolCallId = event.toolCallId;
        info.error = event.error || event.reason;
        break;

      case 'tool:awaiting_approval':
        info.toolCallId = event.toolCallId;
        info.toolName = event.toolName;
        info.confirmType = event.confirmDetails?.type;
        break;

      case 'stats:update':
        info.inputTokens = event.stats?.inputTokens;
        info.outputTokens = event.stats?.outputTokens;
        info.totalTokens = (event.stats?.inputTokens || 0) + (event.stats?.outputTokens || 0);
        break;

      case 'content:complete':
        info.contentLength = event.content?.length || 0;
        break;
    }

    logger.info(`📥 [Event] ${eventType}`, info);
  },
};

/**
 * 执行流日志
 */
export const executionLogger = {
  /**
   * 执行开始
   */
  start() {
    logger.debug(`🎬 [Execution] Started`);
  },

  /**
   * 更新助手消息内容
   */
  updateAssistantMessage(messageId: string, contentLength: number) {
    logger.debug(`📝 [Execution] Updating assistant message`, { messageId, contentLength });
  },

  /**
   * 助手消息更新完成
   */
  assistantMessageUpdated(messageId: string) {
    logger.debug(`✅ [Execution] Assistant message updated`, { messageId });
  },

  /**
   * 没有响应
   */
  noResponse() {
    logger.error(`❌ [Execution] No response from Agent`);
  },
};

/**
 * 配置日志
 */
export const configLogger = {
  /**
   * 加载配置
   */
  load() {
    logger.info(`⚙️ [Config] Loaded`);
  },

  /**
   * 创建默认配置
   */
  createDefault(configPath: string) {
    logger.info(`⚙️ [Config] Created default`, { configPath });
  },

  /**
   * 配置验证失败
   */
  validationFailed(error: string) {
    logger.error(`❌ [Config] Validation failed`, { error });
  },

  /**
   * 保存配置
   * DEBUG: 完整更新内容
   */
  save(updates?: any) {
    logger.debug(`💾 [Config] Saving`, { updates });
    logger.info(`💾 [Config] Saved`);
  },

  /**
   * 配置错误
   */
  error(error: string) {
    logger.error(`❌ [Config] Error`, { error });
  },
};

/**
 * 工具确认日志
 */
export const confirmLogger = {
  /**
   * 显示确认面板
   */
  show(toolName: string, toolCallId: string) {
    logger.info(`❓ [Confirm] Showing`, { toolName, toolCallId });
  },

  /**
   * 确认结果
   */
  outcome(toolName: string, toolCallId: string, outcome: string) {
    logger.info(`✓ [Confirm] Outcome: ${outcome}`, { toolName, toolCallId });
  },
};

/**
 * 持久化日志
 */
export const persistenceLogger = {
  /**
   * 加载数据
   */
  loadAll() {
    logger.info(`📂 [Persistence] Loading all data`);
  },

  /**
   * 保存所有数据
   */
  saveAll() {
    logger.info(`💾 [Persistence] Saving all data`);
  },

  /**
   * 保存完成
   */
  saveAllComplete() {
    logger.info(`✅ [Persistence] All data saved`);
  },
};

/**
 * 主题日志
 */
export const themeLogger = {
  /**
   * 颜色引用未找到
   */
  colorRefNotFound(value: string) {
    logger.warn(`⚠️ [Theme] Color reference not found: ${value}`);
  },

  /**
   * 主题未找到
   */
  notFound(name: string) {
    logger.warn(`⚠️ [Theme] Theme not found: ${name}`);
  },
};

/**
 * 剪贴板日志
 */
export const clipboardLogger = {
  /**
   * 复制失败
   */
  error(error: string) {
    logger.error(`❌ [Clipboard] Copy failed`, { error });
  },
};

/**
 * 命令日志
 */
export const commandLogger = {
  /**
   * 命令已注册（覆盖）
   */
  overwrite(commandName: string) {
    logger.warn(`⚠️ [Command] Overwriting "${commandName}"`);
  },

  /**
   * 命令未找到
   */
  notFound(commandName: string) {
    logger.warn(`⚠️ [Command] Not found: "${commandName}"`);
  },
};
