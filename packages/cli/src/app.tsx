import React, { useEffect } from 'react';
import { render, Box } from 'ink';
import type { Instance } from 'ink';
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
import { logger as coreLogger, initializeSession } from '@reason-cli/core';
import { shutdownMonitorWriter } from './hooks/useAgent.js';
import { loadAllData } from './persistence/loader.js';
import { usePersistence } from './hooks/usePersistence.js';
import { configService } from './config/index.js';

// 获取项目根目录的绝对路径
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..', '..', '..');

// ==================== 模块级状态 ====================
let appInitialized = false;
let commandsRegistered = false;

/** 当前 Agent 类型 (build | steward | explore) */
let currentAgentMode = 'build';

/**
 * 获取当前 Agent 模式
 */
export function getAgentMode(): string {
  return currentAgentMode;
}

// ==================== Ink 实例管理 ====================

/** 当前 Ink 渲染实例 */
let inkInstance: Instance | null = null;

// 主应用组件 - 启动时加载数据或创建新 Session
function App() {
  const { columns: width } = useTerminalSize();
  const createSession = useAppStore((state) => state.createSession);
  const initializeFromDisk = useAppStore((state) => state.initializeFromDisk);
  const loadModels = useAppStore((state) => state.loadModels);
  const currentSessionId = useAppStore((state) => state.currentSessionId);
  const { saveAll } = usePersistence();

  // 注册所有命令（只执行一次）
  useEffect(() => {
    if (!commandsRegistered) {
      commandsRegistered = true;
      registerCommands();
    }
  }, []);

  // 启动时加载数据（只执行一次）
  useEffect(() => {
    if (!appInitialized) {
      appInitialized = true;

      // 初始化Session模块（使用用户目录存储）
      initializeSession('filesystem', '~/.reason-code/sessions');

      // 异步加载配置和会话数据
      (async () => {
        try {
          const loadedData = await loadAllData();

          // 从配置文件加载模型列表（/model 命令会用到）
          await loadModels();

          if (loadedData.sessions.length > 0) {
            // 有历史数据，加载到内存（但不恢复旧会话）
            // 新配置格式：model.primary.provider/model.primary.model
            const primaryModel = loadedData.config.model.primary;
            const currentModel = `${primaryModel.provider}/${primaryModel.model}`;
            
            initializeFromDisk({
              sessions: loadedData.sessions,
              messages: loadedData.messages,
              currentSessionId: null, // 不恢复旧会话
              currentModel,
              currency: loadedData.config.ui.currency,
              exchangeRate: loadedData.config.ui.exchangeRate,
              approvalMode: loadedData.config.ui.approvalMode,
            });
          }

          // 总是创建新会话
          createSession();
        } catch (error) {
          logger.error('Failed to load data on startup', { error });
          // 即使加载失败也创建新会话
          createSession();
        }
      })();
    }
  }, [createSession, initializeFromDisk, loadModels]);

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
  // 使用默认主题，配置会在 App 中异步加载
  // 主题切换可以通过 ThemeProvider 的 context 进行
  return (
    <ThemeProvider defaultTheme="kanagawa">
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

/** TUI 启动选项 */
export interface StartTUIOptions {
  /** Agent 模式 (build | butler) */
  mode?: string;
}

// TUI 启动函数
export async function startTUI(options: StartTUIOptions = {}): Promise<void> {
  // 设置 Agent 模式
  currentAgentMode = options.mode || 'build';
  
  // 日志目录使用项目根目录的绝对路径
  const coreLogsDir = join(PROJECT_ROOT, 'logs', 'core');

  // 1. 初始化 CLI 日志系统
  // 优先级：环境变量 > 配置文件 > 代码默认值
  logger.loadConfigFromFile(); // 从 logger.config.json 加载（如果存在）
  logger.configureFromEnv(); // 环境变量覆盖
  logger.createSession(); // 创建日志 session

  logger.info('CLI starting', {
    platform: process.platform,
    nodeVersion: process.version,
    cwd: process.cwd(),
  });

  // 2. 配置并初始化 Core 日志系统
  // Core 和 CLI 使用相同的日志级别配置
  coreLogger.loadConfigFromFile(); // 从 logger.config.json 加载（如果存在）
  coreLogger.configure({
    logsDir: coreLogsDir, // CLI 注入日志目录
    enabled: true, // Core 默认启用
  });
  coreLogger.configureFromEnv(); // 环境变量覆盖
  coreLogger.createSession(); // 创建日志 session

  // 优雅关闭处理器
  const handleShutdown = (signal: string) => {
    logger.info(`Received ${signal}, shutting down...`);
    // 将 MonitorWriter 标记为 idle
    shutdownMonitorWriter();
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

  return new Promise((resolve) => {
    // 直接在主屏幕渲染（支持终端滚动）
    inkInstance = render(<Root />);

    inkInstance.waitUntilExit().then(() => {
      logger.info('CLI exiting gracefully');
      logger.flush();
      coreLogger.flush();
      resolve();
    });
  });
}

export { Root, App };
