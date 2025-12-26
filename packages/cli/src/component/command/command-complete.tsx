import React, { useRef, useEffect } from 'react';
import { Box, Text } from 'ink';
import { ScrollList, ScrollListRef } from 'ink-scroll-list';
import { useTheme } from '../../context/theme.js';
import type { CommandDef } from './command-registry.js';

export interface CommandCompleteProps {
  query: string;
  commands: CommandDef[];
  selectedIndex: number;
  onSelect: (command: CommandDef) => void;
  onCancel: () => void;
}

/**
 * 命令补全组件
 * 在输入框正下方显示命令列表
 * 使用 ink-scroll-list 实现滚动
 * 支持上下键导航、Tab/Enter 补全
 */
export function CommandComplete({ query, commands, selectedIndex }: CommandCompleteProps) {
  const { colors } = useTheme();
  const listRef = useRef<ScrollListRef>(null);

  // 当选中索引变化时，滚动到对应项
  useEffect(() => {
    if (selectedIndex >= 0 && listRef.current) {
      listRef.current.scrollToItem(selectedIndex, 'auto');
    }
  }, [selectedIndex]);

  if (commands.length === 0) {
    return (
      <Box borderStyle="round" borderColor={colors.border} paddingX={1} marginTop={1}>
        <Text color={colors.textMuted}>No commands found</Text>
      </Box>
    );
  }

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={colors.border}
      paddingX={1}
      marginTop={1}
    >
      {/* 命令列表 - 使用 ScrollList */}
      <Box height={Math.min(commands.length + 1, 8)} flexDirection="column">
        <ScrollList
          ref={listRef}
          selectedIndex={selectedIndex >= 0 ? selectedIndex : 0}
          scrollAlignment="auto"
        >
          {commands.map((command, index) => {
            const isSelected = index === selectedIndex;

            return (
              <Box key={command.id}>
                <Text color={isSelected ? colors.primary : colors.text}>
                  {isSelected ? '❯ ' : '  '}
                </Text>
                <Text color={isSelected ? colors.primary : colors.text} bold={isSelected}>
                  /{command.name}
                </Text>
                {command.description && (
                  <Text color={colors.textMuted}> - {command.description}</Text>
                )}
              </Box>
            );
          })}
        </ScrollList>
      </Box>

      {/* 提示文本 */}
      <Box marginTop={1}>
        <Text color={colors.textMuted}>
          {commands.length > 6 ? `${selectedIndex + 1}/${commands.length} · ` : ''}
          Tab/Enter to complete · Esc to cancel
        </Text>
      </Box>
    </Box>
  );
}
