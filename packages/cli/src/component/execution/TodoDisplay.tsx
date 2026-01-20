/**
 * TODO 列表显示组件
 * 使用 Unicode 字符 + 删除线的视觉样式
 *
 * 视觉效果：
 * ☑ 确定旅行天数和整体主题    （绿色 + 删除线）
 * ◉ 规划经典必游景点          （黄色高亮）
 * ☐ 推荐地道美食体验          （默认颜色）
 * ⊠ 已取消的任务              （灰色 + 删除线）
 */

import React from 'react';
import { Box, Text } from 'ink';
import { useTheme } from '../../context/theme.js';
import type { TodoItem, TodoStatus } from '@reason-cli/core';

/**
 * Unicode 图标定义
 */
const TODO_ICONS = {
  PENDING: '☐', // U+2610 Ballot Box - 待处理
  IN_PROGRESS: '◉', // U+25C9 Fisheye - 进行中
  COMPLETED: '☑', // U+2611 Ballot Box with Check - 已完成
  CANCELLED: '⊠', // U+22A0 Squared Times - 已取消
} as const;

/**
 * 根据状态获取图标
 */
function getTodoIcon(status: TodoStatus): string {
  switch (status) {
    case 'pending':
      return TODO_ICONS.PENDING;
    case 'in_progress':
      return TODO_ICONS.IN_PROGRESS;
    case 'completed':
      return TODO_ICONS.COMPLETED;
    case 'cancelled':
      return TODO_ICONS.CANCELLED;
    default:
      return TODO_ICONS.PENDING;
  }
}

interface TodoItemDisplayProps {
  todo: TodoItem;
}

/**
 * 单个 TODO 项显示组件
 */
function TodoItemDisplay({ todo }: TodoItemDisplayProps) {
  const { colors } = useTheme();

  const icon = getTodoIcon(todo.status);

  // 根据状态选择颜色
  const color =
    todo.status === 'completed'
      ? colors.success // 绿色
      : todo.status === 'cancelled'
        ? colors.textMuted // 灰色
        : todo.status === 'in_progress'
          ? colors.warning // 黄色高亮
          : colors.text; // 默认颜色

  // 是否需要删除线
  const isStrikethrough = todo.status === 'completed' || todo.status === 'cancelled';

  // 是否变暗（已完成或已取消）
  const isDimmed = todo.status === 'completed' || todo.status === 'cancelled';

  return (
    <Box>
      <Text color={color} bold={todo.status === 'in_progress'}>
        {icon}{' '}
      </Text>
      <Text color={color} strikethrough={isStrikethrough} dimColor={isDimmed}>
        {todo.content}
      </Text>
    </Box>
  );
}

interface TodoDisplayProps {
  todos: TodoItem[];
}

/**
 * TODO 列表显示组件
 */
export function TodoDisplay({ todos }: TodoDisplayProps) {
  if (todos.length === 0) {
    return null;
  }

  return (
    <Box flexDirection="column" marginTop={1} paddingLeft={2}>
      {todos.map((todo) => (
        <TodoItemDisplay key={todo.id} todo={todo} />
      ))}
    </Box>
  );
}
