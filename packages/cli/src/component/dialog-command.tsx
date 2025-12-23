import React from 'react'
import { useDialog } from '../context/dialog.js'
import { useTheme } from '../context/theme.js'
import { useRoute } from '../context/route.js'
import { useAppStore } from '../context/store.js'
import { DialogSelect, type SelectOption } from '../ui/dialog-select.js'
import { DialogSessionList } from './dialog-session-list.js'
import { DialogSessionRename } from './dialog-session-rename.js'
import { DialogTheme } from './dialog-theme.js'
import { DialogStatus } from './dialog-status.js'
import { DialogModel } from './dialog-model.js'

// 命令定义
interface Command {
  id: string
  label: string
  description: string
  category: string
  shortcut?: string
  action: () => void
}

/**
 * 命令面板对话框
 * 提供所有可用命令的模糊搜索和执行
 */
export function DialogCommand() {
  const { pop, push } = useDialog()
  const { toggleMode, mode } = useTheme()
  const { goHome, current } = useRoute()
  const createSession = useAppStore((state) => state.createSession)
  const { goToSession } = useRoute()

  // 定义所有命令
  const commands: Command[] = [
    // Session 相关
    {
      id: 'session.new',
      label: 'New Session',
      description: 'Create a new chat session',
      category: 'Session',
      shortcut: 'Ctrl+N',
      action: () => {
        const session = createSession()
        goToSession(session.id)
        pop()
      },
    },
    {
      id: 'session.list',
      label: 'Session List',
      description: 'View and switch sessions',
      category: 'Session',
      shortcut: 'Ctrl+S',
      action: () => {
        pop()
        push(<DialogSessionList />)
      },
    },
    {
      id: 'session.rename',
      label: 'Rename Session',
      description: 'Rename current session',
      category: 'Session',
      action: () => {
        pop()
        push(<DialogSessionRename />)
      },
    },

    // Theme 相关
    {
      id: 'theme.select',
      label: 'Select Theme',
      description: 'Change color theme',
      category: 'Appearance',
      shortcut: 'Ctrl+T',
      action: () => {
        pop()
        push(<DialogTheme />)
      },
    },
    {
      id: 'theme.toggle',
      label: `Toggle Dark/Light Mode`,
      description: `Currently: ${mode}`,
      category: 'Appearance',
      action: () => {
        toggleMode()
        pop()
      },
    },

    // Model 相关
    {
      id: 'model.select',
      label: 'Select Model',
      description: 'Change AI model',
      category: 'Model',
      shortcut: 'Ctrl+M',
      action: () => {
        pop()
        push(<DialogModel />)
      },
    },

    // System 相关
    {
      id: 'system.status',
      label: 'System Status',
      description: 'View system information',
      category: 'System',
      action: () => {
        pop()
        push(<DialogStatus />)
      },
    },
    {
      id: 'system.home',
      label: 'Go Home',
      description: 'Return to home screen',
      category: 'Navigation',
      shortcut: 'Esc',
      action: () => {
        goHome()
        pop()
      },
    },
  ]

  // 转换为选项
  const options: SelectOption<Command>[] = commands.map((cmd) => ({
    id: cmd.id,
    label: cmd.label,
    description: cmd.shortcut ? `${cmd.description} (${cmd.shortcut})` : cmd.description,
    category: cmd.category,
    value: cmd,
  }))

  // 处理选择
  const handleSelect = (option: SelectOption<Command>) => {
    option.value.action()
  }

  // 处理取消
  const handleCancel = () => {
    pop()
  }

  return (
    <DialogSelect
      title="Command Palette"
      placeholder="Type a command..."
      options={options}
      onSelect={handleSelect}
      onCancel={handleCancel}
    />
  )
}

