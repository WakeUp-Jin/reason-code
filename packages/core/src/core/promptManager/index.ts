/**
 * 提示词管理模块
 * 统一导出所有提示词
 */

// ============ 系统提示词 ============
export {
  SIMPLE_AGENT_PROMPT,
  MAIN_AGENT_PROMPT,
  SUB_AGENT_A_PROMPT,
  SUB_AGENT_B_PROMPT,
  INSIGHT_FORMAT_PROMPT,
} from './system/agentPrompts.js';

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
