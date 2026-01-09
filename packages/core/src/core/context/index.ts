/**
 * 上下文管理模块统一导出
 */

// 类型定义
export * from './types.js';

// 基础类
export { BaseContext } from './base/BaseContext.js';

// 核心管理器
export { ContextManager, type CompressionConfig, type TokenUsage } from './ContextManager.js';

// 上下文模块（3 种核心类型）
export { SystemPromptContext } from './modules/SystemPromptContext.js';
export { HistoryContext } from './modules/HistoryContext.js';
export { CurrentTurnContext } from './modules/CurrentTurnContext.js';

// 上下文工具
export { TokenEstimator } from './utils/tokenEstimator.js';
export { ToolOutputSummarizer } from './utils/ToolOutputSummarizer.js';
