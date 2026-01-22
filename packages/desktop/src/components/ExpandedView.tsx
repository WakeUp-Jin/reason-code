import { useState, useCallback, KeyboardEvent, MouseEvent } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { OutputPanel } from './OutputPanel';
import { VoiceButton } from './VoiceButton';
import { appendVoiceSessionEntry } from '@/lib/tauri';

interface ExpandedViewProps {
  onCollapse: () => void;
  onPrompt: (text: string) => Promise<void>;
}

export function ExpandedView({ onCollapse, onPrompt }: ExpandedViewProps) {
  const [inputText, setInputText] = useState('');

  const handleTitleBarMouseDown = useCallback((e: MouseEvent<HTMLDivElement>) => {
    // Ignore drags that begin on no-drag controls (e.g. the collapse button).
    if ((e.target as HTMLElement)?.closest?.('[data-tauri-drag-region="false"]')) return;
    getCurrentWindow().startDragging().catch(console.error);
  }, []);

  const handleSend = useCallback(() => {
    const text = inputText.trim();
    if (!text) return;

    setInputText('');

    void appendVoiceSessionEntry({
      role: 'user',
      text,
      source: 'text',
    }).catch((error) => {
      console.error('Failed to append voice session entry:', error);
    });

    void onPrompt(text);
  }, [inputText, onPrompt]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  const handleResizeMouseDown = useCallback(() => {
    getCurrentWindow().startResizeDragging('South').catch(console.error);
  }, []);

  return (
    <div className="h-full flex flex-col">
      {/* 顶栏 - 40px, 可拖动 */}
      <div
        data-tauri-drag-region
        onMouseDown={handleTitleBarMouseDown}
        className="h-10 flex items-center px-3 border-b border-gray-100 shrink-0 relative"
      >
        <button
          data-tauri-drag-region="false"
          onClick={onCollapse}
          className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 transition-colors"
          title="收起"
        >
          <svg
            className="w-4 h-4 text-gray-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 19l-7-7 7-7"
          />
        </svg>
        </button>
        <div
          data-tauri-drag-region="false"
          className="absolute left-1/2 -translate-x-1/2"
        >
          <VoiceButton size="sm" onTranscribed={onPrompt} />
        </div>
      </div>

      {/* 输出区域 - 自适应高度，最小 30px */}
      <div className="flex-1 overflow-auto min-h-[30px]">
        <OutputPanel />
      </div>

      {/* 底栏 - 48px, 输入框 + 发送按钮 */}
      <div className="h-12 mb-2 flex items-center gap-2 px-3 border-t border-gray-100 shrink-0">
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="输入消息..."
          className="flex-1 h-8 px-3 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-transparent"
        />
        <button
          onClick={handleSend}
          disabled={!inputText.trim()}
          className="w-8 h-8 flex items-center justify-center bg-violet-500 hover:bg-violet-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
          title="发送"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 19V5m0 0l-7 7m7-7l7 7"
            />
          </svg>
        </button>
      </div>

      {/* 底部拖拽手柄 - 更明显的高度调整入口 */}
      <div
        onMouseDown={handleResizeMouseDown}
        className="h-2 flex items-center justify-center cursor-row-resize select-none"
        title="拖拽调整高度"
      >
        <div className="w-10 h-0.5 bg-gray-300 rounded-full" />
      </div>
    </div>
  );
}
