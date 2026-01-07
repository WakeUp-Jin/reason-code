/**
 * 终端工具函数
 * 包含 OSC 序列处理、终端检测等功能
 */

/**
 * 检测终端是否支持 OSC 序列
 */
export function supportsOSC(): boolean {
  // 检查是否是 TTY
  if (!process.stdout.isTTY) {
    return false
  }

  // 检查终端类型
  const term = process.env.TERM || ''
  const colorterm = process.env.COLORTERM || ''

  // 大多数现代终端都支持 OSC
  const supportedTerms = [
    'xterm',
    'xterm-256color',
    'screen',
    'screen-256color',
    'tmux',
    'tmux-256color',
    'rxvt',
    'linux',
    'vt100',
    'alacritty',
    'kitty',
    'iterm2',
    'wezterm',
  ]

  if (supportedTerms.some((t) => term.includes(t))) {
    return true
  }

  // 检查 COLORTERM 环境变量
  if (colorterm === 'truecolor' || colorterm === '24bit') {
    return true
  }

  // macOS Terminal.app
  if (process.env.TERM_PROGRAM === 'Apple_Terminal') {
    return true
  }

  // iTerm2
  if (process.env.TERM_PROGRAM === 'iTerm.app') {
    return true
  }

  // VS Code 内置终端
  if (process.env.TERM_PROGRAM === 'vscode') {
    return true
  }

  return false
}

/**
 * 使用 OSC 11 检测终端背景色
 * 返回 'dark' | 'light' | null
 *
 * 注意：这是一个异步操作，需要等待终端响应
 * 在某些终端中可能不工作
 */
export async function detectTerminalBackground(): Promise<'dark' | 'light' | null> {
  return new Promise((resolve) => {
    // 如果不支持 OSC，直接返回 null
    if (!supportsOSC()) {
      resolve(null)
      return
    }

    // 设置超时
    const timeout = setTimeout(() => {
      cleanup()
      resolve(null)
    }, 1000)

    // 保存原始 raw 模式状态
    const wasRaw = process.stdin.isRaw

    // 设置 stdin 为 raw 模式以接收响应
    if (process.stdin.setRawMode) {
      process.stdin.setRawMode(true)
    }
    process.stdin.resume()

    let buffer = ''

    const onData = (data: Buffer) => {
      buffer += data.toString()

      // OSC 11 响应格式: \x1b]11;rgb:RRRR/GGGG/BBBB\x1b\\
      // 或者: \x1b]11;rgb:RRRR/GGGG/BBBB\x07
      const match = buffer.match(/\x1b\]11;rgb:([0-9a-f]+)\/([0-9a-f]+)\/([0-9a-f]+)/i)

      if (match) {
        cleanup()

        // 解析 RGB 值（16位颜色值）
        const r = parseInt(match[1].substring(0, 2), 16)
        const g = parseInt(match[2].substring(0, 2), 16)
        const b = parseInt(match[3].substring(0, 2), 16)

        // 计算亮度 (使用相对亮度公式)
        const luminance = 0.299 * r + 0.587 * g + 0.114 * b

        // 亮度阈值（128 是中间值）
        resolve(luminance < 128 ? 'dark' : 'light')
      }
    }

    const cleanup = () => {
      clearTimeout(timeout)
      process.stdin.removeListener('data', onData)

      // 恢复原始 raw 模式状态
      if (process.stdin.setRawMode) {
        process.stdin.setRawMode(wasRaw || false)
      }

      if (!wasRaw) {
        process.stdin.pause()
      }
    }

    process.stdin.on('data', onData)

    // 发送 OSC 11 查询
    process.stdout.write('\x1b]11;?\x1b\\')
  })
}

/**
 * 根据环境变量猜测终端主题模式
 * 这是一个备用方案，当 OSC 11 不可用时使用
 */
export function guessTerminalMode(): 'dark' | 'light' {
  // 检查常见的环境变量
  const colorScheme = process.env.COLORFGBG
  if (colorScheme) {
    // COLORFGBG 格式: "fg;bg" 或 "fg;extra;bg"
    const parts = colorScheme.split(';')
    const bg = parseInt(parts[parts.length - 1], 10)

    // 0 = 黑色背景 (dark), 15 = 白色背景 (light)
    if (!isNaN(bg)) {
      return bg < 8 ? 'dark' : 'light'
    }
  }

  // 检查 macOS 外观设置
  if (process.env.TERM_PROGRAM === 'Apple_Terminal') {
    // Apple Terminal 默认跟随系统设置
    // 这里无法直接检测，返回 dark 作为默认值
    return 'dark'
  }

  // 检查 VS Code 主题
  if (process.env.VSCODE_CLI_THEME) {
    return process.env.VSCODE_CLI_THEME === 'light' ? 'light' : 'dark'
  }

  // 默认返回 dark
  return 'dark'
}

/**
 * 获取终端尺寸
 */
export function getTerminalSize(): { columns: number; rows: number } {
  return {
    columns: process.stdout.columns || 80,
    rows: process.stdout.rows || 24,
  }
}

/**
 * 清屏（仅清除可见区域）
 */
export function clearScreen(): void {
  process.stdout.write('\x1b[2J\x1b[H')
}

/**
 * 彻底清屏（包括滚动缓冲区）
 * 使终端回归初始状态，就像刚打开一样
 */
export function clearScreenFull(): void {
  // 使用多种清屏序列组合，确保在各种终端上都能工作
  // \x1b[?1049h - 切换到备用屏幕缓冲区（alternate screen buffer）
  // \x1b[?1049l - 切换回主屏幕缓冲区
  // \x1b[3J - 清除滚动缓冲区（scrollback buffer）
  // \x1b[2J - 清除整个屏幕
  // \x1b[H  - 移动光标到左上角 (0,0)
  process.stdout.write('\x1b[3J\x1b[2J\x1b[H')
}

/**
 * 隐藏光标
 */
export function hideCursor(): void {
  process.stdout.write('\x1b[?25l')
}

/**
 * 显示光标
 */
export function showCursor(): void {
  process.stdout.write('\x1b[?25h')
}

/**
 * 设置终端标题
 */
export function setTitle(title: string): void {
  if (supportsOSC()) {
    process.stdout.write(`\x1b]0;${title}\x07`)
  }
}

