import React from 'react';
import { useAppStore } from '../../context/store.js';
import { PanelSelect, type SelectOption } from '../../ui/panel-select.js';
import { usePersistence } from '../../hooks/usePersistence.js';

export interface PanelModelProps {
  onClose: () => void;
}

/**
 * 模型选择面板
 */
export function PanelModel({ onClose }: PanelModelProps) {
  const models = useAppStore((state) => state.models);
  const currentModel = useAppStore((state) => state.currentModel);
  const setCurrentModel = useAppStore((state) => state.setCurrentModel);
  const { saveConfig } = usePersistence();

  // 转换为选项
  const options: SelectOption<string>[] = models.map((model) => ({
    id: model.id,
    label: model.name,
    description: model.provider + (model.id === currentModel ? ' (current)' : ''),
    category: model.provider,
    value: model.id,
    isCurrent: model.id === currentModel, // 标记当前模型
  }));

  // 处理选择
  const handleSelect = (option: SelectOption<string>) => {
    setCurrentModel(option.value);

    // 保存配置
    saveConfig({ model: { current: option.value } });

    onClose();
  };

  // 处理取消
  const handleCancel = () => {
    onClose();
  };

  return (
    <PanelSelect
      title="Select Model"
      placeholder="Search models..."
      options={options}
      onSelect={handleSelect}
      onCancel={handleCancel}
    />
  );
}
