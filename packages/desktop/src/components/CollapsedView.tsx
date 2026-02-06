import { useCallback } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { VoiceButton } from './VoiceButton';

interface CollapsedViewProps {
  onExpand: () => void;
  onPrompt: (text: string) => Promise<void>;
}

export function CollapsedView({ onExpand, onPrompt }: CollapsedViewProps) {
  const handleDragMouseDown = useCallback(() => {
    // Fallback for environments where CSS drag regions are ignored/limited.
    getCurrentWindow().startDragging().catch(console.error);
  }, []);

  return (
    <div className="h-full flex items-center px-3 gap-2">
      {/* 左侧：语音按钮 */}
      <VoiceButton onTranscribed={onPrompt} />

      {/* 中间：拖拽把手（避免与按钮点击冲突） */}
      <div
        data-tauri-drag-region
        onMouseDown={handleDragMouseDown}
        className="flex-1 h-8 rounded-md hover:bg-gray-50 cursor-grab active:cursor-grabbing"
        title="拖动移动窗口"
      />

      {/* 右侧：展开按钮 */}
      <button
        data-tauri-drag-region="false"
        onClick={onExpand}
        className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 transition-colors"
        title="展开"
      >
        <svg
          className="w-5 h-5 text-gray-600"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 5l7 7-7 7"
          />
        </svg>
      </button>
    </div>
  );
}
