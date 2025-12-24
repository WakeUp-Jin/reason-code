import React, { useEffect, useRef } from 'react';
import { render, Box } from 'ink';
import { ThemeProvider } from './context/theme.js';
import { StoreProvider, useAppStore } from './context/store.js';
import { DialogProvider } from './context/dialog.js';
import { ToastProvider } from './context/toast.js';
import { RouteProvider, useRoute } from './context/route.js';
import { Session } from './routes/session/index.js';
import { useTerminalSize } from './util/useTerminalSize.js';

// 主应用组件 - 启动时自动创建 Session 并进入聊天界面
function App() {
  const { columns: width } = useTerminalSize();
  const createSession = useAppStore((state) => state.createSession);
  const currentSessionId = useAppStore((state) => state.currentSessionId);
  const initialized = useRef(false);

  // 启动时自动创建 Session
  useEffect(() => {
    if (!initialized.current && !currentSessionId) {
      initialized.current = true;
      createSession();
    }
  }, [createSession, currentSessionId]);

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
  return (
    <ThemeProvider>
      <StoreProvider>
        <DialogProvider>
          <ToastProvider>
            <RouteProvider>
              <App />
            </RouteProvider>
          </ToastProvider>
        </DialogProvider>
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
  // 启动前清空终端（包括滚动缓冲区）
  await clearTerminal();

  return new Promise((resolve) => {
    const { waitUntilExit } = render(<Root />);
    waitUntilExit().then(resolve);
  });
}

export { Root, App };
