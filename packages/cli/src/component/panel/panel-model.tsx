import React from 'react';
import { useAppStore } from '../../context/store.js';
import { PanelSelect, type SelectOption } from '../../ui/panel-select.js';
import { usePersistence } from '../../hooks/usePersistence.js';
import { useAgent } from '../../hooks/useAgent.js';

export interface PanelModelProps {
  onClose: () => void;
}

/**
 * 解析模型 ID
 * 格式：provider/model 或 model（默认 deepseek）
 */
function parseModelId(modelId: string): { provider: string; model: string } {
  if (modelId.includes('/')) {
    const [provider, model] = modelId.split('/');
    return { provider, model };
  }
  // 默认使用 deepseek
  return { provider: 'deepseek', model: modelId };
}

/**
 * 模型选择面板
 */
export function PanelModel({ onClose }: PanelModelProps) {
  const models = useAppStore((state) => state.models);
  const currentModel = useAppStore((state) => state.currentModel);
  const setCurrentModel = useAppStore((state) => state.setCurrentModel);
  const { saveConfig } = usePersistence();
  const { switchModel } = useAgent();

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
    // 解析模型 ID 获取 provider 和 model
    const { provider, model } = parseModelId(option.value);

    // 更新 UI 状态
    setCurrentModel(option.value);

    // 保存配置到本地
    saveConfig({ model: { current: option.value } });

    // 更新 Agent 实例的模型（异步，不阻塞 UI）
    switchModel(provider, model);

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
