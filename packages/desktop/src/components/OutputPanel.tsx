import { useEffect, useRef } from 'react';
import { useAppStore } from '@/lib/store';

export function OutputPanel() {
  const output = useAppStore((state) => state.output);
  const scrollRef = useRef<HTMLDivElement>(null);

  // 自动滚动到底部
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [output]);

  const isEmpty = !output;

  return (
    <div ref={scrollRef} className="h-full overflow-y-auto px-3 py-2">
      {isEmpty ? (
        <div className="h-full flex flex-col items-center justify-center text-gray-400">
          <svg
            className="w-8 h-8 mb-2 text-gray-300"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
            />
          </svg>
          <p className="text-xs">点击麦克风开始</p>
        </div>
      ) : (
        <div className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">
          {output}
        </div>
      )}
    </div>
  );
}
