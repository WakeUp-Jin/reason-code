import { useRef, useCallback } from 'react';
import { useAppStore } from '@/lib/store';
import { speakText } from '@/lib/tauri';

export function useAudio() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const { setStatus, config } = useAppStore();

  const speak = useCallback(
    async (text: string) => {
      if (!text.trim()) return;

      try {
        setStatus('speaking');

        const audioBytes = await speakText(text, config?.tts.voiceType);

        // 创建音频 Blob 并播放
        const audioBlob = new Blob([audioBytes], { type: 'audio/mp3' });
        const audioUrl = URL.createObjectURL(audioBlob);

        if (audioRef.current) {
          audioRef.current.pause();
          URL.revokeObjectURL(audioRef.current.src);
        }

        const audio = new Audio(audioUrl);
        audioRef.current = audio;

        audio.onended = () => {
          setStatus('idle');
          URL.revokeObjectURL(audioUrl);
        };

        audio.onerror = () => {
          setStatus('idle');
          URL.revokeObjectURL(audioUrl);
        };

        await audio.play();
      } catch (error) {
        console.error('TTS error:', error);
        setStatus('idle');
      }
    },
    [setStatus, config]
  );

  const stop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      setStatus('idle');
    }
  }, [setStatus]);

  return {
    speak,
    stop,
  };
}
