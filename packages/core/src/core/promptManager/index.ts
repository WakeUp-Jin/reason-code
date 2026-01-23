/**
 * 提示词管理模块
 * 统一导出所有提示词
 */

// ============ 系统提示词（模块化） ============
export {
  ROLE_DEFINITION,
  CORE_CAPABILITIES,
  TOOL_USAGE_GUIDE,
  OUTPUT_STYLE_CONSTRAINTS,
  INSIGHT_FORMAT_GUIDE,
} from './system/agentPrompts.js';

// ============ Agent 模式专用提示词 ============
export { stewardPrompt } from './system/stewardPrompt.js';
export { explorePrompt } from './system/explorePrompt.js';

// ============ 系统提示词构建器 ============
export {
  buildSystemPrompt,
  buildSimpleSystemPrompt,
  type SystemPromptContext,
} from './system/systemPromptBuilder.js';

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
