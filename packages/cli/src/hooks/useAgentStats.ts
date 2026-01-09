/**
 * useAgentStats Hook
 * 从执行流事件中获取统计数据（Token 使用情况和累计费用）
 *
 * 简化版：直接使用 stats:update 事件中的数据
 * - Token: LLM API 返回的 inputTokens（当前上下文大小）
 * - Cost: SessionStats 计算的累计费用
 */

import { useState, useEffect } from 'react';
import { useExecutionState } from '../context/execution.js';
import { useAppStore } from '../context/store.js';
import { getModelTokenLimit } from '../config/tokenLimits.js';

export interface AgentStats {
  /** 当前上下文的 token 数 */
  contextTokens: number;
  /** 模型最大 token 数 */
  maxTokens: number;
  /** 使用百分比 */
  percentage: number;
  /** 累计费用（USD） */
  totalCost: number;
  /** 是否有数据 */
  hasData: boolean;
}

const DEFAULT_STATS: AgentStats = {
  contextTokens: 0,
  maxTokens: 64000,
  percentage: 0,
  totalCost: 0,
  hasData: false,
};

/**
 * 获取 Agent 统计数据
 * 用于 Footer 等组件显示 Token 和费用
 */
export function useAgentStats(): AgentStats {
  const [stats, setStats] = useState<AgentStats>(DEFAULT_STATS);
  const { subscribe } = useExecutionState();
  const currency = useAppStore((state) => state.config.currency);
  const exchangeRate = useAppStore((state) => state.config.exchangeRate);
  const currentModel = useAppStore((state) => state.currentModel);

  // 获取当前模型的 token 限制
  const maxTokens = currentModel ? getModelTokenLimit(currentModel) : 64000;

  // 监听执行流事件，实时更新统计
  useEffect(() => {
    const unsubscribe = subscribe((event) => {
      // 当有 token 统计更新时，直接使用事件数据
      if (event.type === 'stats:update') {
        const inputTokens = event.stats.inputTokens || 0;
        const totalCost = event.totalCost || 0;

        setStats({
          contextTokens: inputTokens,
          maxTokens,
          percentage: Math.round((inputTokens / maxTokens) * 100),
          totalCost,
          hasData: true,
        });
      }
    });

    return unsubscribe;
  }, [subscribe, maxTokens]);

  // 转换费用货币（USD → CNY）
  const displayCost = currency === 'USD'
    ? stats.totalCost
    : stats.totalCost * exchangeRate;

  return {
    ...stats,
    totalCost: displayCost,
  };
}
