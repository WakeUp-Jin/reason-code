import { useState, useCallback } from 'react';

export function VoiceButton() {
  const [isRecording, setIsRecording] = useState(false);

  const handleClick = useCallback(() => {
    setIsRecording((prev) => !prev);
    // TODO: 实际的录音逻辑
    if (!isRecording) {
      console.log('开始录音');
    } else {
      console.log('停止录音');
    }
  }, [isRecording]);

  return (
    <button
      onClick={handleClick}
      className={`
        w-8 h-8 rounded-full flex items-center justify-center
        transition-all duration-200
        focus:outline-none focus:ring-2 focus:ring-offset-2
        ${
          isRecording
            ? 'bg-red-500 hover:bg-red-600 focus:ring-red-400 recording-pulse'
            : 'bg-violet-500 hover:bg-violet-600 focus:ring-violet-400'
        }
      `}
      title={isRecording ? '停止录音' : '开始录音'}
    >
      {isRecording ? (
        // 停止图标（方块）
        <svg className="w-3.5 h-3.5 text-white" fill="currentColor" viewBox="0 0 24 24">
          <rect x="6" y="6" width="12" height="12" rx="2" />
        </svg>
      ) : (
        // 麦克风图标
        <svg
          className="w-4 h-4 text-white"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
          />
        </svg>
      )}
    </button>
  );
}
