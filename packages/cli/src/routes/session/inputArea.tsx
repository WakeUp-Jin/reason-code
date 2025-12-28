import React, { useState, useEffect, type ReactNode } from 'react';
import { Box } from 'ink';
import { Prompt } from '../../component/prompt';
import { useStore, useAppStore } from '../../context/store';
import { useCurrentSession } from '../../context/store';
import { commandRegistry, CommandPanel } from '../../component/command/index.js';
import { logger } from '../../util/logger.js';
import { usePersistence } from '../../hooks/usePersistence.js';
import { useAgent } from '../../hooks/useAgent.js';

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

  // Agent Hook
  const { isLoading, error, sendMessage } = useAgent();

  // 命令面板状态
  const [commandPanelState, setCommandPanelState] = useState<{
    command: string;
    panel: ReactNode;
  } | null>(null);

  // 当命令面板状态变化时，通知父组件
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

    // 调用真实 Agent
    const response = await sendMessage(value);

    // 更新 AI 响应
    if (response) {
      updateMessage(session.id, assistantMessage.id, {
        content: response,
        isStreaming: false,
      });
    } else {
      updateMessage(session.id, assistantMessage.id, {
        content: error || 'Failed to get response from AI.',
        isStreaming: false,
      });
    }

    // AI 响应后保存
    saveCurrentSession();
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
      {commandPanelState ? (
        // 功能面板模式
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
