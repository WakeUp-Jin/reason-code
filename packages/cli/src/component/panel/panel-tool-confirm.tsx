import React, { useCallback, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { useTheme } from '../../context/theme.js';
import type { ConfirmDetails, ConfirmOutcome } from '@reason-cli/core';
import { ConfirmContentWrite } from './confirm-content-write.js';
import { ConfirmContentEdit } from './confirm-content-edit.js';
import { ConfirmContentExec } from './confirm-content-exec.js';

export interface PanelToolConfirmProps {
  /** 工具名称 */
  toolName: string;
  /** 确认详情 */
  details: ConfirmDetails;
  /** 确认回调（调用后面板会自动关闭） */
  onConfirm: (outcome: ConfirmOutcome) => void;
}

// 选项配置（提取到组件外部避免重复创建）
const OPTIONS = [
  { key: 'once', label: '[1] Allow once', outcome: 'once' as ConfirmOutcome },
  { key: 'always', label: '[2] Allow always', outcome: 'always' as ConfirmOutcome },
  { key: 'cancel', label: '[3] Cancel', outcome: 'cancel' as ConfirmOutcome },
];

/**
 * 根据 type 渲染对应的内容组件
 */
function renderContent(details: ConfirmDetails) {
  switch (details.type) {
    case 'info':
      // Write 工具：完整边框，fileName + contentPreview
      return (
        <ConfirmContentWrite fileName={details.fileName} contentPreview={details.contentPreview} />
      );
    case 'edit':
      // Edit 工具：上下虚线，只有 contentPreview
      return <ConfirmContentEdit contentPreview={details.contentPreview} />;
    case 'exec':
      // Exec 工具：无边框，command + message
      return <ConfirmContentExec command={details.command} message={details.message} />;
    default:
      return null;
  }
}

/**
 * 工具确认面板
 * 显示工具执行确认对话框，支持三种选择：
 * - Allow once: 仅本次允许
 * - Allow always: 总是允许（添加到 allowlist）
 * - Cancel: 取消执行
 */
export function PanelToolConfirm({ toolName, details, onConfirm }: PanelToolConfirmProps) {
  const { colors } = useTheme();
  const [selectedIndex, setSelectedIndex] = useState(0);

  // 处理键盘输入
  useInput(
    useCallback(
      (input, key) => {
        // 上下方向键：移动光标
        if (key.upArrow) {
          setSelectedIndex((prev) => (prev > 0 ? prev - 1 : OPTIONS.length - 1));
          return;
        }
        if (key.downArrow) {
          setSelectedIndex((prev) => (prev < OPTIONS.length - 1 ? prev + 1 : 0));
          return;
        }

        // Enter键：确认当前选择
        if (key.return) {
          onConfirm(OPTIONS[selectedIndex].outcome);
          return;
        }

        // Esc/C：取消
        if (key.escape || input.toLowerCase() === 'c') {
          onConfirm('cancel');
          return;
        }

        // 数字快捷键：直接选择
        if (input === '1' || input.toLowerCase() === 'o') {
          onConfirm('once');
        } else if (input === '2' || input.toLowerCase() === 'a') {
          onConfirm('always');
        }
      },
      [onConfirm, selectedIndex]
    )
  );

  return (
    <Box flexDirection="column" width="100%">
      {/* 顶部标题栏 */}
      <Box
        paddingX={1}
        paddingY={0}
        borderStyle="single"
        borderBottom
        borderLeft={false}
        borderRight={false}
        borderTop={false}
        borderColor={colors.borderSubtle}
        gap={2}
      >
        <Text color={colors.warning} bold>
          {details.panelTitle || 'Tool Confirmation Required'}
        </Text>
        {details.filePath && <Text color={colors.textMuted}>{details.filePath}</Text>}
      </Box>

      {/* 内容区域 - 根据 type 渲染不同组件 */}
      {/* <Box flexDirection="column" flexGrow={1} paddingX={1} paddingY={0}>
        {renderContent(details)}
      </Box> */}

      {/* 选项列表 */}
      <Box marginTop={1} flexDirection="column">
        {OPTIONS.map((option, index) => {
          const isSelected = index === selectedIndex;
          return (
            <Box key={option.key}>
              <Text color={isSelected ? colors.primary : colors.textMuted}>
                {isSelected ? '❯ ' : '  '}
              </Text>
              <Text color={isSelected ? colors.primary : colors.textMuted} bold={isSelected}>
                {option.label}
              </Text>
            </Box>
          );
        })}
      </Box>

      {/* 底部提示栏 */}
      <Box paddingX={1} paddingY={1}>
        <Text color={colors.textMuted}>Esc to cancel</Text>
      </Box>
    </Box>
  );
}
