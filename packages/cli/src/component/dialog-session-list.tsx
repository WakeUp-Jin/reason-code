import React from 'react'
import { useSessions, useAppStore } from '../context/store.js'
import { useRoute } from '../context/route.js'
import { useDialog } from '../context/dialog.js'
import { DialogSelect, type SelectOption } from '../ui/dialog-select.js'

/**
 * 会话列表对话框
 * 显示所有会话，支持搜索和选择
 */
export function DialogSessionList() {
  const sessions = useSessions()
  const switchSession = useAppStore((state) => state.switchSession)
  const { goToSession } = useRoute()
  const { pop } = useDialog()

  // 将会话转换为选项
  const options: SelectOption<string>[] = sessions.map((session) => {
    const date = new Date(session.updatedAt)
    const dateStr = date.toLocaleDateString()
    const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

    return {
      id: session.id,
      label: session.title,
      description: `${dateStr} ${timeStr}`,
      value: session.id,
    }
  })

  // 处理选择
  const handleSelect = (option: SelectOption<string>) => {
    switchSession(option.value)
    goToSession(option.value)
    pop()
  }

  // 处理取消
  const handleCancel = () => {
    pop()
  }

  return (
    <DialogSelect
      title="Sessions"
      placeholder="Search sessions..."
      options={options}
      onSelect={handleSelect}
      onCancel={handleCancel}
    />
  )
}

