import { useState, useCallback, useEffect, useRef } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { CollapsedView } from './components/CollapsedView';
import { ExpandedView } from './components/ExpandedView';
import { useAppStore } from '@/lib/store';
import { appendVoiceSessionEntry, startVoiceSession } from '@/lib/tauri';
import { useAudio } from '@/hooks/useAudio';
import { useAgent } from '@/hooks/useAgent';

function App() {
  const [isExpanded, setIsExpanded] = useState(false);
  const output = useAppStore((state) => state.output);
  const lastOutputRef = useRef(output);
  const lastPromptRef = useRef('');
  const setVoiceSessionId = useAppStore((state) => state.setVoiceSessionId);
  const setOutput = useAppStore((state) => state.setOutput);
  const { speak } = useAudio();
  const { runAgent } = useAgent({
    onFinished: (fullText) => {
      const cleaned = fullText.trimEnd();
      if (!cleaned) return;

      void appendVoiceSessionEntry({
        role: 'assistant',
        text: cleaned,
        source: 'agent',
      }).catch((error) => {
        console.error('Failed to append voice session entry:', error);
      });

      const prompt = lastPromptRef.current.trim();
      const finalOutput = prompt
        ? `你：${prompt}\n\nAgent：${cleaned}`
        : cleaned;
      setOutput(finalOutput);

      void speak(cleaned);
    },
  });

  const handlePrompt = useCallback(
    async (text: string) => {
      const cleaned = text.trim();
      if (!cleaned) return;

      lastPromptRef.current = cleaned;
      const prefill = `你：${cleaned}\n\nAgent：`;
      await runAgent(cleaned, prefill);
    },
    [runAgent]
  );

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
    const previousOutput = lastOutputRef.current;
    const hasNewOutput =
      output !== previousOutput && output.trim().length > 0;

    if (!isExpanded && hasNewOutput) {
      handleExpand();
    }

    lastOutputRef.current = output;
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
        <ExpandedView onCollapse={handleCollapse} onPrompt={handlePrompt} />
      ) : (
        <CollapsedView onExpand={handleExpand} onPrompt={handlePrompt} />
      )}
    </div>
  );
}

export default App;
