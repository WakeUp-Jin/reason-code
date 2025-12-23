import React from 'react'
import { useAppStore, useCurrentSession } from '../context/store.js'
import { useDialog } from '../context/dialog.js'
import { DialogPrompt } from '../ui/dialog-prompt.js'

/**
 * 会话重命名对话框
 */
export function DialogSessionRename() {
  const session = useCurrentSession()
  const renameSession = useAppStore((state) => state.renameSession)
  const { pop } = useDialog()

  if (!session) {
    pop()
    return null
  }

  // 处理提交
  const handleSubmit = (value: string) => {
    renameSession(session.id, value)
    pop()
  }

  // 处理取消
  const handleCancel = () => {
    pop()
  }

  // 验证输入
  const validate = (value: string): string | null => {
    if (!value.trim()) {
      return 'Session name cannot be empty'
    }
    if (value.length > 100) {
      return 'Session name is too long (max 100 characters)'
    }
    return null
  }

  return (
    <DialogPrompt
      title="Rename Session"
      message={`Current name: ${session.title}`}
      placeholder="Enter new name..."
      defaultValue={session.title}
      onSubmit={handleSubmit}
      onCancel={handleCancel}
      validate={validate}
    />
  )
}

