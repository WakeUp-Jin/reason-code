/**
 * 工具输出总结提示词
 * 用于总结过长的工具输出
 */

/**
 * 工具输出总结提示词
 * 用于总结过长的工具输出
 */
export const TOOL_OUTPUT_SUMMARY_PROMPT = `请总结以下工具输出的关键信息。保留重要的技术细节、文件路径、错误信息和关键数据，但去除冗余内容。

要求：
1. 保留所有错误信息和警告
2. 保留关键的文件路径和行号
3. 保留重要的数据结构和值
4. 去除重复的日志条目
5. 压缩长列表，只保留关键项
6. 保持技术准确性

工具输出：
`;

/**
 * 生成工具输出总结的完整提示词
 *
 * @param toolName - 工具名称
 * @param output - 工具输出内容
 * @returns 完整的提示词
 */
export function buildToolOutputSummaryPrompt(toolName: string, output: string): string {
  return `${TOOL_OUTPUT_SUMMARY_PROMPT}

工具名称: ${toolName}

${output}`;
}
