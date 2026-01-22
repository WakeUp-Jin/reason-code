import { useState, useCallback } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { CollapsedView } from './components/CollapsedView';
import { ExpandedView } from './components/ExpandedView';

function App() {
  const [isExpanded, setIsExpanded] = useState(false);

  // 展开时调整窗口大小
  const handleExpand = useCallback(async () => {
    try {
      const win = getCurrentWindow();
      // 先设置尺寸限制
      await win.setMinSize({ width: 200, height: 118, type: 'Logical' } as any);
      await win.setMaxSize({ width: 200, height: 500, type: 'Logical' } as any);
      // 设置窗口大小
      await win.setSize({ width: 200, height: 300, type: 'Logical' } as any);
      // 启用调整大小
      await win.setResizable(true);
      setIsExpanded(true);
    } catch (error) {
      console.error('Failed to expand window:', error);
    }
  }, []);

  // 收起时恢复窗口大小
  const handleCollapse = useCallback(async () => {
    try {
      const win = getCurrentWindow();
      // 禁用调整大小
      await win.setResizable(false);
      // 重置尺寸限制
      await win.setMinSize({ width: 120, height: 48, type: 'Logical' } as any);
      await win.setMaxSize(null as any);
      // 设置窗口大小
      await win.setSize({ width: 120, height: 48, type: 'Logical' } as any);
      setIsExpanded(false);
    } catch (error) {
      console.error('Failed to collapse window:', error);
    }
  }, []);

  return (
    <div className="w-full h-full bg-white rounded-xl shadow-lg overflow-hidden">
      {isExpanded ? (
        <ExpandedView onCollapse={handleCollapse} />
      ) : (
        <CollapsedView onExpand={handleExpand} />
      )}
    </div>
  );
}

export default App;
