import { VoiceButton } from './VoiceButton';

interface CollapsedViewProps {
  onExpand: () => void;
}

export function CollapsedView({ onExpand }: CollapsedViewProps) {
  return (
    <div
      className="h-full flex items-center justify-between px-3"
      data-tauri-drag-region
    >
      {/* 左侧：语音按钮 */}
      <VoiceButton />

      {/* 右侧：展开按钮 */}
      <button
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
