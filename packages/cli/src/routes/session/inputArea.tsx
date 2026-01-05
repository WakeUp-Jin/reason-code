import React, { useState, useEffect, type ReactNode } from 'react';
import { Box } from 'ink';
import type { ConfirmDetails, ConfirmOutcome } from '@reason-cli/core';
import { Prompt } from '../../component/prompt';
import { useStore, useAppStore } from '../../context/store';
import { useCurrentSession } from '../../context/store';
import { useExecutionState } from '../../context/execution.js';
import { commandRegistry, CommandPanel } from '../../component/command/index.js';
import { PanelToolConfirm } from '../../component/panel/panel-tool-confirm.js';
import { logger } from '../../util/logger.js';
import { usePersistence } from '../../hooks/usePersistence.js';
import { useAgent } from '../../hooks/useAgent.js';

/** 工具确认请求 */
interface ToolConfirmRequest {
  callId: string;
  toolName: string;
  details: ConfirmDetails;
  resolve: (outcome: ConfirmOutcome) => void;
}

/** 从 details 中提取参数摘要 */
function getParamsSummary(details: ConfirmDetails): string | undefined {
  switch (details.type) {
    case 'info':
      return details.fileName;  // Write: 文件名
    case 'edit':
      return details.filePath;  // Edit: 文件路径
    case 'exec':
      return details.command;   // Bash: 命令
    default:
      return undefined;
  }
}

export interface InputAreaProps {
  onCommandPanelChange?: (isVisible: boolean) => void;
}

// 输入区域 - 使用 Prompt 组件或命令面板
export function InputArea({ onCommandPanelChange }: InputAreaProps) {
  const addMessage = useStore((state) => state.addMessage);
  const updateMessage = useStore((state) => state.updateMessage);
  const session = useCurrentSession();
  const currentModel = useAppStore((state) => state.currentModel);
  const models = useAppStore((state) => state.models);
  const { saveCurrentSession } = usePersistence();
  const { setIsPendingConfirm, setPendingToolInfo } = useExecutionState();

  // Agent Hook
  const { isLoading, error, sendMessage } = useAgent();

  // 工具确认状态（内部管理）
  const [pendingConfirm, setPendingConfirm] = useState<ToolConfirmRequest | null>(null);

  // 同步 pendingConfirm 状态到 ExecutionContext（用于暂停 StatusIndicator 定时器 + Session 显示工具标题）
  useEffect(() => {
    setIsPendingConfirm(pendingConfirm !== null);
    if (pendingConfirm) {
      const paramsSummary = getParamsSummary(pendingConfirm.details);
      setPendingToolInfo({
        toolName: pendingConfirm.toolName,
        paramsSummary,
      });
    } else {
      setPendingToolInfo(null);
    }
  }, [pendingConfirm, setIsPendingConfirm, setPendingToolInfo]);

  // 命令面板状态
  const [commandPanelState, setCommandPanelState] = useState<{
    command: string;
    panel: ReactNode;
  } | null>(null);

  // 当命令面板状态变化时，通知父组件
  // 注意：pendingConfirm 不应该触发此回调，因为它会导致 Static 组件重新打印
  useEffect(() => {
    onCommandPanelChange?.(commandPanelState !== null);
  }, [commandPanelState, onCommandPanelChange]);

  // 处理普通消息提交
  const handleSubmit = async (value: string) => {
    if (!session) return;

    // 添加用户消息
    addMessage(session.id, {
      role: 'user',
      content: value,
    });

    // 保存当前会话
    saveCurrentSession();

    // 添加 AI 响应占位消息（显示加载状态）
    // 注意：实际状态由 ExecutionStream 组件展示，这里只是占位
    const assistantMessage = addMessage(session.id, {
      role: 'assistant',
      content: '',
      isStreaming: true,
    });

    // 创建确认回调
    const onConfirmRequired = async (
      callId: string,
      toolName: string,
      details: ConfirmDetails
    ): Promise<ConfirmOutcome> => {
      return new Promise<ConfirmOutcome>((resolve) => {
        setPendingConfirm({ callId, toolName, details, resolve });
      });
    };

    // 调用真实 Agent，传递确认回调
    const response = await sendMessage(value, { onConfirmRequired });

    // 更新 AI 响应
    if (response) {
      logger.info('📝 Updating assistant message content', {
        messageId: assistantMessage.id,
        contentLength: response.length,
      });

      updateMessage(session.id, assistantMessage.id, {
        content: response,
        isStreaming: false,
      });

      logger.info('✅ Assistant message updated, preparing to save', {
        sessionId: session.id,
        messageId: assistantMessage.id,
      });
    } else {
      logger.error('❌ No response from Agent', {
        error: error,
        messageId: assistantMessage.id,
      });

      updateMessage(session.id, assistantMessage.id, {
        content: error || 'Failed to get response from AI.',
        isStreaming: false,
      });
    }

    // AI 响应后保存
    logger.info('💾 Saving session after AI response...');
    saveCurrentSession();
    logger.info('✅ Session saved successfully');
  };

  // 处理用户确认（用户点击按钮时调用）
  const handleConfirm = (outcome: ConfirmOutcome) => {
    if (pendingConfirm) {
      pendingConfirm.resolve(outcome); // ← 调用 resolve，Promise 完成
      setPendingConfirm(null); // 关闭确认面板
      logger.info(`Tool confirm: ${outcome}`, {
        callId: pendingConfirm.callId,
        toolName: pendingConfirm.toolName,
      });
    }
  };

  // 处理命令执行
  const handleCommandExecute = (commandName: string) => {
    const command = commandRegistry.get(commandName);
    if (!command) {
      logger.warn(`Command "${commandName}" not found`);
      return;
    }

    if (command.type === 'instant') {
      // 立即执行命令
      command.action?.();
    } else if (command.type === 'panel') {
      // 显示功能面板
      // 优先使用 panelFactory，向后兼容 panel
      const panel = command.panelFactory
        ? command.panelFactory(handleCloseCommandPanel)
        : command.panel || null;

      setCommandPanelState({
        command: commandName,
        panel: panel,
      });
    }
  };

  // 关闭命令面板
  const handleCloseCommandPanel = () => {
    setCommandPanelState(null);
  };

  return (
    <Box flexDirection="column" flexShrink={0}>
      {/* 工具确认面板优先级最高 */}
      {pendingConfirm ? (
        <PanelToolConfirm
          toolName={pendingConfirm.toolName}
          details={pendingConfirm.details}
          onConfirm={handleConfirm}
        />
      ) : commandPanelState ? (
        // 命令面板模式
        <CommandPanel
          command={commandPanelState.command}
          panel={commandPanelState.panel}
          onClose={handleCloseCommandPanel}
        />
      ) : (
        // 正常输入模式
        <Prompt
          onSubmit={handleSubmit}
          onCommandExecute={handleCommandExecute}
          placeholder="Type your message..."
        />
      )}
    </Box>
  );
}
