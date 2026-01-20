/**
 * TaskToolMessage 组件
 * 专用于显示 task 工具的执行状态，包括子代理工具调用列表
 */

import React from 'react';
import { Box, Text } from 'ink';
import { useTheme } from '../../context/theme.js';
import type { Message } from '../../context/store.js';

// Spinner 动画帧
const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

/**
 * Spinner 组件
 */
function Spinner({ color }: { color: string }) {
  const [frame, setFrame] = React.useState(0);

  React.useEffect(() => {
    const timer = setInterval(() => {
      setFrame((f) => (f + 1) % SPINNER_FRAMES.length);
    }, 80);
    return () => clearInterval(timer);
  }, []);

  return <Text color={color}>{SPINNER_FRAMES[frame]}</Text>;
}

interface TaskToolMessageProps {
  message: Message;
}

/**
 * TaskToolMessage 组件
 * 显示 task 工具的执行状态和子代理工具调用列表
 */
export function TaskToolMessage({ message }: TaskToolMessageProps) {
  const { colors } = useTheme();
  const { toolCall } = message;

  if (!toolCall) return null;

  const summary = toolCall.subAgentSummary || [];
  const MAX_DISPLAY = 2;
  const displayedItems = summary.slice(-MAX_DISPLAY); // 显示最新的
  const hiddenCount = Math.max(0, summary.length - MAX_DISPLAY);

  // 状态配置
  const statusConfig = {
    pending: { color: colors.warning, icon: '○' },
    executing: { color: colors.warning, icon: '◉' },
    success: { color: colors.success, icon: '●' },
    error: { color: colors.error, icon: '●' },
    cancelled: { color: colors.error, icon: '●' },
  };

  const config = statusConfig[toolCall.status] || statusConfig.pending;

  // 格式化耗时
  const formatDuration = (ms: number | undefined): string => {
    if (!ms) return '';
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  const durationText = formatDuration(toolCall.duration);

  return (
    <Box flexDirection="column" paddingX={2} width="100%">
      {/* 主标题行 */}
      <Box>
        {/* 状态图标 */}
        {toolCall.status === 'executing' || toolCall.status === 'pending' ? (
          <Spinner color={config.color} />
        ) : (
          <Text color={config.color}>{config.icon}</Text>
        )}
        <Text> </Text>
        <Text color={colors.text} bold>
          {toolCall.toolName}
        </Text>
        <Text color={colors.textMuted}> ({toolCall.paramsSummary})</Text>
        {durationText && <Text color={colors.textMuted}> · {durationText}</Text>}
      </Box>

      {/* 子代理工具调用列表 */}
      {summary.length > 0 && (
        <Box flexDirection="column" paddingLeft={2}>
          {/* 折叠提示（如果有隐藏项） */}
          {hiddenCount > 0 && (
            <Box>
              <Text color={colors.textMuted}>├ ... +{hiddenCount} more tool uses</Text>
            </Box>
          )}

          {/* 显示的子工具 */}
          {displayedItems.map((item, index) => {
            const isLast = index === displayedItems.length - 1 && toolCall.status !== 'executing';
            const prefix = isLast ? '└' : '├';

            return (
              <Box key={item.id} flexDirection="row">
                <Text color={colors.textMuted}>{prefix} </Text>

                {/* 状态图标 */}
                {/* {item.status === 'running' ? (
                  <Spinner color={colors.warning} />
                ) : item.status === 'error' ? (
                  <Text color={colors.error}>●</Text>
                ) : (
                  <Text color={colors.success}>●</Text>
                )} */}

                <Text color={colors.text}> {item.tool}</Text>

                {/* 结果摘要 */}
                {item.title && <Text color={colors.textMuted}> → {item.title}</Text>}
              </Box>
            );
          })}
        </Box>
      )}

      {/* 最终结果（完成时） */}
      {toolCall.status === 'success' && toolCall.resultSummary && (
        <Box paddingLeft={2}>
          <Text color={colors.textMuted}>└ </Text>
          <Text color={colors.success}>{toolCall.resultSummary}</Text>
        </Box>
      )}

      {/* 错误信息 */}
      {toolCall.status === 'error' && toolCall.error && (
        <Box paddingLeft={2}>
          <Text color={colors.textMuted}>└ </Text>
          <Text color={colors.error}>{toolCall.error}</Text>
        </Box>
      )}
    </Box>
  );
}

