/**
 * useAgentStats Hook
 * 从执行流事件中获取统计数据（Token 使用情况和累计费用）
 *
 * 功能：
 * - 使用 TokenEstimator 估算上下文 token 数
 * - 监听执行流事件实时更新 token 数据
 * - 从 Store 读取累计费用（由 useAgent 初始化，stats:update 事件更新）
 *
 * 费用数据流（统一使用 CNY）：
 * - useAgent 初始化时计算历史费用 → 存入 Store
 * - stats:update 事件 totalCost → 更新 Store
 * - 显示层从 Store 读取 sessionTotalCost
 */

import { useState, useEffect, useMemo } from 'react';
import { TokenEstimator } from '@reason-cli/core';
import { useExecutionState } from '../context/execution.js';
import { useAppStore } from '../context/store.js';
import { getModelTokenLimit } from '../config/tokenLimits.js';
import { convertToCoreMsgs } from '../util/messageConverter.js';

export interface AgentStats {
  /** 当前上下文的 token 数 */
  contextTokens: number;
  /** 模型最大 token 数 */
  maxTokens: number;
  /** 使用百分比 */
  percentage: number;
  /** 累计费用（CNY） */
  totalCost: number;
  /** 是否有数据 */
  hasData: boolean;
}

/**
 * 获取 Agent 统计数据
 * 用于 Footer 等组件显示 Token 和费用
 */
export function useAgentStats(): AgentStats {
  const { subscribe } = useExecutionState();
  const currentModel = useAppStore((state) => state.currentModel);
  const currentSessionId = useAppStore((state) => state.currentSessionId);
  const messages = useAppStore((state) => state.messages);

  // 从 Store 读取费用（由 useAgent 初始化，stats:update 事件更新）
  const totalCost = useAppStore((state) => state.sessionTotalCost);

  // 获取当前模型的 token 限制
  const maxTokens = currentModel ? getModelTokenLimit(currentModel) : 64000;

  // 从历史消息估算初始 token 数
  const initialContextTokens = useMemo(() => {
    if (!currentSessionId) {
      return 0;
    }

    const sessionMessages = messages[currentSessionId] || [];
    const coreMessages = convertToCoreMsgs(sessionMessages);
    return TokenEstimator.estimateMessages(coreMessages);
  }, [currentSessionId, messages]);

  // 实时 token 统计状态
  const [realtimeTokens, setRealtimeTokens] = useState<{
    contextTokens: number;
    hasRealtimeData: boolean;
  }>({
    contextTokens: 0,
    hasRealtimeData: false,
  });

  // 监听执行流事件，实时更新统计
  useEffect(() => {
    const unsubscribe = subscribe((event) => {
      if (event.type === 'stats:update') {
        // 更新 token 数
        const inputTokens = event.stats.inputTokens || 0;
        setRealtimeTokens({
          contextTokens: inputTokens,
          hasRealtimeData: true,
        });

        // 更新 Store 中的费用
        if (event.totalCost !== undefined) {
          useAppStore.getState().setSessionTotalCost(event.totalCost);
        }
      }
    });

    return unsubscribe;
  }, [subscribe]);

  // Token: 如果有实时数据用实时的，否则用历史估算的
  const contextTokens = realtimeTokens.hasRealtimeData
    ? realtimeTokens.contextTokens
    : initialContextTokens;

  const percentage = Math.round((contextTokens / maxTokens) * 100);
  const hasData = totalCost > 0 || initialContextTokens > 0 || realtimeTokens.hasRealtimeData;

  return {
    contextTokens,
    maxTokens,
    percentage,
    totalCost,
    hasData,
  };
}
