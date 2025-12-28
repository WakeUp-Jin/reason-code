/**
 * 工具调用展示组件
 * 显示单个工具调用的状态、名称、参数和结果
 */

import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { useTheme } from '../../context/theme.js';
import { TOOL_ICONS, TOOL_STATUS_THEME_COLORS } from './constants.js';
import { ToolCallStatus, type ToolCallRecord } from '@reason-cli/core';

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
      setFrameIndex(prev => (prev + 1) % SPINNER_FRAMES.length);
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

  // 状态图标
  const StatusIcon = () => {
    if (toolCall.status === ToolCallStatus.Executing) {
      return <Spinner color={statusColor} />;
    }

    const iconKey = toolCall.status.toUpperCase() as keyof typeof TOOL_ICONS;
    return (
      <Text color={statusColor}>
        {TOOL_ICONS[iconKey] || TOOL_ICONS.PENDING}
      </Text>
    );
  };

  return (
    <Box flexDirection="column">
      {/* 主行：图标 + 工具名称 + 参数摘要 */}
      <Box flexDirection="row" gap={1}>
        <StatusIcon />
        <Text color={colors.primary} bold>
          {toolCall.toolName}
        </Text>
        {toolCall.paramsSummary && (
          <Text color={colors.textMuted}>
            ({toolCall.paramsSummary})
          </Text>
        )}
      </Box>

      {/* 结果摘要行 */}
      {toolCall.resultSummary && (
        <Box paddingLeft={2}>
          <Text color={colors.textMuted}>└ </Text>
          <Text color={colors.text}>{toolCall.resultSummary}</Text>
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
          <Text color={colors.textMuted}>
            {toolCall.liveOutput.slice(-200)}
          </Text>
        </Box>
      )}
    </Box>
  );
}
