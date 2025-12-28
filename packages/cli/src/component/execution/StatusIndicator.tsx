/**
 * 状态指示器组件
 * 显示当前执行状态：Spinner + 状态短语 + 时间 + Token + Tip
 */

import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import { useTheme } from '../../context/theme.js';
import { useExecution } from '../../context/execution.js';
import { TIPS } from './constants.js';

// Spinner 动画帧
const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

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

/**
 * 状态指示器
 */
export function StatusIndicator() {
  const { colors } = useTheme();
  const { snapshot, isExecuting, showThinking, toggleThinking } = useExecution();
  const [elapsedTime, setElapsedTime] = useState(0);
  const [tipIndex, setTipIndex] = useState(0);

  // 快捷键监听
  useInput((input, key) => {
    if (key.ctrl && input === 't') {
      toggleThinking();
    }
  }, { isActive: isExecuting });

  // 计时器
  useEffect(() => {
    if (!isExecuting) {
      setElapsedTime(0);
      return;
    }

    const interval = setInterval(() => {
      setElapsedTime(prev => prev + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [isExecuting]);

  // Tip 轮换
  useEffect(() => {
    if (!isExecuting) return;

    const interval = setInterval(() => {
      setTipIndex(prev => (prev + 1) % TIPS.length);
    }, 8000);

    return () => clearInterval(interval);
  }, [isExecuting]);

  if (!isExecuting || !snapshot) {
    return null;
  }

  const formatTime = (seconds: number): string => {
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  const { stats, statusPhrase, state } = snapshot;

  return (
    <Box flexDirection="column">
      {/* 主状态行 */}
      <Box flexDirection="row" gap={1}>
        <Spinner color={colors.warning} />
        <Text color={colors.warning}>{statusPhrase}</Text>
        <Text color={colors.textMuted}>
          (esc to interrupt · {formatTime(elapsedTime)}
          {stats.totalTokens > 0 && ` · ↓ ${stats.totalTokens} tokens`})
        </Text>
      </Box>

      {/* Tip 行 - 仅在思考状态且未展开时显示 */}
      {state === 'thinking' && !showThinking && (
        <Box paddingLeft={2}>
          <Text color={colors.textMuted}>
            └ Tip: {TIPS[tipIndex]}
          </Text>
        </Box>
      )}
    </Box>
  );
}
