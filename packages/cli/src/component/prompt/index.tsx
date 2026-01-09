import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { Box, Text, useInput, useStdout } from 'ink';
import TextInput from 'ink-text-input';
import { useTheme } from '../../context/theme.js';
import { useAppStore } from '../../context/store.js';
import { usePromptHistory } from './history.js';
import { commandRegistry, CommandComplete, type CommandDef } from '../command/index.js';

export interface PromptProps {
  onSubmit: (value: string) => void;
  onCommandExecute?: (commandName: string) => void;
  onCancel?: () => void;
  placeholder?: string;
  disabled?: boolean;
}

/**
 * 主输入框组件
 * 支持历史记录、快捷键，带左边框高亮
 */
export function Prompt({
  onSubmit,
  onCommandExecute,
  onCancel,
  placeholder = 'Type your message...',
  disabled = false,
}: PromptProps) {
  const { colors } = useTheme();
  const { stdout } = useStdout();
  const [value, setValue] = useState('');
  const [currentInput, setCurrentInput] = useState('');
  const { addToHistory, navigateUp, navigateDown, resetNavigation } = usePromptHistory();

  // 命令模式状态
  const [commandMode, setCommandMode] = useState<'autocomplete' | null>(null);
  const [selectedCommandIndex, setSelectedCommandIndex] = useState(0);

  const currentModel = useAppStore((state) => state.currentModel);
  const models = useAppStore((state) => state.models);
  const currentModelInfo = models.find((m) => m.id === currentModel);

  // 避免 ctrl+t/ctrl+y 被 ink-text-input 当作普通字符写入输入框
  const valueRef = useRef(value);
  const suppressTokenRef = useRef(0);
  const suppressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressNextChangeRef = useRef<{
    expectedChar: 't' | 'y';
    baseValue: string;
    token: number;
  } | null>(null);

  // 检测命令前缀
  const isCommand = value.startsWith('/');
  const commandQuery = isCommand ? value.slice(1) : '';

  // 过滤命令列表
  const filteredCommands = useMemo(() => {
    if (!isCommand) return [];
    return commandRegistry.search(commandQuery);
  }, [isCommand, commandQuery]);

  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  useEffect(() => {
    return () => {
      if (suppressTimerRef.current) {
        clearTimeout(suppressTimerRef.current);
      }
    };
  }, []);

  // 实时更新命令补全
  useEffect(() => {
    if (isCommand && filteredCommands.length > 0) {
      setCommandMode('autocomplete');
    } else {
      setCommandMode(null);
    }
  }, [isCommand, filteredCommands]);

  // 重置选中索引when命令列表变化
  useEffect(() => {
    setSelectedCommandIndex(0);
  }, [filteredCommands]);

  // 处理输入变化 - 过滤掉 ctrl 组合键产生的字符
  const handleChange = useCallback(
    (newValue: string) => {
      const pendingSuppress = suppressNextChangeRef.current;
      if (pendingSuppress) {
        suppressNextChangeRef.current = null;

        const { baseValue, expectedChar } = pendingSuppress;
        // 只吞掉“在当前值末尾追加一个 t/y”的变化，避免误吞粘贴/输入法等其他输入
        if (
          newValue.startsWith(baseValue) &&
          newValue.length === baseValue.length + 1 &&
          newValue.slice(baseValue.length).toLowerCase() === expectedChar
        ) {
          return;
        }
      }

      setValue(newValue);
      setCurrentInput(newValue);
      resetNavigation();
    },
    [resetNavigation]
  );

  // 处理提交
  const handleSubmit = useCallback(() => {
    const trimmedValue = value.trim();
    if (!trimmedValue) return;

    // 检查是否是命令
    if (trimmedValue.startsWith('/')) {
      const commandName = trimmedValue.slice(1).split(' ')[0];

      // 如果有 onCommandExecute 回调，则调用它
      if (onCommandExecute) {
        onCommandExecute(commandName);
      }

      setValue('');
      setCurrentInput('');
      setCommandMode(null);
      return;
    }

    // 普通消息
    addToHistory(trimmedValue);
    onSubmit(trimmedValue);
    setValue('');
    setCurrentInput('');
  }, [value, addToHistory, onSubmit, onCommandExecute]);

  // 补全命令到输入框
  const handleCommandSelect = useCallback((command: CommandDef) => {
    setValue(`/${command.name} `);
    setCommandMode(null);
  }, []);

  // 取消命令补全
  const handleCommandCancel = useCallback(() => {
    setValue('');
    setCommandMode(null);
  }, []);

  // 键盘输入处理
  useInput(
    (input, key) => {
      if (disabled) return;

      // 拦截 ctrl+t (TODO 切换) 和 ctrl+y (thinking 切换)，防止字符输入
      // 兼容：不同终端/ink 解析下可能表现为 (key.ctrl && 't'/'y') 或控制字符 \x14/\x19
      const isCtrlT = (key.ctrl && input.toLowerCase() === 't') || input === '\u0014';
      const isCtrlY = (key.ctrl && input.toLowerCase() === 'y') || input === '\u0019';
      if (isCtrlT || isCtrlY) {
        suppressTokenRef.current += 1;
        const token = suppressTokenRef.current;

        suppressNextChangeRef.current = {
          expectedChar: isCtrlT ? 't' : 'y',
          baseValue: valueRef.current,
          token,
        };

        if (suppressTimerRef.current) {
          clearTimeout(suppressTimerRef.current);
        }
        // 如果本次按键没有触发 onChange（例如返回控制字符），下一轮事件前清理，避免误吞后续正常输入
        suppressTimerRef.current = setTimeout(() => {
          if (suppressNextChangeRef.current?.token === token) {
            suppressNextChangeRef.current = null;
          }
        }, 0);

        return; // 不处理，让父组件的 useInput 处理
      }

      // 命令补全模式下的特殊处理
      if (commandMode === 'autocomplete' && filteredCommands.length > 0) {
        // 上下键导航命令列表
        if (key.upArrow) {
          setSelectedCommandIndex((prev) => Math.max(0, prev - 1));
          return;
        }

        if (key.downArrow) {
          setSelectedCommandIndex((prev) => Math.min(filteredCommands.length - 1, prev + 1));
          return;
        }

        // Tab 键补全命令到输入框
        if (key.tab) {
          const selectedCommand = filteredCommands[selectedCommandIndex];
          if (selectedCommand) {
            handleCommandSelect(selectedCommand);
          }
          return;
        }

        // Esc 取消命令补全
        if (key.escape) {
          handleCommandCancel();
          return;
        }

        // Enter 执行选中的命令
        if (key.return) {
          const selectedCommand = filteredCommands[selectedCommandIndex];
          if (selectedCommand && onCommandExecute) {
            // 直接执行选中的命令
            onCommandExecute(selectedCommand.name);
            setValue('');
            setCurrentInput('');
            setCommandMode(null);
          }
          return;
        }

        // 其他键继续输入
        return;
      }

      // 非命令模式下的原有逻辑

      // Enter 提交
      if (key.return) {
        handleSubmit();
        return;
      }

      // Escape 取消
      if (key.escape && onCancel) {
        onCancel();
        return;
      }

      // 上键：历史记录向上
      if (key.upArrow) {
        const historyValue = navigateUp();
        if (historyValue !== null) {
          setValue(historyValue);
        }
        return;
      }

      // 下键：历史记录向下
      if (key.downArrow) {
        const historyValue = navigateDown();
        if (historyValue !== null) {
          setValue(historyValue);
        } else {
          // 回到当前输入
          setValue(currentInput);
        }
        return;
      }
    },
    { isActive: !disabled }
  );

  // 左侧文本
  const leftText = `${currentModelInfo?.name || currentModel} ${currentModelInfo?.provider || ''}`;
  // 右侧文本
  const rightText = '/ for commands';

  return (
    <Box width="100%" flexDirection="column">
      {/* 输入框容器 */}
      <Box
        width="100%"
        flexDirection="column"
        marginBottom={commandMode === 'autocomplete' ? 0 : 1}
        borderStyle="bold"
        borderBottom={false}
        borderTop={false}
        borderRight={false}
        borderColor={colors.primary}
      >
        {/* 输入框区域 - 带左边框和背景色 */}
        <Box minHeight={3} paddingY={1} backgroundColor={colors.backgroundElement}>
          <Box flexGrow={1} paddingLeft={1}>
            {disabled ? (
              <Text color={colors.textMuted}>{placeholder}</Text>
            ) : (
              <TextInput value={value} onChange={handleChange} placeholder={placeholder} />
            )}
          </Box>
        </Box>
      </Box>

      {/* 命令补全面板 */}
      {commandMode === 'autocomplete' && filteredCommands.length > 0 && (
        <CommandComplete
          query={commandQuery}
          commands={filteredCommands}
          selectedIndex={selectedCommandIndex}
          onSelect={handleCommandSelect}
          onCancel={handleCommandCancel}
        />
      )}
    </Box>
  );
}

// 导出历史记录 Hook
export { usePromptHistory } from './history.js';
