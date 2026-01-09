/**
 * 列出目录文件工具
 * 列出指定目录下的文件和文件夹
 */

import * as fs from 'fs';
import * as path from 'path';
import type { ToolResult } from '../types.js';

export interface ListFilesArgs {
  /** 目录路径，默认为当前工作目录 */
  directory?: string;
}

/** ListFiles 业务数据 */
export interface ListFilesData {
  /** 目录路径 */
  directory: string;
  /** 文件列表 */
  files: Array<{
    name: string;
    type: 'file' | 'directory';
    size?: number;
  }>;
  /** 文件总数 */
  totalCount: number;
}

/** ListFiles 结果（统一结果接口） */
export type ListFilesResult = ToolResult<ListFilesData>;

/**
 * 列出文件执行器
 * @param args - 列出文件参数
 * @param config - 配置
 * @returns - 列出文件结果（统一结果接口）
 */
export async function listFilesExecutor(
  args: ListFilesArgs,
  config: any
): Promise<ListFilesResult> {
  const cwd = config?.cwd || process.cwd();
  const targetDir = args.directory ? path.resolve(cwd, args.directory) : cwd;

  // 检查目录是否存在
  if (!fs.existsSync(targetDir)) {
    return {
      success: false,
      error: `目录不存在: ${targetDir}`,
      data: null,
    };
  }

  // 检查是否是目录
  try {
    const stats = fs.statSync(targetDir);
    if (!stats.isDirectory()) {
      return {
        success: false,
        error: `路径不是目录: ${targetDir}`,
        data: null,
      };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: errorMessage,
      data: null,
    };
  }

  try {
    // 读取目录内容
    const entries = fs.readdirSync(targetDir, { withFileTypes: true });

    const files = entries
      .filter((entry) => !entry.name.startsWith('.')) // 过滤隐藏文件
      .map((entry) => {
        const fullPath = path.join(targetDir, entry.name);
        const result: {
          name: string;
          type: 'file' | 'directory';
          size?: number;
        } = {
          name: entry.name,
          type: entry.isDirectory() ? 'directory' : 'file',
        };

        // 对于文件，获取大小
        if (entry.isFile()) {
          try {
            const fileStats = fs.statSync(fullPath);
            result.size = fileStats.size;
          } catch {
            // 忽略权限错误
          }
        }

        return result;
      })
      .sort((a, b) => {
        // 目录在前，文件在后
        if (a.type !== b.type) {
          return a.type === 'directory' ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
      });

    return {
      success: true,
      data: {
        directory: targetDir,
        files,
        totalCount: files.length,
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
 * 格式化工具结果
 * @param result - 列表文件结果
 * @returns
 */
export function renderResultForAssistant(result: ListFilesResult): string {
  // 失败时
  if (!result.success) {
    return `Error: ${result.error}`;
  }

  const data = result.data;
  if (!data) {
    return 'No data';
  }

  const lines = [`目录: ${data.directory}`, `共 ${data.totalCount} 个项目:`, ''];

  for (const file of data.files) {
    const icon = file.type === 'directory' ? '📁' : '📄';
    const size = file.size !== undefined ? ` (${formatSize(file.size)})` : '';
    lines.push(`${icon} ${file.name}${size}`);
  }

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
