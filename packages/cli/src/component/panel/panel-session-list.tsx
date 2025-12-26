import React from 'react';
import { useSessions, useAppStore } from '../../context/store.js';
import { useRoute } from '../../context/route.js';
import { PanelSelect, type SelectOption } from '../../ui/panel-select.js';

export interface PanelSessionListProps {
  onClose: () => void;
}

/**
 * 会话列表面板
 * 显示所有会话，支持搜索和选择
 */
export function PanelSessionList({ onClose }: PanelSessionListProps) {
  const sessions = useSessions();
  const switchSession = useAppStore((state) => state.switchSession);
  const { goToSession } = useRoute();

  // 将会话转换为选项
  const options: SelectOption<string>[] = sessions.map((session) => {
    const date = new Date(session.updatedAt);
    const dateStr = date.toLocaleDateString();
    const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    return {
      id: session.id,
      label: session.title,
      description: `${dateStr} ${timeStr}`,
      value: session.id,
    };
  });

  // 处理选择
  const handleSelect = (option: SelectOption<string>) => {
    switchSession(option.value);
    goToSession(option.value);
    onClose();
  };

  // 处理取消
  const handleCancel = () => {
    onClose();
  };

  return (
    <PanelSelect
      title="Sessions"
      placeholder="Search sessions..."
      options={options}
      onSelect={handleSelect}
      onCancel={handleCancel}
    />
  );
}
