/**
 * 外部编辑器集成
 * 使用 $EDITOR 环境变量打开文件
 */

import { spawn } from 'child_process'
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

  return new Promise((resolve) => {
    const proc = spawn('which', [editorCmd.split(' ')[0]], {
      stdio: ['ignore', 'ignore', 'ignore'],
    })

    proc.on('close', (code) => {
      resolve(code === 0)
    })

    proc.on('error', () => {
      resolve(false)
    })
  })
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

    return new Promise((resolve, reject) => {
      const proc = spawn(editorCmd, editorArgs, {
        stdio: 'inherit',
      })

      proc.on('close', (code) => {
        if (code === 0) {
          try {
            // 读取编辑后的内容
            const content = readFileSync(tempFile, 'utf-8')
            resolve(content)
          } catch (error) {
            reject(error)
          }
        } else {
          // 编辑器非正常退出，视为取消
          resolve(null)
        }

        // 清理临时文件
        try {
          unlinkSync(tempFile)
        } catch {
          // 忽略删除错误
        }
      })

      proc.on('error', (error) => {
        // 清理临时文件
        try {
          unlinkSync(tempFile)
        } catch {
          // 忽略删除错误
        }
        reject(error)
      })
    })
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

  return new Promise((resolve) => {
    const proc = spawn(editorCmd, editorArgs, {
      stdio: 'inherit',
    })

    proc.on('close', (code) => {
      resolve(code === 0)
    })

    proc.on('error', () => {
      resolve(false)
    })
  })
}

