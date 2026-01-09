/**
 * useExecutionStats Hook
 * 监听执行流事件，实时获取 token 统计信息
 */

import { useState, useEffect } from 'react';
import { useExecutionState } from '../context/execution.js';

export interface ExecutionStats {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

/**
 * 监听执行流的 token 统计信息
 * 用于实时显示当前对话的 token 使用情况
 *
 * @returns 实时的 token 统计数据
 */
export function useExecutionStats(): ExecutionStats {
  const [stats, setStats] = useState<ExecutionStats>({
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
  });

  const { subscribe } = useExecutionState();

  useEffect(() => {
    const unsubscribe = subscribe((event) => {
      // 监听 token 统计更新事件
      if (event.type === 'stats:update') {
        setStats({
          inputTokens: event.stats.inputTokens || 0,
          outputTokens: event.stats.outputTokens || 0,
          totalTokens: (event.stats.inputTokens || 0) + (event.stats.outputTokens || 0),
        });
      }

      // 会话开始时重置
      if (event.type === 'execution:start') {
        setStats({
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
        });
      }

      // 会话完成后清零，避免与持久化数据重复计算
      if (event.type === 'execution:complete') {
        setStats({
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
        });
      }
    });

    return unsubscribe;
  }, [subscribe]);

  return stats;
}
