/**
 * 外部编辑器集成
 * 使用 $EDITOR 环境变量打开文件
 */

import { writeFileSync, readFileSync, unlinkSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

/**
 * 获取默认编辑器
 */
export function getEditor(): string {
  // 优先使用 VISUAL，其次 EDITOR
  return process.env.VISUAL || process.env.EDITOR || 'vim'
}

/**
 * 检查编辑器是否可用
 */
export async function isEditorAvailable(editor?: string): Promise<boolean> {
  const editorCmd = editor || getEditor()

  const cmd = editorCmd.split(' ')[0]
  try {
    // @ts-ignore - Bun 全局变量
    const resolved = Bun.which(cmd)
    return typeof resolved === 'string' && resolved.length > 0
  } catch {
    return false
  }
}

/**
 * 使用外部编辑器编辑文本
 *
 * @param initialContent 初始内容
 * @param options 选项
 * @returns 编辑后的内容，如果取消则返回 null
 */
export async function editInExternalEditor(
  initialContent: string = '',
  options: {
    editor?: string
    extension?: string
    prefix?: string
  } = {}
): Promise<string | null> {
  const editor = options.editor || getEditor()
  const extension = options.extension || '.txt'
  const prefix = options.prefix || 'reason-cli-'

  // 创建临时文件
  const tempDir = join(tmpdir(), 'reason-cli')
  if (!existsSync(tempDir)) {
    mkdirSync(tempDir, { recursive: true })
  }

  const tempFile = join(tempDir, `${prefix}${Date.now()}${extension}`)

  try {
    // 写入初始内容
    writeFileSync(tempFile, initialContent, 'utf-8')

    // 打开编辑器
    const editorParts = editor.split(' ')
    const editorCmd = editorParts[0]
    const editorArgs = [...editorParts.slice(1), tempFile]

    // @ts-ignore - Bun 全局变量
    const proc = Bun.spawn([editorCmd, ...editorArgs], {
      stdin: 'inherit',
      stdout: 'inherit',
      stderr: 'inherit',
    })

    await proc.exited
    const code = proc.exitCode ?? -1

    if (code === 0) {
      try {
        return readFileSync(tempFile, 'utf-8')
      } finally {
        try {
          unlinkSync(tempFile)
        } catch {
          // ignore
        }
      }
    }

    // 编辑器非正常退出，视为取消
    try {
      unlinkSync(tempFile)
    } catch {
      // ignore
    }
    return null
  } catch (error) {
    // 清理临时文件
    try {
      unlinkSync(tempFile)
    } catch {
      // 忽略删除错误
    }
    throw error
  }
}

/**
 * 打开文件进行编辑
 */
export async function openFileInEditor(
  filePath: string,
  options: {
    editor?: string
    line?: number
    column?: number
  } = {}
): Promise<boolean> {
  const editor = options.editor || getEditor()

  // 构建编辑器参数
  const editorParts = editor.split(' ')
  const editorCmd = editorParts[0]
  const editorArgs = [...editorParts.slice(1)]

  // 某些编辑器支持行号参数
  if (options.line !== undefined) {
    // VS Code 格式
    if (editorCmd.includes('code')) {
      editorArgs.push('--goto', `${filePath}:${options.line}:${options.column || 1}`)
    }
    // Vim 格式
    else if (editorCmd.includes('vim') || editorCmd.includes('nvim')) {
      editorArgs.push(`+${options.line}`, filePath)
    }
    // 默认
    else {
      editorArgs.push(filePath)
    }
  } else {
    editorArgs.push(filePath)
  }

  try {
    // @ts-ignore - Bun 全局变量
    const proc = Bun.spawn([editorCmd, ...editorArgs], {
      stdin: 'inherit',
      stdout: 'inherit',
      stderr: 'inherit',
    })

    await proc.exited
    return proc.exitCode === 0
  } catch {
    return false
  }
}
