/**
 * Markdown 解析器（简化版）
 * 将 Markdown 文本解析为 Token 流
 * 
 * 优先处理：加粗、斜体、行内代码、标题、列表、引用
 * 暂不处理：代码块（保持原样）
 */

import type {
  Token,
  TextToken,
  BoldToken,
  ItalicToken,
  CodeToken,
  LinkToken,
  HeadingToken,
  ListToken,
  OrderedListToken,
  BlockquoteToken,
  InsightToken,
  NewlineToken,
  ParseOptions,
} from './types.js';

/**
 * Insight 块正则（不带反引号，更宽松）
 */
const INSIGHT_PATTERN = /★ Insight ─+\n([\s\S]*?)\n─+/g;

/**
 * 解析行内元素（简化版）
 * 处理：加粗、斜体、行内代码、链接
 */
function parseInlineElements(text: string): Token[] {
  if (!text) return [];
  
  const tokens: Token[] = [];
  
  // 使用状态机方式解析，避免正则复杂度
  let i = 0;
  let textBuffer = '';
  
  const flushText = () => {
    if (textBuffer) {
      tokens.push({ type: 'text', content: textBuffer } as TextToken);
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
        tokens.push({ type: 'bold', content } as BoldToken);
        i = endIndex + 2;
        continue;
      }
    }
    
    // 检查斜体 *text*（单个 *，不是 **）
    if (text[i] === '*' && text[i + 1] !== '*' && (i === 0 || text[i - 1] !== '*')) {
      const endIndex = findSingleAsterisk(text, i + 1);
      if (endIndex !== -1) {
        flushText();
        const content = text.slice(i + 1, endIndex);
        tokens.push({ type: 'italic', content } as ItalicToken);
        i = endIndex + 1;
        continue;
      }
    }
    
    // 检查行内代码 `code`
    if (text[i] === '`') {
      const endIndex = text.indexOf('`', i + 1);
      if (endIndex !== -1) {
        flushText();
        const content = text.slice(i + 1, endIndex);
        tokens.push({ type: 'code', content } as CodeToken);
        i = endIndex + 1;
        continue;
      }
    }
    
    // 检查链接 [text](url)
    if (text[i] === '[') {
      const closeBracket = text.indexOf(']', i + 1);
      if (closeBracket !== -1 && text[closeBracket + 1] === '(') {
        const closeParen = text.indexOf(')', closeBracket + 2);
        if (closeParen !== -1) {
          flushText();
          const linkText = text.slice(i + 1, closeBracket);
          const url = text.slice(closeBracket + 2, closeParen);
          tokens.push({ type: 'link', text: linkText, url } as LinkToken);
          i = closeParen + 1;
          continue;
        }
      }
    }
    
    // 普通字符
    textBuffer += text[i];
    i++;
  }
  
  flushText();
  
  return tokens.length > 0 ? tokens : [{ type: 'text', content: text } as TextToken];
}

/**
 * 查找单个 * 的位置（不是 ** 的一部分）
 */
function findSingleAsterisk(text: string, startIndex: number): number {
  for (let i = startIndex; i < text.length; i++) {
    if (text[i] === '*') {
      // 确保不是 ** 的一部分
      if (text[i + 1] !== '*' && (i === 0 || text[i - 1] !== '*')) {
        return i;
      }
    }
  }
  return -1;
}

/**
 * 解析单行文本
 */
function parseLine(line: string): Token[] {
  // 检查标题 # Title
  const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
  if (headingMatch) {
    return [{
      type: 'heading',
      level: headingMatch[1].length,
      content: headingMatch[2],
    } as HeadingToken];
  }
  
  // 检查无序列表 - item
  const listMatch = line.match(/^(\s*)([-*+])\s+(.+)$/);
  if (listMatch) {
    return [{
      type: 'list',
      marker: listMatch[2],
      content: listMatch[3],
      indent: listMatch[1].length,
    } as ListToken];
  }
  
  // 检查有序列表 1. item
  const orderedMatch = line.match(/^(\s*)(\d+\.)\s+(.+)$/);
  if (orderedMatch) {
    return [{
      type: 'orderedList',
      number: orderedMatch[2],
      content: orderedMatch[3],
      indent: orderedMatch[1].length,
    } as OrderedListToken];
  }
  
  // 检查引用 > quote
  const quoteMatch = line.match(/^>\s+(.+)$/);
  if (quoteMatch) {
    return [{
      type: 'blockquote',
      content: quoteMatch[1],
    } as BlockquoteToken];
  }
  
  // 空行
  if (line.trim() === '') {
    return [{ type: 'newline' } as NewlineToken];
  }
  
  // 普通行，解析行内元素
  return parseInlineElements(line);
}

/**
 * 解析 Markdown 文本（简化版）
 */
export function parseMarkdown(
  text: string,
  options: ParseOptions = { enableInsight: true, enableCodeBlock: false, enableTable: false }
): Token[] {
  if (!text) return [];
  
  const tokens: Token[] = [];
  
  // 1. 检查 Insight 块
  if (options.enableInsight) {
    INSIGHT_PATTERN.lastIndex = 0;
    const insightMatches: { start: number; end: number; content: string }[] = [];
    let match: RegExpExecArray | null;
    
    while ((match = INSIGHT_PATTERN.exec(text)) !== null) {
      insightMatches.push({
        start: match.index,
        end: match.index + match[0].length,
        content: match[1].trim(),
      });
    }
    
    if (insightMatches.length > 0) {
      let currentIndex = 0;
      for (const im of insightMatches) {
        if (im.start > currentIndex) {
          const beforeText = text.slice(currentIndex, im.start);
          tokens.push(...parseLines(beforeText));
        }
        tokens.push({ type: 'insight', content: im.content } as InsightToken);
        currentIndex = im.end;
      }
      if (currentIndex < text.length) {
        tokens.push(...parseLines(text.slice(currentIndex)));
      }
      return tokens;
    }
  }
  
  // 2. 按行解析
  return parseLines(text);
}

/**
 * 按行解析文本
 */
function parseLines(text: string): Token[] {
  const tokens: Token[] = [];
  const lines = text.split('\n');
  
  for (let i = 0; i < lines.length; i++) {
    const lineTokens = parseLine(lines[i]);
    tokens.push(...lineTokens);
    
    // 只在非空行后、非最后一行时添加换行
    if (i < lines.length - 1) {
      const lastToken = lineTokens[lineTokens.length - 1];
      if (lastToken && lastToken.type !== 'newline') {
        tokens.push({ type: 'newline' } as NewlineToken);
      }
    }
  }
  
  return tokens;
}

export { parseInlineElements, parseLine };
