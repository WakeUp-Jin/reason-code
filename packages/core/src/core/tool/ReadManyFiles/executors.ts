/**
 * 批量读取文件工具 - 执行器
 * 支持直接路径列表或 glob 模式匹配
 */

import * as fs from 'fs';
import * as path from 'path';
import { glob } from 'glob';
import type { ToolResult } from '../types.js';

/** 默认单个文件大小限制（字符数） */
const DEFAULT_MAX_FILE_SIZE = 50_000;

/** 默认总输出大小限制（字符数） */
const DEFAULT_MAX_TOTAL_SIZE = 200_000;

/** 默认最大文件数量 */
const DEFAULT_MAX_FILES = 50;

export interface ReadManyFilesArgs {
  /** 文件路径列表，支持 glob 模式 */
  paths: string[];
  /** 包含的文件模式（可选） */
  include?: string[];
  /** 排除的文件模式（可选） */
  exclude?: string[];
}

/** 单个文件读取结果 */
export interface FileReadResult {
  /** 文件路径 */
  path: string;
  /** 文件内容 */
  content: string;
  /** 文件大小（字节） */
  size: number;
  /** 行数 */
  lineCount: number;
  /** 是否被截断 */
  isTruncated: boolean;
}

/** ReadManyFiles 业务数据 */
export interface ReadManyFilesData {
  /** 成功读取的文件列表 */
  files: FileReadResult[];
  /** 成功读取的文件数 */
  totalFiles: number;
  /** 总大小（字节） */
  totalSize: number;
  /** 错误列表 */
  errors: Array<{ path: string; error: string }>;
  /** 是否因为数量限制而截断 */
  isTruncatedByCount: boolean;
  /** 是否因为大小限制而截断 */
  isTruncatedBySize: boolean;
}

/** ReadManyFiles 结果（统一结果接口） */
export type ReadManyFilesResult = ToolResult<ReadManyFilesData>;

/**
 * 检查路径是否是 glob 模式
 */
function isGlobPattern(p: string): boolean {
  return p.includes('*') || p.includes('?') || p.includes('[') || p.includes('{');
}

/**
 * 展开 glob 模式为具体文件路径
 */
async function expandGlobPatterns(
  patterns: string[],
  cwd: string,
  exclude?: string[]
): Promise<string[]> {
  const allFiles: Set<string> = new Set();

  for (const pattern of patterns) {
    if (isGlobPattern(pattern)) {
      // 是 glob 模式，展开
      const matches = await glob(pattern, {
        cwd,
        absolute: true,
        nodir: true,
        ignore: exclude || ['**/node_modules/**', '**/.git/**'],
      });
      matches.forEach((f) => allFiles.add(f));
    } else {
      // 普通路径，直接添加
      const absolutePath = path.resolve(cwd, pattern);
      allFiles.add(absolutePath);
    }
  }

  return Array.from(allFiles);
}

/**
 * 读取单个文件
 */
function readSingleFile(
  filePath: string,
  maxFileSize: number
): { success: true; data: FileReadResult } | { success: false; error: string } {
  try {
    // 检查文件是否存在
    if (!fs.existsSync(filePath)) {
      return { success: false, error: 'File not found' };
    }

    const stats = fs.statSync(filePath);

    // 检查是否是文件
    if (!stats.isFile()) {
      return { success: false, error: 'Not a file' };
    }

    // 检查是否是二进制文件（简单判断）
    const ext = path.extname(filePath).toLowerCase();
    const binaryExtensions = [
      '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.bmp',
      '.pdf', '.zip', '.tar', '.gz', '.rar', '.7z',
      '.exe', '.dll', '.so', '.dylib',
      '.mp3', '.mp4', '.avi', '.mov', '.wav',
      '.woff', '.woff2', '.ttf', '.eot',
    ];
    if (binaryExtensions.includes(ext)) {
      return { success: false, error: `Binary file (${ext})` };
    }

    // 读取文件内容
    let content = fs.readFileSync(filePath, 'utf-8');
    let isTruncated = false;

    // 检查内容是否超过限制
    if (content.length > maxFileSize) {
      isTruncated = true;
      // 保留头尾
      const halfSize = Math.floor(maxFileSize / 2) - 50;
      const head = content.slice(0, halfSize);
      const tail = content.slice(-halfSize);
      const omittedChars = content.length - halfSize * 2;
      content = `${head}\n\n... [truncated ${omittedChars} chars] ...\n\n${tail}`;
    }

    const lineCount = content.split('\n').length;

    return {
      success: true,
      data: {
        path: filePath,
        content,
        size: stats.size,
        lineCount,
        isTruncated,
      },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { success: false, error: errorMessage };
  }
}

/**
 * 批量读取文件执行器
 */
export async function readManyFilesExecutor(
  args: ReadManyFilesArgs,
  context: any
): Promise<ReadManyFilesResult> {
  const cwd = context?.cwd || process.cwd();
  const maxFileSize = context?.maxFileSize ?? DEFAULT_MAX_FILE_SIZE;
  const maxTotalSize = context?.maxTotalSize ?? DEFAULT_MAX_TOTAL_SIZE;
  const maxFiles = context?.maxFiles ?? DEFAULT_MAX_FILES;

  // 验证参数
  if (!args.paths || args.paths.length === 0) {
    return {
      success: false,
      error: 'paths is required and must not be empty',
      data: null,
    };
  }

  try {
    // 展开 glob 模式
    const allFiles = await expandGlobPatterns(args.paths, cwd, args.exclude);

    // 应用 include 过滤（如果有）
    let filteredFiles = allFiles;
    if (args.include && args.include.length > 0) {
      const includePatterns = args.include.map((p) => new RegExp(p.replace(/\*/g, '.*')));
      filteredFiles = allFiles.filter((f) =>
        includePatterns.some((pattern) => pattern.test(f))
      );
    }

    // 检查文件数量限制
    let isTruncatedByCount = false;
    if (filteredFiles.length > maxFiles) {
      filteredFiles = filteredFiles.slice(0, maxFiles);
      isTruncatedByCount = true;
    }

    // 读取文件
    const files: FileReadResult[] = [];
    const errors: Array<{ path: string; error: string }> = [];
    let totalSize = 0;
    let currentOutputSize = 0;
    let isTruncatedBySize = false;

    for (const filePath of filteredFiles) {
      // 检查总输出大小
      if (currentOutputSize >= maxTotalSize) {
        isTruncatedBySize = true;
        break;
      }

      const result = readSingleFile(filePath, maxFileSize);

      if (result.success) {
        // 检查添加这个文件后是否会超出限制
        const estimatedSize = result.data.content.length + 100; // 100 for headers
        if (currentOutputSize + estimatedSize > maxTotalSize) {
          isTruncatedBySize = true;
          break;
        }

        files.push(result.data);
        totalSize += result.data.size;
        currentOutputSize += estimatedSize;
      } else {
        errors.push({ path: filePath, error: result.error });
      }
    }

    // 构建警告信息
    const warnings: string[] = [];
    if (isTruncatedByCount) {
      warnings.push(`File count limited to ${maxFiles}`);
    }
    if (isTruncatedBySize) {
      warnings.push(`Output size limited to ${formatSize(maxTotalSize)}`);
    }
    if (errors.length > 0) {
      warnings.push(`${errors.length} file(s) failed to read`);
    }

    return {
      success: true,
      warning: warnings.length > 0 ? warnings.join('; ') : undefined,
      data: {
        files,
        totalFiles: files.length,
        totalSize,
        errors,
        isTruncatedByCount,
        isTruncatedBySize,
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
 * 格式化文件大小
 */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

/**
 * 格式化工具结果供 Assistant 使用
 */
export function renderResultForAssistant(result: ReadManyFilesResult): string {
  // 失败时
  if (!result.success) {
    return `Error: ${result.error}`;
  }

  const data = result.data;
  if (!data) {
    return 'No data';
  }

  const lines: string[] = [];

  // 输出每个文件
  for (const file of data.files) {
    const truncatedMark = file.isTruncated ? ' [truncated]' : '';
    lines.push(`=== File: ${file.path} (${formatSize(file.size)}, ${file.lineCount} lines)${truncatedMark} ===`);
    lines.push(file.content);
    lines.push(''); // 空行分隔
  }

  // 输出错误
  if (data.errors.length > 0) {
    lines.push('=== Errors ===');
    for (const err of data.errors) {
      lines.push(`- ${err.path}: ${err.error}`);
    }
    lines.push('');
  }

  // 输出摘要
  lines.push('--- Summary ---');
  lines.push(`Total: ${data.totalFiles} files, ${formatSize(data.totalSize)}`);
  if (data.errors.length > 0) {
    lines.push(`Errors: ${data.errors.length}`);
  }
  if (data.isTruncatedByCount) {
    lines.push('⚠️ File count was limited');
  }
  if (data.isTruncatedBySize) {
    lines.push('⚠️ Output size was limited');
  }

  // 警告信息
  if (result.warning) {
    lines.push(`⚠️ ${result.warning}`);
  }

  return lines.join('\n');
}

