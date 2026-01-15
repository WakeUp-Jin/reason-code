/**
 * 工具调用展示组件
 * 显示单个工具调用的状态、名称、参数和结果
 */

import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { useTheme } from '../../context/theme.js';
import { TOOL_ICONS, TOOL_STATUS_THEME_COLORS } from './constants.js';
import { ToolCallStatus, type ToolCallRecord } from '@reason-cli/core';
import { formatToolSummary } from '../../util/pathFormatter.js';

// Spinner 动画帧
const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

interface ToolCallDisplayProps {
  toolCall: ToolCallRecord;
}

/**
 * 内联 Spinner 组件
 */
function Spinner({ color }: { color: string }) {
  const [frameIndex, setFrameIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setFrameIndex((prev) => (prev + 1) % SPINNER_FRAMES.length);
    }, 80);

    return () => clearInterval(timer);
  }, []);

  return <Text color={color}>{SPINNER_FRAMES[frameIndex]}</Text>;
}

export function ToolCallDisplay({ toolCall }: ToolCallDisplayProps) {
  const { colors } = useTheme();

  // 获取状态对应的颜色
  const statusColorKey = TOOL_STATUS_THEME_COLORS[toolCall.status] || 'textMuted';
  const statusColor = colors[statusColorKey];

  // 格式化参数摘要（将绝对路径转换为相对路径）
  const displayParamsSummary = formatToolSummary(
    toolCall.toolName,
    toolCall.paramsSummary,
    process.cwd()
  );

  // 格式化结果摘要（从结果摘要中提取路径并格式化）
  // 结果摘要格式如 "Read 45 lines from /abs/path/to/file.ts"
  const displayResultSummary = toolCall.resultSummary
    ? formatResultSummary(toolCall.toolName, toolCall.resultSummary)
    : undefined;

  // 状态图标
  const StatusIcon = () => {
    if (toolCall.status === ToolCallStatus.Executing) {
      return <Spinner color={statusColor} />;
    }

    const iconKey = toolCall.status.toUpperCase() as keyof typeof TOOL_ICONS;
    return <Text color={statusColor}>{TOOL_ICONS[iconKey] || TOOL_ICONS.PENDING}</Text>;
  };

  return (
    <Box flexDirection="column">
      {/* 主行：图标 + 工具名称 + 参数摘要 */}
      <Box flexDirection="row" gap={1}>
        <StatusIcon />
        <Text color={colors.primary} bold>
          {toolCall.toolName}
        </Text>
        {displayParamsSummary && <Text color={colors.textMuted}>({displayParamsSummary})</Text>}
      </Box>

      {/* 结果摘要行 */}
      {displayResultSummary && (
        <Box paddingLeft={2}>
          <Text color={colors.textMuted}>└ </Text>
          <Text color={colors.text}>{displayResultSummary}</Text>
          {toolCall.strategy && <Text color={colors.textMuted}> (via {toolCall.strategy})</Text>}
        </Box>
      )}

      {/* 错误信息 */}
      {toolCall.error && (
        <Box paddingLeft={2}>
          <Text color={colors.error}>└ Error: {toolCall.error}</Text>
        </Box>
      )}

      {/* 实时输出（执行中） */}
      {toolCall.status === ToolCallStatus.Executing && toolCall.liveOutput && (
        <Box paddingLeft={2} flexDirection="column">
          <Text color={colors.textMuted}>{toolCall.liveOutput.slice(-200)}</Text>
        </Box>
      )}
    </Box>
  );
}

/**
 * 格式化结果摘要中的路径
 * 例如："Read 45 lines from /abs/path/to/file.ts" → "Read 45 lines from packages/cli/src/file.ts"
 */
function formatResultSummary(toolName: string, summary: string): string {
  // 文件路径相关的工具需要格式化路径
  const pathTools = ['Read', 'ReadFile', 'Write', 'WriteFile', 'Edit', 'ListFiles'];

  if (!pathTools.includes(toolName)) {
    return summary;
  }

  // 使用正则提取路径（假设路径是摘要中的最后一部分）
  // "Read 45 lines from /path/to/file" → 提取 "/path/to/file"
  // "Wrote to /path/to/file" → 提取 "/path/to/file"
  // "Listed 10 items in /path/to/dir" → 提取 "/path/to/dir"
  const pathPattern = /(?:from|to|in)\s+(.+)$/;
  const match = summary.match(pathPattern);

  if (match && match[1]) {
    const absolutePath = match[1];
    const formattedPath = formatToolSummary(toolName, absolutePath, process.cwd());
    // 替换原始路径为格式化后的路径
    return summary.replace(absolutePath, formattedPath);
  }

  return summary;
}
