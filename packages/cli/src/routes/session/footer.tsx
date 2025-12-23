import React from 'react'
import { Box, Text, useStdout } from 'ink'
import { useTheme } from '../../context/theme.js'

export function Footer() {
  const { colors } = useTheme()
  const { stdout } = useStdout()
  const cwd = process.cwd()
  const termWidth = stdout?.columns || 80
  
  // 截断路径以适应屏幕
  const maxPathLen = Math.max(20, termWidth - 50)
  const displayPath = cwd.length > maxPathLen 
    ? '...' + cwd.slice(-(maxPathLen - 3))
    : cwd

  // #region agent log
  fetch('http://127.0.0.1:7244/ingest/887ddd48-177a-4a35-abaf-79465e0f7040',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'footer.tsx:Footer',message:'Footer render',data:{termWidth,cwdLen:cwd.length,displayPathLen:displayPath.length},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'E'})}).catch(()=>{});
  // #endregion

  return (
    <Box flexShrink={0}>
      {/* 左侧：当前目录路径 */}
      <Text color={colors.textMuted}>{displayPath}</Text>
      
      {/* 中间填充 */}
      <Box flexGrow={1} />
      
      {/* 右侧：快捷键提示 */}
      <Box gap={2}>
        <Text>
          <Text color={colors.text} bold>tab</Text>
          <Text color={colors.textMuted}> switch agent</Text>
        </Text>
        <Text>
          <Text color={colors.text} bold>ctrl+p</Text>
          <Text color={colors.textMuted}> commands</Text>
        </Text>
      </Box>
    </Box>
  )
}
