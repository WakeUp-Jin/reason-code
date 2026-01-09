import React, { useState, useMemo, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import fuzzysort from 'fuzzysort';
import { useTheme } from '../context/theme.js';

export interface SelectOption<T = unknown> {
  id: string;
  label: string;
  description?: string;
  category?: string;
  value: T;
  disabled?: boolean;
  isCurrent?: boolean; // 标识当前选中的选项（用于绿色高亮）
}

export interface PanelSelectProps<T = unknown> {
  title?: string;
  placeholder?: string;
  options: SelectOption<T>[];
  onSelect: (option: SelectOption<T>) => void;
  onCancel: () => void;
  showSearch?: boolean;
  maxHeight?: number;
}

// 扁平列表项类型
type FlatListItem<T> =
  | { type: 'category'; data: string }
  | { type: 'option'; data: SelectOption<T> };

/**
 * 面板式选择组件
 * 支持键盘导航、分类显示、模糊搜索
 */
export function PanelSelect<T = unknown>({
  title = 'Select',
  placeholder = 'Search...',
  options,
  onSelect,
  onCancel,
  showSearch = true,
  maxHeight = 10,
}: PanelSelectProps<T>) {
  const { colors } = useTheme();
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  // 模糊搜索过滤
  const filteredOptions = useMemo(() => {
    if (!query.trim()) {
      return options.filter((o) => !o.disabled);
    }

    const results = fuzzysort.go(query, options, {
      keys: ['label', 'description', 'category'],
      threshold: -10000,
    });

    return results.map((r) => r.obj).filter((o) => !o.disabled);
  }, [options, query]);

  // 按 category 分组
  const groupedOptions = useMemo(() => {
    const groups = new Map<string | undefined, SelectOption<T>[]>();

    for (const option of filteredOptions) {
      const category = option.category;
      if (!groups.has(category)) {
        groups.set(category, []);
      }
      groups.get(category)!.push(option);
    }

    return groups;
  }, [filteredOptions]);

  // 扁平化列表（包含分类标题和选项）
  const flatList = useMemo(() => {
    const list: FlatListItem<T>[] = [];

    for (const [category, items] of groupedOptions) {
      if (category) {
        list.push({ type: 'category', data: category });
      }
      for (const item of items) {
        list.push({ type: 'option', data: item });
      }
    }

    return list;
  }, [groupedOptions]);

  // 只包含选项的索引（用于导航）
  const selectableIndices = useMemo(() => {
    return flatList
      .map((item, index) => (item.type === 'option' ? index : -1))
      .filter((index) => index !== -1);
  }, [flatList]);

  // 确保 selectedIndex 在有效范围内（只在选项索引中）
  const validSelectedIndex = useMemo(() => {
    if (selectableIndices.length === 0) return -1;
    if (selectedIndex >= selectableIndices.length) return selectableIndices.length - 1;
    return selectedIndex;
  }, [selectedIndex, selectableIndices]);

  // 当前选中的扁平列表索引
  const currentFlatIndex = useMemo(() => {
    return selectableIndices[validSelectedIndex] ?? -1;
  }, [selectableIndices, validSelectedIndex]);

  // 键盘输入处理
  useInput((input, key) => {
    // Escape 取消
    if (key.escape) {
      onCancel();
      return;
    }

    // Enter 选择
    if (key.return) {
      if (currentFlatIndex >= 0 && currentFlatIndex < flatList.length) {
        const item = flatList[currentFlatIndex];
        if (item.type === 'option') {
          onSelect(item.data);
        }
      }
      return;
    }

    // 上下键导航（只在选项间移动）
    if (key.upArrow) {
      setSelectedIndex((prev) => Math.max(0, prev - 1));
      return;
    }

    if (key.downArrow) {
      setSelectedIndex((prev) => Math.min(selectableIndices.length - 1, prev + 1));
      return;
    }
  });

  // 当搜索内容改变时重置选择
  const handleQueryChange = useCallback((value: string) => {
    setQuery(value);
    setSelectedIndex(0);
  }, []);

  // 渲染分类标题
  const renderCategory = (category: string) => {
    return (
      <Box key={`cat-${category}`} marginTop={1}>
        <Text color={colors.secondary} bold>
          {category}
        </Text>
      </Box>
    );
  };

  // 渲染选项
  const renderOption = (option: SelectOption<T>, isSelected: boolean) => {
    // 颜色优先级：光标选中 > 当前项 > 普通项
    const textColor = isSelected
      ? colors.primary // 🟣 光标选中：紫色
      : option.isCurrent
        ? colors.success // 🟢 当前项：绿色
        : colors.text; // 📝 普通项：米色

    return (
      <Box key={option.id}>
        <Text color={textColor}>{isSelected ? '❯ ' : '  '}</Text>
        <Text color={textColor} bold={isSelected || option.isCurrent}>
          {option.label}
        </Text>
        {option.description && <Text color={colors.textMuted}> - {option.description}</Text>}
      </Box>
    );
  };

  // 计算可见区域
  const visibleStart = Math.max(0, currentFlatIndex - Math.floor(maxHeight / 2));
  const visibleEnd = Math.min(flatList.length, visibleStart + maxHeight);

  const visibleItems = flatList.slice(visibleStart, visibleEnd);

  return (
    <Box flexDirection="column" width="100%">
      {/* 顶部标题栏 */}
      {title && (
        <Text color={colors.primary} bold>
          {title}
        </Text>
      )}

      {/* 内容区域 */}
      <Box flexDirection="column" flexGrow={1} paddingX={2} paddingY={1}>
        {/* 搜索框 */}
        {showSearch && (
          <Box marginBottom={1}>
            <Text color={colors.textMuted}>❯ </Text>
            <TextInput value={query} onChange={handleQueryChange} placeholder={placeholder} />
          </Box>
        )}

        {/* 选项列表 */}
        <Box flexDirection="column">
          {flatList.length === 0 ? (
            <Text color={colors.textMuted}>No results found</Text>
          ) : (
            visibleItems.map((item, index) => {
              const actualIndex = visibleStart + index;
              if (item.type === 'category') {
                return renderCategory(item.data);
              }
              const isSelected = actualIndex === currentFlatIndex;
              return renderOption(item.data, isSelected);
            })
          )}
        </Box>

        {/* 滚动指示器 */}
        {flatList.length > maxHeight && (
          <Box marginTop={1}>
            <Text color={colors.textMuted}>
              {visibleStart > 0 ? '↑ ' : '  '}
              {validSelectedIndex + 1}/{selectableIndices.length}
              {visibleEnd < flatList.length ? ' ↓' : '  '}
            </Text>
          </Box>
        )}
      </Box>

      {/* 底部提示栏 */}
      <Box gap={3}>
        <Text>
          <Text color={colors.primary} bold>
            ↑↓
          </Text>
          <Text color={colors.textMuted}> Navigate</Text>
        </Text>
        <Text>
          <Text color={colors.primary} bold>
            Enter
          </Text>
          <Text color={colors.textMuted}> Select</Text>
        </Text>
        <Text>
          <Text color={colors.primary} bold>
            Esc
          </Text>
          <Text color={colors.textMuted}> Cancel</Text>
        </Text>
      </Box>
    </Box>
  );
}
