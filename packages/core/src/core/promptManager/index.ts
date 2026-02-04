/**
 * 提示词管理模块
 * 统一导出所有提示词
 */

// ============ 通用提示词常量 ============
export {
  ROLE_DEFINITION,
  CORE_CAPABILITIES,
  PRIORITY_RULES,
  TOOL_USAGE_GUIDE_LITE,
  OUTPUT_STYLE_CONSTRAINTS,
  INSIGHT_MODE,
} from './system/prompts.js';

// ============ Agent 专用提示词 ============
export { explorePrompt } from './system/agents/explore.js';
export { stewardPrompt } from './system/agents/steward.js';

// ============ 系统提示词构建器 ============
export {
  buildSystemPrompt,
  buildExplanatorySystemPrompt,
  type SystemPromptContext,
} from './system/builder.js';

// ============ 压缩相关提示词 ============
export {
  COMPRESSION_SYSTEM_PROMPT,
  extractSummaryContent,
  extractAnalysisContent,
} from './compression/historyCompression.js';

// ============ 总结相关提示词 ============
export {
  TOOL_OUTPUT_SUMMARY_PROMPT,
  buildToolOutputSummaryPrompt,
} from './summarization/toolOutputSummary.js';
