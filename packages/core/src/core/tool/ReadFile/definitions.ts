import { InternalTool } from '../types.js';
import { readFileExecutor, renderResultForAssistant } from './executors.js';
import { ReadFileArgs, ReadFileResult } from './executors.js';

export const ReadFileTool: InternalTool<ReadFileArgs, ReadFileResult> = {
  name: 'ReadFile',
  category: 'filesystem',
  internal: true,
  description:
    '读取指定文件的内容。支持分页读取（offset/limit）和自动截断。返回文件内容、大小、行数和总行数。',
  version: '2.0.0',
  parameters: {
    type: 'object',
    properties: {
      filePath: {
        type: 'string',
        description: '要读取的文件路径',
      },
      encoding: {
        type: 'string',
        description: '文件编码，默认为 utf-8',
      },
      offset: {
        type: 'number',
        description: '起始行号（从 0 开始），用于分页读取大文件',
      },
      limit: {
        type: 'number',
        description: '读取的行数，用于分页读取大文件',
      },
    },
    required: ['filePath'],
  },
  handler: readFileExecutor,
  renderResultForAssistant: renderResultForAssistant,

  // 只读工具，不需要权限确认
  isReadOnly: () => true,

  // 只读工具不需要确认
  shouldConfirmExecute: async () => false,
};
