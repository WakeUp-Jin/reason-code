/**
 * 压缩通知组件
 * 以紧凑分隔线样式显示压缩检查点
 *
 * 样式：
 * ─────────────────── ◆ Checkpoint ────────────────────
 *   45.2K → 12.8K tokens (72% saved) · 127 → 34 msgs
 *   Files: ContextManager.ts, index.tsx, Agent.ts +2
 * ─────────────────────────────────────────────────────
 */

import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { useTheme } from '../../context/theme.js';
import type { Notice } from '../../context/store.js';

// Spinner 动画帧
const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

interface CompressionNoticeProps {
  notice: Notice;
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

/**
 * 格式化 Token 数量
 * @param tokens - Token 数量
 * @returns 格式化字符串（如 45.2K）
 */
function formatTokens(tokens: number | undefined): string {
  if (tokens === undefined) return '?';
  if (tokens < 1000) return String(tokens);
  return `${(tokens / 1000).toFixed(1)}K`;
}

/**
 * 格式化文件列表
 * @param files - 文件路径列表
 * @param maxDisplay - 最多显示数量
 * @returns 格式化字符串
 */
function formatRetainedFiles(files: string[] | undefined, maxDisplay = 3): string | null {
  if (!files || files.length === 0) return null;

  const displayed = files.slice(0, maxDisplay);
  const remaining = files.length - maxDisplay;

  let result = displayed.join(', ');
  if (remaining > 0) {
    result += ` +${remaining}`;
  }

  return result;
}

/**
 * 生成分隔线
 * @param width - 目标总宽度
 * @param leftPad - 左侧填充
 * @param rightPad - 右侧填充
 * @param content - 中间内容
 */
function generateLine(width: number): string {
  return '─'.repeat(width);
}

export function CompressionNotice({ notice }: CompressionNoticeProps) {
  const { colors } = useTheme();
  const { data } = notice;

  // 压缩进行中状态
  if (data.isPending) {
    return (
      <Box flexDirection="column" marginY={1}>
        <Box>
          <Text color={colors.textMuted}>───────────────</Text>
          <Text color={colors.textMuted}> </Text>
          <Spinner color={colors.warning} />
          <Text color={colors.warning}> Compressing...</Text>
          <Text color={colors.textMuted}> ───────────────</Text>
        </Box>
        {data.tokenUsage && (
          <Box paddingLeft={2}>
            <Text color={colors.textMuted}>Current usage: {data.tokenUsage}</Text>
          </Box>
        )}
      </Box>
    );
  }

  // 压缩完成状态
  const tokenInfo = `${formatTokens(data.originalTokens)} → ${formatTokens(data.compressedTokens)} tokens`;
  const savedInfo = data.savedPercentage !== undefined ? ` (${data.savedPercentage}% saved)` : '';
  const msgInfo = `${data.originalCount} → ${data.compressedCount} msgs`;
  const filesInfo = formatRetainedFiles(data.retainedFiles);

  return (
    <Box flexDirection="column" marginY={1}>
      {/* 顶部分隔线 + 标题 */}
      <Box>
        <Text color={colors.textMuted}>───────────────────</Text>
        <Text color={colors.textMuted}> </Text>
        <Text color={colors.primary}>◆</Text>
        <Text color={colors.text} bold>
          {' '}
          Checkpoint
        </Text>
        <Text color={colors.textMuted}> ────────────────────</Text>
      </Box>

      {/* Token 和消息统计 */}
      <Box paddingLeft={2}>
        <Text color={colors.success}>{tokenInfo}</Text>
        <Text color={colors.textMuted}>{savedInfo}</Text>
        <Text color={colors.textMuted}> · </Text>
        <Text color={colors.text}>{msgInfo}</Text>
      </Box>

      {/* 保留的文件列表 */}
      {/* {filesInfo && (
        <Box paddingLeft={2}>
          <Text color={colors.textMuted}>Files: </Text>
          <Text color={colors.info}>{filesInfo}</Text>
        </Box>
      )} */}
      {data.retainedFiles && data.retainedFiles.length>0 &&(
        <Box flexDirection='column' paddingLeft={2} marginTop={1}>
          <Box marginBottom={1}>
            <Text color={colors.textMuted}>Files: </Text>
          </Box>
          {data.retainedFiles.slice(0,10).map((file,index)=>(
            <Box key={index} paddingLeft={1}>
              <Text color={colors.info}>  • {file}</Text>
            </Box>
          ))}
          {data.retainedFiles.length>10 &&(
            <Box paddingLeft={1}>
              <Text color={colors.textMuted} dimColor>
                +{data.retainedFiles.length-10} more
              </Text>
            </Box>
          )}
        </Box>
      )}

      {/* 底部分隔线 */}
      <Box>
        <Text color={colors.textMuted}>{generateLine(51)}</Text>
      </Box>
    </Box>
  );
}
