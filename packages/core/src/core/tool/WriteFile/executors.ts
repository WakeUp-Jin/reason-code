/**
 * 写入文件工具 - 执行器
 * 将内容写入指定文件，用于验证工具权限系统
 *
 * 使用 Bun 原生 API 进行文件操作
 */

import { mkdir } from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import type { ToolResult } from '../types.js';

/**
 * 展开路径中的 ~ 符号为用户 home 目录
 * @param inputPath - 输入路径
 * @returns 展开后的路径
 */
function expandTilde(inputPath: string): string {
  if (inputPath.startsWith('~/')) {
    return path.join(os.homedir(), inputPath.slice(2));
  }
  if (inputPath === '~') {
    return os.homedir();
  }
  return inputPath;
}

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
  // 先展开 ~ 符号，再解析路径
  const expandedPath = expandTilde(args.filePath);
  const targetPath = path.resolve(cwd, expandedPath);
  const encoding = args.encoding || 'utf-8';
  const append = args.append ?? false;

  try {
    const file = Bun.file(targetPath);

    // 检查文件是否已存在
    const isNewFile = !(await file.exists());

    // 确保目录存在
    const dir = path.dirname(targetPath);
    await mkdir(dir, { recursive: true });

    // 写入文件
    if (append) {
      // 追加模式：先读取现有内容，再写入
      let existingContent = '';
      if (!isNewFile) {
        existingContent = await file.text();
      }
      await Bun.write(targetPath, existingContent + args.content);
    } else {
      // 覆盖模式：直接写入
      await Bun.write(targetPath, args.content);
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
