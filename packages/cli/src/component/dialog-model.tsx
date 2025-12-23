import React from 'react'
import { useDialog } from '../context/dialog.js'
import { useAppStore } from '../context/store.js'
import { DialogSelect, type SelectOption } from '../ui/dialog-select.js'

/**
 * 模型选择对话框
 */
export function DialogModel() {
  const { pop } = useDialog()
  const models = useAppStore((state) => state.models)
  const currentModel = useAppStore((state) => state.currentModel)
  const setCurrentModel = useAppStore((state) => state.setCurrentModel)

  // 转换为选项
  const options: SelectOption<string>[] = models.map((model) => ({
    id: model.id,
    label: model.name,
    description: model.provider + (model.id === currentModel ? ' (current)' : ''),
    category: model.provider,
    value: model.id,
  }))

  // 处理选择
  const handleSelect = (option: SelectOption<string>) => {
    setCurrentModel(option.value)
    pop()
  }

  // 处理取消
  const handleCancel = () => {
    pop()
  }

  return (
    <DialogSelect
      title="Select Model"
      placeholder="Search models..."
      options={options}
      onSelect={handleSelect}
      onCancel={handleCancel}
    />
  )
}

