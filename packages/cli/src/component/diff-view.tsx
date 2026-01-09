import React from 'react'
import { Box, Text } from 'ink'
import { diffLines, type Change } from 'diff'
import { useTheme } from '../context/theme.js'

export interface DiffViewProps {
  oldText: string
  newText: string
  oldLabel?: string
  newLabel?: string
  context?: number
}

/**
 * Diff 显示组件
 * 显示两段文本的差异
 */
export function DiffView({
  oldText,
  newText,
  oldLabel = 'Original',
  newLabel = 'Modified',
  context = 3,
}: DiffViewProps) {
  const { colors } = useTheme()

  // 计算差异
  const changes = diffLines(oldText, newText)

  // 生成带行号的差异显示
  let oldLineNum = 1
  let newLineNum = 1

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={colors.border}>
      {/* 文件标签 */}
      <Box paddingX={2} paddingY={0} borderStyle="single" borderBottom borderTop={false} borderLeft={false} borderRight={false} borderColor={colors.borderSubtle}>
        <Box flexGrow={1}>
          <Text color={colors.diffRemoved}>--- {oldLabel}</Text>
        </Box>
        <Box>
          <Text color={colors.diffAdded}>+++ {newLabel}</Text>
        </Box>
      </Box>

      {/* 差异内容 */}
      <Box flexDirection="column" paddingX={1}>
        {changes.map((change, changeIndex) => {
          const lines = change.value.split('\n').filter((_, i, arr) =>
            // 过滤掉最后一个空行（split 产生的）
            i < arr.length - 1 || arr[i] !== ''
          )

          return lines.map((line, lineIndex) => {
            const key = `${changeIndex}-${lineIndex}`

            if (change.added) {
              // 新增行
              const lineNum = newLineNum++
              return (
                <Box key={key}>
                  <Box width={4}>
                    <Text color={colors.textMuted}> </Text>
                  </Box>
                  <Box width={4}>
                    <Text color={colors.diffAdded}>{lineNum}</Text>
                  </Box>
                  <Text color={colors.diffAdded} bold> + </Text>
                  <Text color={colors.diffAdded}>{line}</Text>
                </Box>
              )
            } else if (change.removed) {
              // 删除行
              const lineNum = oldLineNum++
              return (
                <Box key={key}>
                  <Box width={4}>
                    <Text color={colors.diffRemoved}>{lineNum}</Text>
                  </Box>
                  <Box width={4}>
                    <Text color={colors.textMuted}> </Text>
                  </Box>
                  <Text color={colors.diffRemoved} bold> - </Text>
                  <Text color={colors.diffRemoved}>{line}</Text>
                </Box>
              )
            } else {
              // 未变化行
              const oldNum = oldLineNum++
              const newNum = newLineNum++
              return (
                <Box key={key}>
                  <Box width={4}>
                    <Text color={colors.textMuted}>{oldNum}</Text>
                  </Box>
                  <Box width={4}>
                    <Text color={colors.textMuted}>{newNum}</Text>
                  </Box>
                  <Text color={colors.diffContext}>   </Text>
                  <Text color={colors.diffContext}>{line}</Text>
                </Box>
              )
            }
          })
        })}
      </Box>
    </Box>
  )
}

/**
 * 简化的单文件 Diff 显示
 */
export interface InlineDiffProps {
  changes: Array<{
    type: 'add' | 'remove' | 'context'
    content: string
    lineNumber?: number
  }>
}

export function InlineDiff({ changes }: InlineDiffProps) {
  const { colors } = useTheme()

  const typeConfig = {
    add: {
      prefix: '+',
      color: colors.diffAdded,
    },
    remove: {
      prefix: '-',
      color: colors.diffRemoved,
    },
    context: {
      prefix: ' ',
      color: colors.diffContext,
    },
  }

  return (
    <Box flexDirection="column">
      {changes.map((change, index) => {
        const config = typeConfig[change.type]
        return (
          <Box key={index}>
            {change.lineNumber !== undefined && (
              <Box width={4}>
                <Text color={colors.textMuted}>{change.lineNumber}</Text>
              </Box>
            )}
            <Text color={config.color} bold={change.type !== 'context'}>
              {config.prefix}
            </Text>
            <Text color={config.color}> {change.content}</Text>
          </Box>
        )
      })}
    </Box>
  )
}

