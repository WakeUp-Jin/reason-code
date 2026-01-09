import React from 'react';
import { Box, Text } from 'ink';
import { useTheme } from '../../context/theme.js';

export interface ConfirmContentWriteProps {
  /** 文件名（边框内第一行显示） */
  fileName?: string;
  /** 内容预览 */
  contentPreview?: string;
}

/**
 * Write 工具确认内容组件
 * 完整边框包裹：第一行文件名，下面是代码内容
 */
export function ConfirmContentWrite({ fileName, contentPreview }: ConfirmContentWriteProps) {
  const { colors } = useTheme();

  // 将内容按行分割并添加行号
  const lines = contentPreview?.split('\n') || [];
  const lineNumberWidth = String(lines.length).length;

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={colors.border} marginTop={1}>
      {/* 文件名 */}
      {fileName && (
        <Box paddingX={1} paddingY={0}>
          <Text color={colors.text} bold>
            {fileName}
          </Text>
        </Box>
      )}

      {/* 代码内容（带行号） */}
      {contentPreview && (
        <Box flexDirection="column" paddingX={1} paddingBottom={1}>
          {lines.map((line, index) => (
            <Box key={index}>
              {/* 行号 */}
              <Box width={lineNumberWidth + 2} marginRight={1}>
                <Text color={colors.textMuted} dimColor>
                  {String(index + 1).padStart(lineNumberWidth, ' ')}
                </Text>
                <Text color={colors.borderSubtle}> │</Text>
              </Box>
              {/* 代码内容 */}
              <Text color={colors.text}>{line}</Text>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}
