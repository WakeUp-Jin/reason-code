/**
 * MarkdownText 组件（极简版）
 * 只处理：加粗、标题、行内代码
 */

import React from 'react';
import { Text } from 'ink';
import { useTheme, type ThemeColors } from '../../context/theme.js';

export interface MarkdownTextProps {
  /** Markdown 文本内容 */
  content: string;
}

const FILE_PATH_PATTERN =
  /^(~\/|\.\.\/|\.\/|\/|[A-Za-z]:\\|[A-Za-z]:\/|[ab]\/|[A-Za-z0-9_.-]+\/)[^\s`*]+/;

/**
 * 解析并渲染一行文本中的行内元素
 * 支持：**加粗**、`行内代码`
 */
function renderInlineElements(text: string, colors: ThemeColors): React.ReactNode[] {
  const result: React.ReactNode[] = [];
  let i = 0;
  let key = 0;
  let textBuffer = '';

  const flushText = () => {
    if (textBuffer) {
      result.push(
        <Text key={key++} color={colors.text}>
          {textBuffer}
        </Text>
      );
      textBuffer = '';
    }
  };

  while (i < text.length) {
    // 检查加粗 **text**
    if (text[i] === '*' && text[i + 1] === '*') {
      const endIndex = text.indexOf('**', i + 2);
      if (endIndex !== -1) {
        flushText();
        const content = text.slice(i + 2, endIndex);
        result.push(
          <Text key={key++} bold color={colors.text}>
            {content}
          </Text>
        );
        i = endIndex + 2;
        continue;
      }
    }

    // 检查行内代码 `code`
    if (text[i] === '`') {
      const endIndex = text.indexOf('`', i + 1);
      if (endIndex !== -1) {
        flushText();
        const content = text.slice(i + 1, endIndex);
        result.push(
          <Text key={key++} color={colors.markdownInlineCode}>
            {content}
          </Text>
        );
        i = endIndex + 1;
        continue;
      }
    }

    // 检查文件路径（如 /a/b、src/a.ts:12）
    const filePathMatch = FILE_PATH_PATTERN.exec(text.slice(i));
    if (filePathMatch) {
      const raw = filePathMatch[0];
      const path = raw.replace(/[),\].,;]+$/, '');
      const trailing = raw.slice(path.length);

      flushText();
      result.push(
        <Text key={key++} color={colors.markdownFilePath}>
          {path}
        </Text>
      );
      if (trailing) {
        result.push(
          <Text key={key++} color={colors.text}>
            {trailing}
          </Text>
        );
      }
      i += raw.length;
      continue;
    }

    // 普通字符
    textBuffer += text[i];
    i++;
  }

  flushText();
  return result;
}

/**
 * 渲染单行
 */
function renderLine(line: string, colors: ThemeColors, lineKey: number): React.ReactNode {
  // 检查标题 # Title（移除 #，使用主题标题绿加粗显示）
  const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
  if (headingMatch) {
    return (
      <Text key={lineKey} bold color={colors.markdownHeading}>
        {headingMatch[2]}
      </Text>
    );
  }

  // 普通行，解析行内元素
  const elements = renderInlineElements(line, colors);

  // 如果只有一个元素，直接返回
  if (elements.length === 1) {
    return React.cloneElement(elements[0] as React.ReactElement, { key: lineKey });
  }

  // 多个元素，包裹在 Text 中
  return <Text key={lineKey}>{elements}</Text>;
}

/**
 * MarkdownText 组件
 *
 * 支持：
 * - **加粗** → 白色粗体（移除 **）
 * - `代码` → 蓝色（移除 `）
 * - # 标题 → 粗体（移除 #）
 */
export function MarkdownText({ content }: MarkdownTextProps) {
  const { colors } = useTheme();

  if (!content) return null;

  // 按行分割
  const lines = content.split('\n');

  // 渲染每一行，用 \n 连接
  return (
    <Text>
      {lines.map((line, i) => (
        <React.Fragment key={i}>
          {renderLine(line, colors, i)}
          {i < lines.length - 1 && '\n'}
        </React.Fragment>
      ))}
    </Text>
  );
}

// 导出类型
export type { ParseOptions } from './types.js';
