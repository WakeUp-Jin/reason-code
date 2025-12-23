import React from 'react'
import { Box, Text } from 'ink'
import hljs from 'highlight.js'
import { useTheme } from '../context/theme.js'

export interface CodeBlockProps {
  code: string
  language?: string
  showLineNumbers?: boolean
  startLine?: number
}

/**
 * 将 highlight.js 的类名映射到主题颜色
 */
function getColorForClass(className: string, colors: Record<string, string>): string {
  const classMap: Record<string, string> = {
    'hljs-comment': colors.syntaxComment,
    'hljs-quote': colors.syntaxComment,
    'hljs-keyword': colors.syntaxKeyword,
    'hljs-selector-tag': colors.syntaxKeyword,
    'hljs-built_in': colors.syntaxKeyword,
    'hljs-name': colors.syntaxKeyword,
    'hljs-function': colors.syntaxFunction,
    'hljs-title': colors.syntaxFunction,
    'hljs-string': colors.syntaxString,
    'hljs-template-string': colors.syntaxString,
    'hljs-regexp': colors.syntaxString,
    'hljs-number': colors.syntaxNumber,
    'hljs-literal': colors.syntaxNumber,
    'hljs-type': colors.syntaxType,
    'hljs-class': colors.syntaxType,
    'hljs-symbol': colors.syntaxOperator,
    'hljs-operator': colors.syntaxOperator,
    'hljs-variable': colors.text,
    'hljs-attr': colors.syntaxType,
    'hljs-attribute': colors.syntaxType,
    'hljs-params': colors.text,
  }

  // 查找匹配的类
  for (const [cls, color] of Object.entries(classMap)) {
    if (className.includes(cls)) {
      return color
    }
  }

  return colors.text
}

/**
 * 解析 highlight.js 输出的 HTML
 * 转换为 Ink 可渲染的结构
 */
function parseHighlightedCode(
  html: string,
  colors: Record<string, string>
): React.ReactNode[] {
  const result: React.ReactNode[] = []
  let key = 0

  // 简单的 HTML 解析器
  // 匹配 <span class="...">...</span> 或纯文本
  const regex = /<span class="([^"]*)">(.*?)<\/span>|([^<]+)/g
  let match

  while ((match = regex.exec(html)) !== null) {
    if (match[1] && match[2]) {
      // 带样式的 span
      const className = match[1]
      const text = match[2]
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#x27;/g, "'")

      const color = getColorForClass(className, colors)
      result.push(
        <Text key={key++} color={color}>
          {text}
        </Text>
      )
    } else if (match[3]) {
      // 纯文本
      const text = match[3]
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#x27;/g, "'")

      result.push(
        <Text key={key++} color={colors.text}>
          {text}
        </Text>
      )
    }
  }

  return result
}

/**
 * 代码块组件
 * 支持语法高亮和行号显示
 */
export function CodeBlock({
  code,
  language,
  showLineNumbers = true,
  startLine = 1,
}: CodeBlockProps) {
  const { colors } = useTheme()

  // 高亮代码
  let highlightedCode: string
  try {
    if (language && hljs.getLanguage(language)) {
      highlightedCode = hljs.highlight(code, { language }).value
    } else {
      highlightedCode = hljs.highlightAuto(code).value
    }
  } catch {
    // 如果高亮失败，使用原始代码
    highlightedCode = code
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
  }

  // 分割成行
  const lines = highlightedCode.split('\n')
  const lineNumberWidth = String(startLine + lines.length - 1).length

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={colors.border}
      paddingX={1}
    >
      {/* 语言标签 */}
      {language && (
        <Box marginBottom={1}>
          <Text color={colors.textMuted} dimColor>
            {language}
          </Text>
        </Box>
      )}

      {/* 代码行 */}
      {lines.map((line, index) => (
        <Box key={index}>
          {/* 行号 */}
          {showLineNumbers && (
            <Box width={lineNumberWidth + 2} marginRight={1}>
              <Text color={colors.textMuted} dimColor>
                {String(startLine + index).padStart(lineNumberWidth, ' ')}
              </Text>
              <Text color={colors.borderSubtle}> │</Text>
            </Box>
          )}

          {/* 代码内容 */}
          <Box>
            {parseHighlightedCode(line, colors)}
          </Box>
        </Box>
      ))}
    </Box>
  )
}

