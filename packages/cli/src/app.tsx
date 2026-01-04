import React, { useEffect, useRef } from 'react';
import { render, Box } from 'ink';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { ThemeProvider } from './context/theme.js';
import { StoreProvider, useAppStore } from './context/store.js';
import { ToastProvider } from './context/toast.js';
import { RouteProvider, useRoute } from './context/route.js';
import { ExecutionProvider } from './context/execution.js';
import { Session } from './routes/session/index.js';
import { useTerminalSize } from './util/useTerminalSize.js';
import { registerCommands } from './component/command/index.js';
import { logger } from './util/logger.js';
import { logger as coreLogger } from '@reason-cli/core';
import { loadAllData } from './persistence/loader.js';
import { usePersistence } from './hooks/usePersistence.js';
import { configManager } from './config/manager.js';

// 获取项目根目录的绝对路径
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..', '..', '..');

// 主应用组件 - 启动时加载数据或创建新 Session
function App() {
  const { columns: width } = useTerminalSize();
  const createSession = useAppStore((state) => state.createSession);
  const initializeFromDisk = useAppStore((state) => state.initializeFromDisk);
  const currentSessionId = useAppStore((state) => state.currentSessionId);
  const initialized = useRef(false);
  const commandsRegistered = useRef(false);
  const { saveAll } = usePersistence();

  // 注册所有命令（只执行一次）
  useEffect(() => {
    if (!commandsRegistered.current) {
      commandsRegistered.current = true;
      registerCommands();
    }
  }, []);

  // 启动时加载数据
  useEffect(() => {
    if (!initialized.current) {
      initialized.current = true;

      // 加载配置和会话数据
      const loadedData = loadAllData();

      if (loadedData.sessions.length > 0) {
        // 有历史数据，加载到内存（但不恢复旧会话）
        initializeFromDisk({
          sessions: loadedData.sessions,
          messages: loadedData.messages,
          currentSessionId: null, // 不恢复旧会话
          currentAgent: loadedData.config.agent.current,
          currentModel: loadedData.config.model.current,
          currency: loadedData.config.ui.currency,
          exchangeRate: loadedData.config.ui.exchangeRate,
        });
      }

      // 总是创建新会话
      createSession();
    }
  }, [createSession, initializeFromDisk]);

  // 监听退出事件，保存所有数据
  useEffect(() => {
    const handleExit = () => {
      saveAll();
    };

    // 注册退出处理器
    process.on('exit', handleExit);

    return () => {
      process.off('exit', handleExit);
    };
  }, [saveAll]);

  // 等待 Session 创建完成
  if (!currentSessionId) {
    return null;
  }

  return (
    <Box key={`app-${width}`} flexDirection="column" width={width}>
      <Session />
    </Box>
  );
}

// 根组件，包含所有 Provider
function Root() {
  // 加载配置以获取主题设置
  const config = configManager.getConfig();

  return (
    <ThemeProvider
      defaultTheme={config.ui.theme as any}
      defaultMode={config.ui.mode}
    >
      <StoreProvider>
        <ToastProvider>
          <RouteProvider>
            <ExecutionProvider>
              <App />
            </ExecutionProvider>
          </RouteProvider>
        </ToastProvider>
      </StoreProvider>
    </ThemeProvider>
  );
}

// 清空终端（包括滚动缓冲区）
function clearTerminal(): Promise<void> {
  return new Promise((resolve) => {
    // \x1b[2J - 清空屏幕
    // \x1b[3J - 清空滚动缓冲区（这是关键！）
    // \x1b[H  - 移动光标到左上角
    process.stdout.write('\x1b[2J\x1b[3J\x1b[H', () => {
      resolve();
    });
  });
}

// TUI 启动函数
export async function startTUI(): Promise<void> {
  // 日志目录使用项目根目录的绝对路径
  const coreLogsDir = join(PROJECT_ROOT, 'logs', 'core');

  // 初始化 CLI 日志系统
  logger.createSession();
  logger.info('CLI starting', {
    platform: process.platform,
    nodeVersion: process.version,
    cwd: process.cwd(),
  });

  // 配置并初始化 Core 日志系统（使用独立的 core 日志目录）
  coreLogger.configure({
    logsDir: coreLogsDir,
    enabled: true,
    minLevel: 'INFO',
    bufferSize: 1, // 立即写入，确保日志不丢失
  });
  coreLogger.createSession();

  // 优雅关闭处理器
  const handleShutdown = (signal: string) => {
    logger.info(`Received ${signal}, shutting down...`);

    // TODO: 这里无法使用 Hook，所以需要手动保存
    // 实际的保存会在 App 组件的 'exit' 事件监听器中处理

    logger.flush();
    coreLogger.flush();
    process.exit(0);
  };

  // 捕获 Ctrl+C (SIGINT)
  process.on('SIGINT', () => handleShutdown('SIGINT'));

  // 捕获终止信号 (SIGTERM)
  process.on('SIGTERM', () => handleShutdown('SIGTERM'));

  // 捕获未处理的异常
  process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception', {
      name: error.name,
      message: error.message,
      stack: error.stack,
    });
    logger.flush();
    process.exit(1);
  });

  // 捕获未处理的 Promise 拒绝
  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled promise rejection', {
      reason: String(reason),
    });
    logger.flush();
  });

  // 启动前清空终端（包括滚动缓冲区）
  await clearTerminal();

  return new Promise((resolve) => {
    const { waitUntilExit } = render(<Root />);
    waitUntilExit().then(() => {
      logger.info('CLI exiting gracefully');
      logger.flush();
      coreLogger.flush();
      resolve();
    });
  });
}

export { Root, App };
