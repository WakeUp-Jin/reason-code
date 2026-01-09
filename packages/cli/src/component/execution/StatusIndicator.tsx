/**
 * 状态指示器组件
 * 显示当前执行状态：Spinner + 状态短语 + 时间 + Token + Tip
 */

import React, { useState, useEffect, useMemo } from 'react';
import { Box, Text, useInput } from 'ink';
import { useTheme } from '../../context/theme.js';
import {
  useExecutionSnapshot,
  useIsExecuting,
  useExecutionState,
} from '../../context/execution.js';
import { TIPS } from './constants.js';
import { logger } from '../../util/logger.js';

// Spinner 动画帧
const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

/**
 * 内联 Spinner 组件
 * isPaused: 暂停时停止动画（用于等待确认时）
 */
function Spinner({ color, isPaused }: { color: string; isPaused?: boolean }) {
  const [frameIndex, setFrameIndex] = useState(0);

  useEffect(() => {
    logger.info(`🔄 [Spinner] useEffect triggered`, { isPaused });

    if (isPaused) {
      logger.info(`⏸️ [Spinner] PAUSED - not starting timer`);
      return;
    }

    logger.info(`▶️ [Spinner] RUNNING - starting timer`);
    const timer = setInterval(() => {
      setFrameIndex((prev) => (prev + 1) % SPINNER_FRAMES.length);
    }, 80);

    return () => {
      logger.info(`🛑 [Spinner] cleanup - clearing timer`);
      clearInterval(timer);
    };
  }, [isPaused]);

  return <Text color={color}>{SPINNER_FRAMES[frameIndex]}</Text>;
}

/**
 * 状态指示器
 */
export function StatusIndicator() {
  const { colors } = useTheme();
  const snapshot = useExecutionSnapshot();
  const isExecuting = useIsExecuting();
  const { showThinking, toggleThinking, isPendingConfirm, todos, showTodos } = useExecutionState();
  const [elapsedTime, setElapsedTime] = useState(0);
  const [tipIndex, setTipIndex] = useState(0);

  // 🔍 DEBUG: 监听 isPendingConfirm 变化
  useEffect(() => {
    logger.info(`🎯 [StatusIndicator] isPendingConfirm changed`, { isPendingConfirm, isExecuting });
  }, [isPendingConfirm, isExecuting]);

  // 快捷键监听：ctrl+y 切换 thinking（TODO 切换由 Session 统一处理：ctrl+t）
  useInput(
    (input, key) => {
      // 兼容：不同终端/ink 解析下 ctrl+y 可能表现为 (key.ctrl && 'y') 或控制字符 \x19
      const isCtrlY = (key.ctrl && input.toLowerCase() === 'y') || input === '\u0019';
      if (isCtrlY) {
        toggleThinking();
      }
    },
    { isActive: isExecuting }
  );

  // 动态 Tip：根据 TODO 显示状态调整提示
  const dynamicTip = useMemo(() => {
    if (todos.length > 0) {
      return showTodos ? 'ctrl+t to hide todos' : 'ctrl+t to show todos';
    }
    return TIPS[tipIndex];
  }, [todos.length, showTodos, tipIndex]);

  // 计时器（等待确认时暂停）
  useEffect(() => {
    logger.info(`⏱️ [Timer] useEffect triggered`, { isExecuting, isPendingConfirm });

    // 执行结束时重置计时器
    if (!isExecuting) {
      logger.info(`⏱️ [Timer] RESET - execution ended`);
      setElapsedTime(0);
      return;
    }

    // 等待确认时暂停（不重置值）
    if (isPendingConfirm) {
      logger.info(`⏱️ [Timer] PAUSED - pending confirm`);
      return;
    }

    logger.info(`⏱️ [Timer] RUNNING - starting interval`);
    const interval = setInterval(() => {
      setElapsedTime((prev) => prev + 1);
    }, 1000);

    return () => {
      logger.info(`⏱️ [Timer] cleanup - clearing interval`);
      clearInterval(interval);
    };
  }, [isExecuting, isPendingConfirm]);

  // Tip 轮换（等待确认时暂停）
  useEffect(() => {
    if (!isExecuting || isPendingConfirm) return;

    const interval = setInterval(() => {
      setTipIndex((prev) => (prev + 1) % TIPS.length);
    }, 8000);

    return () => clearInterval(interval);
  }, [isExecuting, isPendingConfirm]);

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
        <Spinner color={colors.warning} isPaused={isPendingConfirm} />
        <Text color={colors.warning}>{statusPhrase}</Text>
        <Text color={colors.textMuted}>
          (esc to interrupt · {formatTime(elapsedTime)}
          {stats.totalTokens > 0 && ` · ↓ ${stats.totalTokens} tokens`})
        </Text>
      </Box>

      {/* Tip 行 - 仅在思考状态且未展开时显示 */}
      {state === 'thinking' && !showThinking && (
        <Box paddingLeft={2}>
          <Text color={colors.textMuted}>└ Tip: {dynamicTip}</Text>
        </Box>
      )}
    </Box>
  );
}
