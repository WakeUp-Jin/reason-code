/**
 * 剪贴板工具
 * 使用 OSC 52 序列实现终端剪贴板操作
 */

/**
 * 检测终端是否支持 OSC 52
 */
export function supportsOSC52(): boolean {
  // 检查是否是 TTY
  if (!process.stdout.isTTY) {
    return false
  }

  // 检查终端类型
  const term = process.env.TERM || ''
  const termProgram = process.env.TERM_PROGRAM || ''

  // 支持 OSC 52 的终端
  const supportedTerms = [
    'xterm',
    'xterm-256color',
    'screen',
    'tmux',
    'alacritty',
    'kitty',
    'wezterm',
  ]

  const supportedPrograms = ['iTerm.app', 'WezTerm', 'Alacritty', 'kitty']

  if (supportedTerms.some((t) => term.includes(t))) {
    return true
  }

  if (supportedPrograms.some((p) => termProgram.includes(p))) {
    return true
  }

  return false
}

/**
 * 使用 OSC 52 复制文本到剪贴板
 *
 * OSC 52 格式: ESC ] 52 ; c ; <base64-data> BEL
 * - ESC ] = \x1b]
 * - 52 = 剪贴板操作
 * - c = 剪贴板选择（c = clipboard, p = primary）
 * - base64-data = Base64 编码的文本
 * - BEL = \x07
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (!supportsOSC52()) {
    // 尝试使用系统剪贴板命令
    return copyWithSystemClipboard(text)
  }

  try {
    // Base64 编码
    const base64 = Buffer.from(text, 'utf-8').toString('base64')

    // 发送 OSC 52 序列
    process.stdout.write(`\x1b]52;c;${base64}\x07`)

    return true
  } catch (error) {
    console.error('Failed to copy to clipboard:', error)
    return false
  }
}

/**
 * 使用系统剪贴板命令复制
 */
async function copyWithSystemClipboard(text: string): Promise<boolean> {
  const { spawn } = await import('child_process')

  return new Promise((resolve) => {
    let command: string
    let args: string[]

    // 根据平台选择命令
    switch (process.platform) {
      case 'darwin':
        command = 'pbcopy'
        args = []
        break
      case 'linux':
        // 优先使用 xclip，其次 xsel
        command = 'xclip'
        args = ['-selection', 'clipboard']
        break
      case 'win32':
        command = 'clip'
        args = []
        break
      default:
        resolve(false)
        return
    }

    try {
      const proc = spawn(command, args, {
        stdio: ['pipe', 'ignore', 'ignore'],
      })

      proc.stdin.write(text)
      proc.stdin.end()

      proc.on('close', (code) => {
        resolve(code === 0)
      })

      proc.on('error', () => {
        resolve(false)
      })
    } catch {
      resolve(false)
    }
  })
}

/**
 * 从剪贴板读取文本
 * 注意：OSC 52 读取在大多数终端中不可用
 * 这里使用系统命令
 */
export async function readFromClipboard(): Promise<string | null> {
  const { spawn } = await import('child_process')

  return new Promise((resolve) => {
    let command: string
    let args: string[]

    // 根据平台选择命令
    switch (process.platform) {
      case 'darwin':
        command = 'pbpaste'
        args = []
        break
      case 'linux':
        command = 'xclip'
        args = ['-selection', 'clipboard', '-o']
        break
      case 'win32':
        // Windows 没有简单的命令行读取剪贴板的方法
        resolve(null)
        return
      default:
        resolve(null)
        return
    }

    try {
      const proc = spawn(command, args, {
        stdio: ['ignore', 'pipe', 'ignore'],
      })

      let output = ''

      proc.stdout.on('data', (data) => {
        output += data.toString()
      })

      proc.on('close', (code) => {
        if (code === 0) {
          resolve(output)
        } else {
          resolve(null)
        }
      })

      proc.on('error', () => {
        resolve(null)
      })
    } catch {
      resolve(null)
    }
  })
}

/**
 * 复制并显示通知
 */
export async function copyWithNotification(
  text: string,
  onSuccess?: () => void,
  onError?: () => void
): Promise<void> {
  const success = await copyToClipboard(text)

  if (success) {
    onSuccess?.()
  } else {
    onError?.()
  }
}

