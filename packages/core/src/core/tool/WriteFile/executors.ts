/**
 * 写入文件工具 - 执行器
 * 将内容写入指定文件，用于验证工具权限系统
 */

import * as fs from 'fs';
import * as path from 'path';
import type { ToolResult } from '../types.js';

export interface WriteFileArgs {
  /** 文件路径 */
  filePath: string;
  /** 要写入的内容 */
  content: string;
  /** 编码，默认 utf-8 */
  encoding?: BufferEncoding;
  /** 是否追加模式，默认 false（覆盖） */
  append?: boolean;
}

/** WriteFile 业务数据 */
export interface WriteFileData {
  /** 文件路径 */
  filePath: string;
  /** 写入的字节数 */
  bytesWritten: number;
  /** 是否为新建文件 */
  isNewFile: boolean;
  /** 写入模式 */
  mode: 'overwrite' | 'append';
}

/** WriteFile 结果（统一结果接口） */
export type WriteFileResult = ToolResult<WriteFileData>;

/**
 * 写入文件执行器
 * @param args - 写入文件参数
 * @param context - 上下文配置
 * @returns - 写入文件结果（统一结果接口）
 */
export async function writeFileExecutor(
  args: WriteFileArgs,
  context: any
): Promise<WriteFileResult> {
  const cwd = context?.cwd || process.cwd();
  const targetPath = path.resolve(cwd, args.filePath);
  const encoding = args.encoding || 'utf-8';
  const append = args.append ?? false;

  try {
    // 检查文件是否已存在
    const isNewFile = !fs.existsSync(targetPath);

    // 确保目录存在
    const dir = path.dirname(targetPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // 写入文件
    if (append) {
      fs.appendFileSync(targetPath, args.content, encoding);
    } else {
      fs.writeFileSync(targetPath, args.content, encoding);
    }

    // 获取写入的字节数
    const bytesWritten = Buffer.byteLength(args.content, encoding);

    return {
      success: true,
      data: {
        filePath: targetPath,
        bytesWritten,
        isNewFile,
        mode: append ? 'append' : 'overwrite',
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
 * @param result - 写入文件结果
 * @returns - 格式化后的字符串
 */
export function renderResultForAssistant(result: WriteFileResult): string {
  // 失败时
  if (!result.success) {
    return `文件写入失败: ${result.error}`;
  }

  const data = result.data;
  if (!data) {
    return '文件写入失败: No data';
  }

  const lines = [
    `文件写入成功`,
    `路径: ${data.filePath}`,
    `写入字节数: ${data.bytesWritten}`,
    `模式: ${data.mode === 'append' ? '追加' : '覆盖'}`,
    `${data.isNewFile ? '(新建文件)' : '(更新文件)'}`,
  ];

  return lines.join('\n');
}
