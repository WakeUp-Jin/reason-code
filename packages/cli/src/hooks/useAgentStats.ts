/**
 * useAgentStats Hook
 * 从执行流事件中获取统计数据（Token 使用情况和累计费用）
 *
 * 简化版：直接使用 Core 层传递的 AgentStats 数据
 * 所有配置（TOKEN_LIMITS, MODEL_PRICING）已移动到 Core 层
 *
 * 数据流：
 * - Core ExecutionEngine.updateStats() → stats:update 事件（包含 agentStats）
 * - CLI 监听事件 → 更新本地状态
 * - 同时更新 Store 中的 sessionTotalCost（用于初始显示）
 */

import { useState, useEffect, useMemo } from 'react';
import { TokenEstimator, getModelTokenLimit, type AgentStats as CoreAgentStats } from '@reason-code/core';
import { useExecutionState } from '../context/execution.js';
import { useAppStore } from '../context/store.js';
import { convertToCoreMsgs } from '../util/messageConverter.js';

/**
 * CLI 使用的 AgentStats 接口
 * 与 Core 的 AgentStats 兼容，但提供更扁平的结构便于 UI 使用
 */
export interface AgentStats {
  /** 当前上下文的 token 数（优先使用 API 精确值） */
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

/** 默认统计数据 */
const DEFAULT_STATS: AgentStats = {
  contextTokens: 0,
  maxTokens: 64000,
  percentage: 0,
  totalCost: 0,
  hasData: false,
};

/**
 * 从 Core AgentStats 转换为 CLI AgentStats
 */
function convertFromCoreStats(coreStats: CoreAgentStats, maxTokens: number): AgentStats {
  // 优先使用 API 精确值，否则使用估算值
  const contextTokens = coreStats.tokens.actual || coreStats.tokens.estimated || coreStats.context.used;

  return {
    contextTokens,
    maxTokens,
    percentage: coreStats.context.percentage,
    totalCost: coreStats.cost.total,
    hasData: true,
  };
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

  // 从 Store 读取费用（用于初始化显示，会话切换时恢复）
  const sessionTotalCost = useAppStore((state) => state.sessionTotalCost);

  // 获取当前模型的 token 限制（从 Core 获取）
  const maxTokens = useMemo(() => {
    if (!currentModel) return 64000;
    // 提取模型名称（格式：provider/model）
    const modelName = currentModel.includes('/') ? currentModel.split('/')[1] : currentModel;
    return getModelTokenLimit(modelName);
  }, [currentModel]);

  // 从历史消息估算初始 token 数（用于初始显示）
  const initialStats = useMemo((): AgentStats => {
    if (!currentSessionId) {
      return { ...DEFAULT_STATS, maxTokens };
    }

    const sessionMessages = messages[currentSessionId] || [];
    const coreMessages = convertToCoreMsgs(sessionMessages);
    const estimated = TokenEstimator.estimateMessages(coreMessages);
    const percentage = Math.round((estimated / maxTokens) * 100);

    return {
      contextTokens: estimated,
      maxTokens,
      percentage,
      totalCost: sessionTotalCost,
      hasData: estimated > 0 || sessionTotalCost > 0,
    };
  }, [currentSessionId, messages, maxTokens, sessionTotalCost]);

  // 实时统计状态（从 stats:update 事件更新）
  const [realtimeStats, setRealtimeStats] = useState<AgentStats | null>(null);

  // 监听执行流事件，实时更新统计
  useEffect(() => {
    const unsubscribe = subscribe((event) => {
      if (event.type === 'stats:update') {
        // 优先使用新的 agentStats 字段
        if (event.agentStats) {
          const stats = convertFromCoreStats(event.agentStats, maxTokens);
          setRealtimeStats(stats);

          // 同步更新 Store 中的费用
          useAppStore.getState().setSessionTotalCost(event.agentStats.cost.total);
        } else if (event.totalCost !== undefined) {
          // 兼容旧格式：只有 totalCost
          const inputTokens = event.stats.inputTokens || 0;
          const percentage = Math.round((inputTokens / maxTokens) * 100);

          setRealtimeStats({
            contextTokens: inputTokens,
            maxTokens,
            percentage,
            totalCost: event.totalCost,
            hasData: true,
          });

          useAppStore.getState().setSessionTotalCost(event.totalCost);
        }
      }
    });

    return unsubscribe;
  }, [subscribe, maxTokens]);

  // 返回实时数据（如果有），否则返回初始估算数据
  return realtimeStats || initialStats;
}
