/**
 * 执行流主组件
 * 简化版：只显示 StatusIndicator
 * 工具调用和思考内容现在作为独立消息由 ToolMessage/ThinkingMessage 渲染
 */

import React from 'react';
import { Box } from 'ink';
import { useExecutionSnapshot, useIsExecuting } from '../../context/execution.js';
import { StatusIndicator } from './StatusIndicator.js';

export function ExecutionStream() {
  const snapshot = useExecutionSnapshot();
  const isExecuting = useIsExecuting();

  if (!snapshot || !isExecuting) {
    return null;
  }

  return (
    <Box flexDirection="column">
      {/* 状态指示器 */}
      <StatusIndicator />
    </Box>
  );
}
