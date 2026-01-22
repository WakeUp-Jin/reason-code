import { useState, useCallback, useEffect } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { CollapsedView } from './components/CollapsedView';
import { ExpandedView } from './components/ExpandedView';
import { useAppStore } from '@/lib/store';
import { appendVoiceSessionEntry, startVoiceSession } from '@/lib/tauri';
import { useAgent } from '@/hooks/useAgent';
import { useAudio } from '@/hooks/useAudio';

function App() {
  const [isExpanded, setIsExpanded] = useState(false);
  const output = useAppStore((state) => state.output);
  const setVoiceSessionId = useAppStore((state) => state.setVoiceSessionId);
  const { speak } = useAudio();

  const handleAgentFinished = useCallback(
    (fullText: string) => {
      const text = fullText.trim();
      if (!text) return;

      void appendVoiceSessionEntry({
        role: 'assistant',
        text,
        source: 'agent',
      }).catch((error) => {
        console.error('Failed to append voice session entry:', error);
      });

      // TODO: 待确定音色后再开启 TTS
      // void speak(text);
    },
    [speak]
  );

  const { runAgent } = useAgent({ onFinished: handleAgentFinished });

  // 展开时调整窗口大小
  const handleExpand = useCallback(async () => {
    try {
      const win = getCurrentWindow();
      // 先设置尺寸限制
      await win.setMinSize({ width: 300, height: 118, type: 'Logical' } as any);
      await win.setMaxSize({ width: 300, height: 500, type: 'Logical' } as any);
      // 设置窗口大小
      await win.setSize({ width: 300, height: 400, type: 'Logical' } as any);
      // 启用调整大小
      await win.setResizable(true);
      setIsExpanded(true);
    } catch (error) {
      console.error('Failed to expand window:', error);
    }
  }, []);

  useEffect(() => {
    if (!isExpanded && output.trim()) {
      handleExpand();
    }
  }, [isExpanded, output, handleExpand]);

  useEffect(() => {
    let isActive = true;

    startVoiceSession()
      .then((sessionId) => {
        if (isActive) {
          setVoiceSessionId(sessionId);
        }
      })
      .catch((error) => {
        console.error('Failed to start voice session:', error);
      });

    return () => {
      isActive = false;
    };
  }, [setVoiceSessionId]);

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
        <ExpandedView onCollapse={handleCollapse} onPrompt={runAgent} />
      ) : (
        <CollapsedView onExpand={handleExpand} onPrompt={runAgent} />
      )}
    </div>
  );
}

export default App;
