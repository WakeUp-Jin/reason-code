/**
 * 读取文件内容工具 - 执行器
 * 读取指定文件的内容，支持分页读取和自动截断
 */

import * as fs from 'fs';
import * as path from 'path';

/** 默认文件大小限制（字符数） */
const DEFAULT_MAX_FILE_SIZE = 100_000;

export interface ReadFileArgs {
  /** 文件路径 */
  filePath: string;
  /** 编码，默认 utf-8 */
  encoding?: BufferEncoding;
  /** 起始行号（从 0 开始） */
  offset?: number;
  /** 读取的行数 */
  limit?: number;
}

export interface ReadFileResult {
  /** 文件路径 */
  filePath: string;
  /** 文件内容 */
  content: string;
  /** 文件大小（字节） */
  size: number;
  /** 读取的行数 */
  lineCount: number;
  /** 文件总行数 */
  totalLines: number;
  /** 实际读取范围 */
  readRange?: {
    start: number;
    end: number;
  };
  /** 是否被截断 */
  isTruncated: boolean;
}

/**
 * 读取文件执行器
 * @param args - 读取文件参数
 * @param context - 上下文配置
 * @returns - 读取文件结果
 */
export async function readFileExecutor(args: ReadFileArgs, context: any): Promise<ReadFileResult> {
  const cwd = context?.cwd || process.cwd();
  const targetPath = path.resolve(cwd, args.filePath);
  const encoding = args.encoding || 'utf-8';
  const maxFileSize = context?.maxFileSize ?? DEFAULT_MAX_FILE_SIZE;

  //延时10秒
  // await new Promise((resolve) => setTimeout(resolve, 10000));

  // 检查文件是否存在
  if (!fs.existsSync(targetPath)) {
    throw new Error(`文件不存在: ${targetPath}`);
  }

  // 检查是否是文件
  const stats = fs.statSync(targetPath);
  if (!stats.isFile()) {
    throw new Error(`路径不是文件: ${targetPath}`);
  }

  // 读取文件内容
  const fullContent = fs.readFileSync(targetPath, encoding);
  const allLines = fullContent.split('\n');
  const totalLines = allLines.length;

  // 处理分页读取
  const offset = args.offset ?? 0;
  const limit = args.limit ?? totalLines;

  // 计算实际读取范围
  const startLine = Math.max(0, Math.min(offset, totalLines - 1));
  const endLine = Math.min(startLine + limit, totalLines);
  const selectedLines = allLines.slice(startLine, endLine);

  let content = selectedLines.join('\n');
  let isTruncated = false;

  // 检查内容是否超过阈值，需要截断
  if (content.length > maxFileSize) {
    isTruncated = true;
    // 保留头尾
    const halfSize = Math.floor(maxFileSize / 2) - 100;
    const head = content.slice(0, halfSize);
    const tail = content.slice(-halfSize);
    const omittedChars = content.length - halfSize * 2;
    content = `${head}\n\n... [内容已截断，省略 ${omittedChars} 字符] ...\n\n${tail}`;
  }

  return {
    filePath: targetPath,
    content,
    size: stats.size,
    lineCount: selectedLines.length,
    totalLines,
    readRange:
      offset !== 0 || limit !== totalLines ? { start: startLine, end: endLine } : undefined,
    isTruncated,
  };
}

/**
 * 格式化工具结果供 Assistant 使用
 * @param result - 读取文件结果
 * @returns - 格式化后的字符串
 */
export function renderResultForAssistant(result: ReadFileResult): string {
  const lines = [
    `文件: ${result.filePath}`,
    `大小: ${formatSize(result.size)}`,
    `总行数: ${result.totalLines}`,
  ];

  if (result.readRange) {
    lines.push(
      `读取范围: 第 ${result.readRange.start + 1} - ${result.readRange.end} 行 (共 ${result.lineCount} 行)`
    );
  } else {
    lines.push(`读取行数: ${result.lineCount}`);
  }

  if (result.isTruncated) {
    lines.push('⚠️ 内容已截断（超过大小限制）');
  }

  lines.push('', '--- 内容 ---', result.content);

  return lines.join('\n');
}

/**
 * 格式化文件大小
 */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}
