import React from 'react';
import { useAppStore, useCurrentSession } from '../../context/store.js';
import { PanelPrompt } from '../../ui/panel-prompt.js';

export interface PanelSessionRenameProps {
  onClose: () => void;
}

/**
 * 会话重命名面板
 */
export function PanelSessionRename({ onClose }: PanelSessionRenameProps) {
  const session = useCurrentSession();
  const renameSession = useAppStore((state) => state.renameSession);

  if (!session) {
    onClose();
    return null;
  }

  // 处理提交
  const handleSubmit = (value: string) => {
    renameSession(session.id, value);
    onClose();
  };

  // 处理取消
  const handleCancel = () => {
    onClose();
  };

  // 验证输入
  const validate = (value: string): string | null => {
    if (!value.trim()) {
      return 'Session name cannot be empty';
    }
    if (value.length > 100) {
      return 'Session name is too long (max 100 characters)';
    }
    return null;
  };

  return (
    <PanelPrompt
      title="Rename Session"
      message={`Current name: ${session.title}`}
      placeholder="Enter new name..."
      defaultValue={session.title}
      onSubmit={handleSubmit}
      onCancel={handleCancel}
      validate={validate}
    />
  );
}
