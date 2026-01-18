import React from 'react';
import { commandRegistry } from './command-registry.js';
import { PanelModel } from '../panel/panel-model.js';
import { PanelSessionList } from '../panel/panel-session-list.js';
import { PanelSessionRename } from '../panel/panel-session-rename.js';
import { PanelTheme } from '../panel/panel-theme.js';
import { PanelHelp } from '../panel/panel-help.js';
import { useAppStore } from '../../context/store.js';
import { useRoute } from '../../context/route.js';
import { logger } from '../../util/logger.js';

/**
 * 注册所有核心命令
 * 在应用启动时调用
 */
export function registerCommands() {
  // ============================================================
  // Model 相关命令
  // ============================================================

  commandRegistry.register({
    id: 'model',
    name: 'model',
    label: 'Select Model',
    description: 'Change AI model',
    category: 'Model',
    type: 'panel',
    panelFactory: (onClose) => <PanelModel onClose={onClose} />,
  });

  // ============================================================
  // Session 相关命令
  // ============================================================

  commandRegistry.register({
    id: 'resume',
    name: 'resume',
    label: 'Resume Session',
    description: 'Resume a previous session',
    category: 'Session',
    type: 'panel',
    panelFactory: (onClose) => <PanelSessionList onClose={onClose} />,
  });

  commandRegistry.register({
    id: 'new',
    name: 'new',
    label: 'New Session',
    description: 'Create a new chat session',
    category: 'Session',
    type: 'instant',
    action: async () => {
      // 在 action 内部动态获取 store 状态
      const { createSession } = useAppStore.getState();
      const session = await createSession();

      // 通过 window 访问路由（临时方案）
      // TODO: 改进命令系统使其能访问 React hooks
      logger.debug('New session created', { sessionId: session.id });
    },
  });

  commandRegistry.register({
    id: 'rename',
    name: 'rename',
    label: 'Rename Session',
    description: 'Rename current session',
    category: 'Session',
    type: 'panel',
    panelFactory: (onClose) => <PanelSessionRename onClose={onClose} />,
  });

  // ============================================================
  // Appearance 相关命令
  // ============================================================

  commandRegistry.register({
    id: 'theme',
    name: 'theme',
    label: 'Select Theme',
    description: 'Change color theme',
    category: 'Appearance',
    type: 'panel',
    panelFactory: (onClose) => <PanelTheme onClose={onClose} />,
  });

  // ============================================================
  // System 相关命令
  // ============================================================

  commandRegistry.register({
    id: 'clear',
    name: 'clear',
    label: 'Clear Screen',
    description: 'Clear terminal screen',
    category: 'System',
    type: 'instant',
    action: () => {
      // 清空终端（包括滚动缓冲区）
      process.stdout.write('\x1b[2J\x1b[3J\x1b[H');
    },
  });

  commandRegistry.register({
    id: 'help',
    name: 'help',
    label: 'Show Help',
    description: 'Display all available commands',
    category: 'System',
    type: 'panel',
    panelFactory: (onClose) => <PanelHelp onClose={onClose} />,
  });
}
