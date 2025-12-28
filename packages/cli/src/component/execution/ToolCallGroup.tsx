/**
 * 工具调用组容器
 * 像列表一样展示多个 ToolCallDisplay
 */

import React from 'react';
import { Box } from 'ink';
import { ToolCallDisplay } from './ToolCallDisplay.js';
import type { ToolCallRecord } from '@reason-cli/core';

interface ToolCallGroupProps {
  toolCalls: ToolCallRecord[];
  currentToolCall?: ToolCallRecord;
}

export function ToolCallGroup({ toolCalls, currentToolCall }: ToolCallGroupProps) {
  // 合并历史和当前
  const allCalls = currentToolCall
    ? [...toolCalls, currentToolCall]
    : toolCalls;

  if (allCalls.length === 0) {
    return null;
  }

  return (
    <Box flexDirection="column">
      {allCalls.map((toolCall) => (
        <ToolCallDisplay
          key={toolCall.id}
          toolCall={toolCall}
        />
      ))}
    </Box>
  );
}
