/**
 * Markdown Token 类型定义
 * 用于解析和渲染 Markdown 文本
 */

/**
 * Token 基础类型
 */
export type TokenType =
  | 'text'
  | 'bold'
  | 'italic'
  | 'code'
  | 'codeBlock'
  | 'link'
  | 'heading'
  | 'list'
  | 'orderedList'
  | 'blockquote'
  | 'filePath'
  | 'table'
  | 'insight'
  | 'newline';

/**
 * 基础 Token 接口
 */
export interface BaseToken {
  type: TokenType;
}

/**
 * 纯文本 Token
 */
export interface TextToken extends BaseToken {
  type: 'text';
  content: string;
}

/**
 * 加粗 Token（移除 **）
 */
export interface BoldToken extends BaseToken {
  type: 'bold';
  content: string;
}

/**
 * 斜体 Token（移除 *）
 */
export interface ItalicToken extends BaseToken {
  type: 'italic';
  content: string;
}

/**
 * 行内代码 Token（移除 `）
 */
export interface CodeToken extends BaseToken {
  type: 'code';
  content: string;
}

/**
 * 代码块 Token（移除 ```）
 */
export interface CodeBlockToken extends BaseToken {
  type: 'codeBlock';
  language: string;
  content: string;
}

/**
 * 链接 Token（移除 []()）
 */
export interface LinkToken extends BaseToken {
  type: 'link';
  text: string;
  url: string;
}

/**
 * 标题 Token（移除 #）
 */
export interface HeadingToken extends BaseToken {
  type: 'heading';
  level: number;
  content: string;
}

/**
 * 无序列表 Token（保留 -）
 */
export interface ListToken extends BaseToken {
  type: 'list';
  marker: string;
  content: string;
  indent: number;
}

/**
 * 有序列表 Token（保留数字和点）
 */
export interface OrderedListToken extends BaseToken {
  type: 'orderedList';
  number: string;
  content: string;
  indent: number;
}

/**
 * 引用 Token（移除 >，用边框替代）
 */
export interface BlockquoteToken extends BaseToken {
  type: 'blockquote';
  content: string;
}

/**
 * 文件路径 Token（保留原文本）
 */
export interface FilePathToken extends BaseToken {
  type: 'filePath';
  path: string;
}

/**
 * 表格 Token（保留边框字符）
 */
export interface TableToken extends BaseToken {
  type: 'table';
  rows: string[][];
}

/**
 * Insight 洞察块 Token
 */
export interface InsightToken extends BaseToken {
  type: 'insight';
  content: string;
}

/**
 * 换行 Token
 */
export interface NewlineToken extends BaseToken {
  type: 'newline';
}

/**
 * 所有 Token 类型的联合类型
 */
export type Token =
  | TextToken
  | BoldToken
  | ItalicToken
  | CodeToken
  | CodeBlockToken
  | LinkToken
  | HeadingToken
  | ListToken
  | OrderedListToken
  | BlockquoteToken
  | FilePathToken
  | TableToken
  | InsightToken
  | NewlineToken;

/**
 * 解析模式配置
 */
export interface ParseOptions {
  /** 是否启用 Insight 块解析 */
  enableInsight?: boolean;
  /** 是否启用代码块解析 */
  enableCodeBlock?: boolean;
  /** 是否启用表格解析 */
  enableTable?: boolean;
}

/**
 * 默认解析配置
 */
export const DEFAULT_PARSE_OPTIONS: ParseOptions = {
  enableInsight: true,
  enableCodeBlock: true,
  enableTable: true,
};

