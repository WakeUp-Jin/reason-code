import React from 'react';
import { Box } from 'ink';
import { useStreamingMessage } from '../../context/store.js';
import { AssistantMessage } from './assistant-message.js';

// 导出组件
export { UserMessage } from './user-message.js';
export { AssistantMessage } from './assistant-message.js';
export { ToolMessage } from './tool-message.js';
export { ThinkingMessage } from './thinking-message.js';

/**
 * 消息区域组件 - 只渲染当前流式消息
 *
 * 注意：
 * - 已完成的消息由 Session 页面的 Static 组件渲染
 * - 此组件只负责渲染当前正在流式传输的消息
 * - 这样可以利用终端原生滚动查看历史消息
 */
export function MessageArea() {
  const streamingMessage = useStreamingMessage();

  // 如果没有流式消息，不渲染任何内容
  if (!streamingMessage) {
    return null;
  }

  // 渲染当前流式消息
  return (
    <Box flexDirection="column">
      <AssistantMessage message={streamingMessage} />
    </Box>
  );
}
