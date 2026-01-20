/**
 * Markdown Token 渲染器（简化版）
 * 将 Token 渲染为 Ink 组件
 */

import React from 'react';
import { Box, Text } from 'ink';
import type { ThemeColors } from '../../context/theme.js';
import type {
  Token,
  TextToken,
  BoldToken,
  ItalicToken,
  CodeToken,
  CodeBlockToken,
  LinkToken,
  HeadingToken,
  ListToken,
  OrderedListToken,
  BlockquoteToken,
  FilePathToken,
  InsightToken,
} from './types.js';

/**
 * 渲染纯文本
 */
function renderText(token: TextToken, colors: ThemeColors, key: number) {
  return (
    <Text key={key} color={colors.text}>
      {token.content}
    </Text>
  );
}

/**
 * 渲染加粗文本（移除 **）
 */
function renderBold(token: BoldToken, colors: ThemeColors, key: number) {
  return (
    <Text key={key} bold color={colors.text}>
      {token.content}
    </Text>
  );
}

/**
 * 渲染斜体文本（移除 *）
 */
function renderItalic(token: ItalicToken, colors: ThemeColors, key: number) {
  return (
    <Text key={key} italic color={colors.textMuted}>
      {token.content}
    </Text>
  );
}

/**
 * 渲染行内代码（移除 `，蓝色显示）
 */
function renderCode(token: CodeToken, colors: ThemeColors, key: number) {
  return (
    <Text key={key} color={colors.markdownInlineCode}>
      {token.content}
    </Text>
  );
}

/**
 * 渲染链接（移除 []()，只显示文本）
 */
function renderLink(token: LinkToken, colors: ThemeColors, key: number) {
  return (
    <Text key={key} color={colors.info}>
      {token.text}
    </Text>
  );
}

/**
 * 渲染标题（保留 # 符号，绿色加粗显示）
 */
function renderHeading(token: HeadingToken, colors: ThemeColors, key: number) {
  const prefix = '#'.repeat(token.level) + ' ';
  return (
    <Text key={key} bold color={colors.markdownHeading}>
      {prefix}
      {token.content}
    </Text>
  );
}

/**
 * 渲染无序列表（保留 - 符号，符号变灰色）
 */
function renderList(token: ListToken, colors: ThemeColors, key: number) {
  return (
    <Text key={key}>
      <Text color={colors.textMuted}>{token.marker} </Text>
      <Text color={colors.text}>{token.content}</Text>
    </Text>
  );
}

/**
 * 渲染有序列表（保留数字和点，数字变灰色）
 */
function renderOrderedList(token: OrderedListToken, colors: ThemeColors, key: number) {
  return (
    <Text key={key}>
      <Text color={colors.textMuted}>{token.number} </Text>
      <Text color={colors.text}>{token.content}</Text>
    </Text>
  );
}

/**
 * 渲染引用（移除 >，用 │ 替代）
 */
function renderBlockquote(token: BlockquoteToken, colors: ThemeColors, key: number) {
  return (
    <Text key={key}>
      <Text color={colors.textMuted}>│ </Text>
      <Text color={colors.textMuted}>{token.content}</Text>
    </Text>
  );
}

/**
 * 渲染文件路径（保留原文本，蓝色显示）
 */
function renderFilePath(token: FilePathToken, colors: ThemeColors, key: number) {
  return (
    <Text key={key} color={colors.markdownFilePath}>
      {token.path}
    </Text>
  );
}

/**
 * 渲染代码块（简化版，暂时只显示内容）
 */
function renderCodeBlock(token: CodeBlockToken, colors: ThemeColors, key: number) {
  return (
    <Box
      key={key}
      flexDirection="column"
      borderStyle="round"
      borderColor={colors.border}
      paddingX={1}
    >
      {token.language && (
        <Text color={colors.textMuted} dimColor>
          {token.language}
        </Text>
      )}
      <Text color={colors.text}>{token.content}</Text>
    </Box>
  );
}

/**
 * 渲染 Insight 洞察块（黄色分隔线）
 */
function renderInsight(token: InsightToken, colors: ThemeColors, key: number) {
  const separator = '─'.repeat(45);
  return (
    <Box key={key} flexDirection="column">
      <Text color={colors.warning}>★ Insight {separator}</Text>
      <Text color={colors.text}>{token.content}</Text>
      <Text color={colors.warning}>{separator}</Text>
    </Box>
  );
}

/**
 * 根据 Token 类型渲染对应组件（行内元素）
 */
export function renderInlineToken(token: Token, colors: ThemeColors, key: number): React.ReactNode {
  switch (token.type) {
    case 'text':
      return renderText(token as TextToken, colors, key);
    case 'bold':
      return renderBold(token as BoldToken, colors, key);
    case 'italic':
      return renderItalic(token as ItalicToken, colors, key);
    case 'code':
      return renderCode(token as CodeToken, colors, key);
    case 'link':
      return renderLink(token as LinkToken, colors, key);
    case 'filePath':
      return renderFilePath(token as FilePathToken, colors, key);
    default:
      return null;
  }
}

/**
 * 根据 Token 类型渲染对应组件
 */
export function renderToken(token: Token, colors: ThemeColors, key: number): React.ReactNode {
  switch (token.type) {
    case 'text':
      return renderText(token as TextToken, colors, key);
    case 'bold':
      return renderBold(token as BoldToken, colors, key);
    case 'italic':
      return renderItalic(token as ItalicToken, colors, key);
    case 'code':
      return renderCode(token as CodeToken, colors, key);
    case 'codeBlock':
      return renderCodeBlock(token as CodeBlockToken, colors, key);
    case 'link':
      return renderLink(token as LinkToken, colors, key);
    case 'heading':
      return renderHeading(token as HeadingToken, colors, key);
    case 'list':
      return renderList(token as ListToken, colors, key);
    case 'orderedList':
      return renderOrderedList(token as OrderedListToken, colors, key);
    case 'blockquote':
      return renderBlockquote(token as BlockquoteToken, colors, key);
    case 'filePath':
      return renderFilePath(token as FilePathToken, colors, key);
    case 'insight':
      return renderInsight(token as InsightToken, colors, key);
    case 'newline':
      return null; // 换行由布局处理，不单独渲染
    default:
      return null;
  }
}

/**
 * 渲染 Token 数组
 */
export function renderTokens(tokens: Token[], colors: ThemeColors): React.ReactNode[] {
  return tokens.map((token, index) => renderToken(token, colors, index)).filter(Boolean);
}
