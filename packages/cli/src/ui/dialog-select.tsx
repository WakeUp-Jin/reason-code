import React, { useState, useMemo, useCallback } from 'react'
import { Box, Text, useInput } from 'ink'
import TextInput from 'ink-text-input'
import fuzzysort from 'fuzzysort'
import { useTheme } from '../context/theme.js'
import { Dialog, DialogOverlay, DialogHints } from './dialog.js'

export interface SelectOption<T = unknown> {
  id: string
  label: string
  description?: string
  category?: string
  value: T
  disabled?: boolean
}

export interface DialogSelectProps<T = unknown> {
  title?: string
  placeholder?: string
  options: SelectOption<T>[]
  onSelect: (option: SelectOption<T>) => void
  onCancel: () => void
  showSearch?: boolean
  maxHeight?: number
}

/**
 * 模糊搜索选择对话框
 * 支持键盘导航、分类显示、模糊搜索
 */
export function DialogSelect<T = unknown>({
  title = 'Select',
  placeholder = 'Search...',
  options,
  onSelect,
  onCancel,
  showSearch = true,
  maxHeight = 10,
}: DialogSelectProps<T>) {
  const { colors } = useTheme()
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)

  // 模糊搜索过滤
  const filteredOptions = useMemo(() => {
    if (!query.trim()) {
      return options.filter((o) => !o.disabled)
    }

    const results = fuzzysort.go(query, options, {
      keys: ['label', 'description', 'category'],
      threshold: -10000,
    })

    return results.map((r) => r.obj).filter((o) => !o.disabled)
  }, [options, query])

  // 按分类分组
  const groupedOptions = useMemo(() => {
    const groups = new Map<string | undefined, SelectOption<T>[]>()

    for (const option of filteredOptions) {
      const category = option.category
      if (!groups.has(category)) {
        groups.set(category, [])
      }
      groups.get(category)!.push(option)
    }

    return groups
  }, [filteredOptions])

  // 扁平化列表（用于索引计算）
  const flatList = useMemo(() => {
    const list: Array<{ type: 'category' | 'option'; data: string | SelectOption<T> }> = []

    for (const [category, items] of groupedOptions) {
      if (category) {
        list.push({ type: 'category', data: category })
      }
      for (const item of items) {
        list.push({ type: 'option', data: item })
      }
    }

    return list
  }, [groupedOptions])

  // 只计算可选项的索引
  const selectableIndices = useMemo(() => {
    return flatList
      .map((item, index) => (item.type === 'option' ? index : -1))
      .filter((i) => i >= 0)
  }, [flatList])

  // 确保 selectedIndex 在有效范围内
  const validSelectedIndex = useMemo(() => {
    if (selectableIndices.length === 0) return -1
    if (selectedIndex >= selectableIndices.length) return selectableIndices.length - 1
    return selectedIndex
  }, [selectedIndex, selectableIndices])

  const currentFlatIndex = selectableIndices[validSelectedIndex] ?? -1

  // 键盘输入处理
  useInput((input, key) => {
    // Escape 取消
    if (key.escape) {
      onCancel()
      return
    }

    // Enter 选择
    if (key.return) {
      if (currentFlatIndex >= 0) {
        const item = flatList[currentFlatIndex]
        if (item.type === 'option') {
          onSelect(item.data as SelectOption<T>)
        }
      }
      return
    }

    // 上下键导航
    if (key.upArrow) {
      setSelectedIndex((prev) => Math.max(0, prev - 1))
      return
    }

    if (key.downArrow) {
      setSelectedIndex((prev) => Math.min(selectableIndices.length - 1, prev + 1))
      return
    }
  })

  // 当搜索内容改变时重置选择
  const handleQueryChange = useCallback((value: string) => {
    setQuery(value)
    setSelectedIndex(0)
  }, [])

  // 渲染选项
  const renderOption = (option: SelectOption<T>, isSelected: boolean) => {
    return (
      <Box key={option.id}>
        <Text color={isSelected ? colors.primary : colors.text}>
          {isSelected ? '❯ ' : '  '}
        </Text>
        <Text
          color={isSelected ? colors.primary : colors.text}
          bold={isSelected}
        >
          {option.label}
        </Text>
        {option.description && (
          <Text color={colors.textMuted}> - {option.description}</Text>
        )}
      </Box>
    )
  }

  // 渲染分类标题
  const renderCategory = (category: string) => {
    return (
      <Box key={`cat-${category}`} marginTop={1}>
        <Text color={colors.secondary} bold>
          {category}
        </Text>
      </Box>
    )
  }

  // 计算可见区域
  const visibleStart = Math.max(0, validSelectedIndex - Math.floor(maxHeight / 2))
  const visibleEnd = Math.min(flatList.length, visibleStart + maxHeight)

  const visibleItems = flatList.slice(visibleStart, visibleEnd)

  return (
    <DialogOverlay>
      <Dialog
        title={title}
        footer={
          <DialogHints
            hints={[
              { key: '↑↓', label: 'Navigate' },
              { key: 'Enter', label: 'Select' },
              { key: 'Esc', label: 'Cancel' },
            ]}
          />
        }
      >
        {/* 搜索框 */}
        {showSearch && (
          <Box marginBottom={1}>
            <Text color={colors.textMuted}>❯ </Text>
            <TextInput
              value={query}
              onChange={handleQueryChange}
              placeholder={placeholder}
            />
          </Box>
        )}

        {/* 选项列表 */}
        <Box flexDirection="column">
          {filteredOptions.length === 0 ? (
            <Text color={colors.textMuted}>No results found</Text>
          ) : (
            visibleItems.map((item, index) => {
              const actualIndex = visibleStart + index
              if (item.type === 'category') {
                return renderCategory(item.data as string)
              }
              const option = item.data as SelectOption<T>
              const isSelected = actualIndex === currentFlatIndex
              return renderOption(option, isSelected)
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
      </Dialog>
    </DialogOverlay>
  )
}

