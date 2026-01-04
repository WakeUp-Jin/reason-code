import { InternalTool } from '../types.js';
import { listFilesExecutor, renderResultForAssistant } from './executors.js';
import { ListFilesArgs, ListFilesResult } from './executors.js';

export const ListFilesTool: InternalTool<ListFilesArgs, ListFilesResult> = {
  name: 'ListFiles',
  category: 'filesystem',
  internal: true,
  description: '列出指定目录下的文件和文件夹。如果不指定目录，则列出当前工作目录。',
  version: '1.0.0',
  parameters: {
    type: 'object',
    properties: {
      directory: {
        type: 'string',
        description: '要列出内容的目录路径，默认为当前工作目录',
      },
    },
    required: [],
  },
  handler: listFilesExecutor,
  renderResultForAssistant: renderResultForAssistant,

  // 只读工具，不需要权限确认
  isReadOnly: () => true,

  // 只读工具不需要确认
  shouldConfirmExecute: async () => false,
};
