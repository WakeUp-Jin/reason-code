/**
 * useAgentStats Hook
 * 从 Agent 内存中获取统计数据（Token 使用情况和累计费用）
 *
 * 这个 hook 提供：
 * - Token: 当前上下文大小（从 ContextManager 实时计算）
 * - Cost: 累计费用（从 SessionStats 获取）
 */

import { useState, useEffect, useCallback } from 'react';
import { useExecutionState } from '../context/execution.js';
import { useAppStore } from '../context/store.js';

export interface AgentStats {
  /** 当前上下文的 token 数 */
  contextTokens: number;
  /** 模型最大 token 数 */
  maxTokens: number;
  /** 使用百分比 */
  percentage: number;
  /** 累计费用（当前货币） */
  totalCost: number;
  /** 是否有数据 */
  hasData: boolean;
}

// 模块级变量：存储最新的统计数据
let cachedStats: AgentStats = {
  contextTokens: 0,
  maxTokens: 64000,
  percentage: 0,
  totalCost: 0,
  hasData: false,
};

/**
 * 更新缓存的统计数据（由 useAgent 调用）
 */
export function updateAgentStats(stats: Partial<AgentStats>): void {
  cachedStats = { ...cachedStats, ...stats, hasData: true };
}

/**
 * 获取 Agent 统计数据
 * 用于 Footer 等组件显示 Token 和费用
 */
export function useAgentStats(): AgentStats {
  const [stats, setStats] = useState<AgentStats>(cachedStats);
  const { subscribe } = useExecutionState();
  const currency = useAppStore((state) => state.config.currency);
  const exchangeRate = useAppStore((state) => state.config.exchangeRate);

  // 监听执行流事件，更新统计
  useEffect(() => {
    const unsubscribe = subscribe((event) => {
      // 当有 token 统计更新时
      if (event.type === 'stats:update') {
        // 这里的 stats 是实时的输入/输出 token
        // 我们需要从 Agent 获取完整的上下文 token
        // 暂时使用缓存数据
        setStats({ ...cachedStats });
      }

      // 执行完成时刷新
      if (event.type === 'execution:complete') {
        setStats({ ...cachedStats });
      }
    });

    return unsubscribe;
  }, [subscribe]);

  // 定期刷新（每秒），确保数据同步
  useEffect(() => {
    const interval = setInterval(() => {
      if (cachedStats.hasData) {
        setStats({ ...cachedStats });
      }
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  // 转换费用货币
  const displayCost = currency === 'USD'
    ? stats.totalCost
    : stats.totalCost * exchangeRate;

  return {
    ...stats,
    totalCost: displayCost,
  };
}

/**
 * 重置统计数据（会话切换时调用）
 */
export function resetAgentStats(): void {
  cachedStats = {
    contextTokens: 0,
    maxTokens: 64000,
    percentage: 0,
    totalCost: 0,
    hasData: false,
  };
}

