/**
 * 读取文件内容工具 - 执行器
 * 读取指定文件的内容，支持分页读取和自动截断
 *
 * 使用 Bun 原生 API 进行文件操作
 */

import * as path from 'path';
import type { ToolResult } from '../types.js';

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

/** ReadFile 业务数据 */
export interface ReadFileData {
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

/** ReadFile 结果（统一结果接口） */
export type ReadFileResult = ToolResult<ReadFileData>;

/**
 * 读取文件执行器
 * @param args - 读取文件参数
 * @param context - 上下文配置
 * @returns - 读取文件结果（统一结果接口）
 */
export async function readFileExecutor(args: ReadFileArgs, context: any): Promise<ReadFileResult> {
  const cwd = context?.cwd || process.cwd();
  const targetPath = path.resolve(cwd, args.filePath);
  const maxFileSize = context?.maxFileSize ?? DEFAULT_MAX_FILE_SIZE;

  const file = Bun.file(targetPath);

  // 检查文件是否存在
  const exists = await file.exists();
  if (!exists) {
    return {
      success: false,
      error: `文件不存在: ${targetPath}`,
      data: null,
    };
  }

  try {
    // 获取文件信息
    const stats = await file.stat();
    if (!stats.isFile()) {
      return {
        success: false,
        error: `路径不是文件: ${targetPath}`,
        data: null,
      };
    }

    // 读取文件内容
    const fullContent = await file.text();
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
    let warning: string | undefined;

    // 检查内容是否超过阈值，需要截断
    if (content.length > maxFileSize) {
      isTruncated = true;
      // 保留头尾
      const halfSize = Math.floor(maxFileSize / 2) - 100;
      const head = content.slice(0, halfSize);
      const tail = content.slice(-halfSize);
      const omittedChars = content.length - halfSize * 2;
      content = `${head}\n\n... [内容已截断，省略 ${omittedChars} 字符] ...\n\n${tail}`;
      warning = `内容已截断，省略 ${omittedChars} 字符`;
    }

    return {
      success: true,
      warning,
      data: {
        filePath: targetPath,
        content,
        size: stats.size,
        lineCount: selectedLines.length,
        totalLines,
        readRange:
          offset !== 0 || limit !== totalLines ? { start: startLine, end: endLine } : undefined,
        isTruncated,
      },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: errorMessage,
      data: null,
    };
  }
}

/**
 * 格式化工具结果供 Assistant 使用
 * @param result - 读取文件结果
 * @returns - 格式化后的字符串
 */
export function renderResultForAssistant(result: ReadFileResult): string {
  // 失败时
  if (!result.success) {
    return `Error: ${result.error}`;
  }

  const data = result.data;
  if (!data) {
    return 'No data';
  }

  const lines = [
    `文件: ${data.filePath}`,
    `大小: ${formatSize(data.size)}`,
    `总行数: ${data.totalLines}`,
  ];

  if (data.readRange) {
    lines.push(
      `读取范围: 第 ${data.readRange.start + 1} - ${data.readRange.end} 行 (共 ${data.lineCount} 行)`
    );
  } else {
    lines.push(`读取行数: ${data.lineCount}`);
  }

  if (data.isTruncated) {
    lines.push('⚠️ 内容已截断（超过大小限制）');
  }

  // 警告信息
  if (result.warning) {
    lines.push(`⚠️ ${result.warning}`);
  }

  lines.push('', '--- 内容 ---', data.content);

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
