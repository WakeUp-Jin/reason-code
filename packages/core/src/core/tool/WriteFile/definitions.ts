/**
 * 写入文件工具 - 定义
 * 用于验证工具权限系统
 */

import { InternalTool, InternalToolContext, ApprovalMode, ConfirmDetails } from '../types.js';
import { Allowlist } from '../Allowlist.js';
import {
  writeFileExecutor,
  renderResultForAssistant,
  WriteFileArgs,
  WriteFileResult,
} from './executors.js';

export const WriteFileTool: InternalTool<WriteFileArgs, WriteFileResult> = {
  name: 'WriteFile',
  category: 'filesystem',
  internal: true,
  description: '将内容写入指定文件。支持覆盖和追加模式。如果目录不存在会自动创建。',
  version: '1.0.0',
  parameters: {
    type: 'object',
    properties: {
      filePath: {
        type: 'string',
        description: '要写入的文件路径',
      },
      content: {
        type: 'string',
        description: '要写入的内容',
      },
      encoding: {
        type: 'string',
        description: '文件编码，默认为 utf-8',
      },
      append: {
        type: 'boolean',
        description: '是否为追加模式，默认为 false（覆盖模式）',
      },
    },
    required: ['filePath', 'content'],
  },
  handler: writeFileExecutor,
  renderResultForAssistant: renderResultForAssistant,

  // 权限控制：写入工具不是只读的
  isReadOnly: () => false,

  /**
   * 检查是否需要用户确认执行
   * 写入工具在 DEFAULT 模式下需要确认
   * @param args - 工具参数
   * @param approvalMode - 当前批准模式
   * @param _context - 工具上下文（未使用）
   * @param _allowlist - 会话级白名单（WriteFile 目前不使用，但签名需要匹配）
   */
  shouldConfirmExecute: async (
    args: WriteFileArgs,
    approvalMode: ApprovalMode,
    _context?: InternalToolContext,
    _allowlist?: Allowlist
  ): Promise<ConfirmDetails | false> => {
    // YOLO 模式：直接执行，不需要确认
    if (approvalMode === ApprovalMode.YOLO) {
      return false;
    }

    // AUTO_EDIT 模式：编辑类工具自动批准
    if (approvalMode === ApprovalMode.AUTO_EDIT) {
      return false;
    }

    // DEFAULT 模式：需要用户确认
    // 从路径中提取文件名
    const fileName = args.filePath.split('/').pop() || args.filePath;

    return {
      type: 'info',
      panelTitle: 'Overwrite file',
      filePath: args.filePath,
      fileName,
      contentPreview: args.content,
      message: args.append ? '追加模式' : undefined,
    };
  },
};
