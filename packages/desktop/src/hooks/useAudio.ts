import { useRef, useCallback } from 'react';
import { useAppStore } from '@/lib/store';
import {
  onTtsStreamChunk,
  onTtsStreamError,
  onTtsStreamFinished,
  speakText,
  speakTextStream,
} from '@/lib/tauri';

export function useAudio() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  const mediaSourceRef = useRef<MediaSource | null>(null);
  const sourceBufferRef = useRef<SourceBuffer | null>(null);
  const sourceBufferUpdateHandlerRef = useRef<(() => void) | null>(null);
  const streamQueueRef = useRef<Uint8Array[]>([]);
  const streamEndedRef = useRef(false);
  const streamActiveRef = useRef(false);
  const streamUnlistenersRef = useRef<(() => void)[]>([]);
  const streamErrorRef = useRef<Error | null>(null);
  const streamChunkCountRef = useRef(0);
  const playbackStartedRef = useRef(false);
  const { setStatus, config } = useAppStore();

  const cleanupStream = useCallback(() => {
    streamActiveRef.current = false;
    streamQueueRef.current = [];
    streamEndedRef.current = false;
    streamChunkCountRef.current = 0;
    playbackStartedRef.current = false;

    streamUnlistenersRef.current.forEach((unlisten) => unlisten());
    streamUnlistenersRef.current = [];

    if (sourceBufferRef.current && sourceBufferUpdateHandlerRef.current) {
      sourceBufferRef.current.removeEventListener(
        'updateend',
        sourceBufferUpdateHandlerRef.current
      );
    }
    sourceBufferRef.current = null;
    sourceBufferUpdateHandlerRef.current = null;

    if (mediaSourceRef.current?.readyState === 'open') {
      try {
        mediaSourceRef.current.endOfStream();
      } catch {
        // ignore
      }
    }
    mediaSourceRef.current = null;

    if (audioRef.current) {
      audioRef.current.pause();
    }
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }
  }, []);

  const appendNextChunk = useCallback(() => {
    const sourceBuffer = sourceBufferRef.current;
    if (!sourceBuffer || sourceBuffer.updating) return;

    const queue = streamQueueRef.current;
    if (queue.length > 0) {
      const next = queue.shift();
      if (next) {
        try {
          sourceBuffer.appendBuffer(next);
        } catch (error) {
          streamErrorRef.current =
            error instanceof Error ? error : new Error('TTS stream append failed');
          cleanupStream();
          setStatus('idle');
        }
      }
      return;
    }

    if (streamEndedRef.current && mediaSourceRef.current?.readyState === 'open') {
      try {
        mediaSourceRef.current.endOfStream();
      } catch {
        // ignore
      }
    }
  }, [cleanupStream, setStatus]);

  const canStream = useCallback(() => {
    if (typeof window === 'undefined') return false;
    if (typeof MediaSource === 'undefined') return false;
    return MediaSource.isTypeSupported('audio/mpeg');
  }, []);

  const playStream = useCallback(
    async (text: string) => {
      streamErrorRef.current = null;
      streamActiveRef.current = true;
      streamQueueRef.current = [];
      streamEndedRef.current = false;
      streamChunkCountRef.current = 0;
      playbackStartedRef.current = false;

      console.log('[TTS] stream start', { length: text.length });

      const mediaSource = new MediaSource();
      mediaSourceRef.current = mediaSource;

      const audioUrl = URL.createObjectURL(mediaSource);
      audioUrlRef.current = audioUrl;

      if (audioRef.current?.src) {
        audioRef.current.pause();
        URL.revokeObjectURL(audioRef.current.src);
      }

      const audio = new Audio(audioUrl);
      audioRef.current = audio;

      audio.onended = () => {
        setStatus('idle');
        cleanupStream();
      };

      audio.onerror = () => {
        setStatus('idle');
        cleanupStream();
      };

      const requestPlayback = () => {
        if (playbackStartedRef.current || !audioRef.current) return;
        playbackStartedRef.current = true;
        void audioRef.current.play().catch(() => {
          playbackStartedRef.current = false;
        });
      };

      mediaSource.addEventListener(
        'sourceopen',
        () => {
          const mimeType = 'audio/mpeg';
          if (!MediaSource.isTypeSupported(mimeType)) {
            console.error('TTS stream mime type not supported');
            cleanupStream();
            setStatus('idle');
            return;
          }

          const sourceBuffer = mediaSource.addSourceBuffer(mimeType);
          sourceBufferRef.current = sourceBuffer;

          const handleUpdateEnd = () => {
            appendNextChunk();
          };
          sourceBufferUpdateHandlerRef.current = handleUpdateEnd;
          sourceBuffer.addEventListener('updateend', handleUpdateEnd);
          sourceBuffer.addEventListener('error', () => {
            streamErrorRef.current = new Error('TTS stream source buffer error');
            cleanupStream();
            setStatus('idle');
          });

          appendNextChunk();
        },
        { once: true }
      );

      const [onChunk, onFinished, onError] = await Promise.all([
        onTtsStreamChunk((chunk) => {
          if (!streamActiveRef.current) return;
          if (streamChunkCountRef.current === 0) {
            console.log('[TTS] stream first chunk', { size: chunk.length });
          }
          streamChunkCountRef.current += 1;
          streamQueueRef.current.push(chunk);
          appendNextChunk();
          requestPlayback();
        }),
        onTtsStreamFinished((totalBytes) => {
          if (!streamActiveRef.current) return;
          console.log('[TTS] stream finished', {
            totalBytes,
            chunks: streamChunkCountRef.current,
          });
          streamEndedRef.current = true;
          appendNextChunk();
        }),
        onTtsStreamError((message) => {
          console.error('TTS stream error:', message);
          streamErrorRef.current = new Error(message);
          setStatus('idle');
          cleanupStream();
        }),
      ]);

      streamUnlistenersRef.current = [onChunk, onFinished, onError];

      console.log('[TTS] stream invoke backend', { length: text.length });
      try {
        if (!streamActiveRef.current) {
          return;
        }
        await speakTextStream(text, config?.tts.voiceType);
      } catch (error) {
        streamErrorRef.current =
          error instanceof Error ? error : new Error('TTS stream failed');
      }

      if (streamErrorRef.current) {
        throw streamErrorRef.current;
      }
    },
    [appendNextChunk, cleanupStream, setStatus, config]
  );

  const playOnce = useCallback(
    async (text: string) => {
      console.log('[TTS] playOnce start', { length: text.length });
      const audioBytes = await speakText(text, config?.tts.voiceType);

      const audioBlob = new Blob([audioBytes], { type: 'audio/mp3' });
      const audioUrl = URL.createObjectURL(audioBlob);
      audioUrlRef.current = audioUrl;

      if (audioRef.current) {
        audioRef.current.pause();
        if (audioRef.current.src) {
          URL.revokeObjectURL(audioRef.current.src);
        }
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

      try {
        await audio.play();
      } catch (error) {
        console.error('[TTS] audio play failed', error);
        throw error;
      }
    },
    [config, setStatus]
  );

  const speak = useCallback(
    async (text: string) => {
      if (!text.trim()) return;

      try {
        setStatus('speaking');
        cleanupStream();

        const supportsStream = canStream();
        console.log('[TTS] speak', { length: text.length, supportsStream });

        if (supportsStream) {
          try {
            await playStream(text);
            return;
          } catch (error) {
            console.error('TTS stream error:', error);
            cleanupStream();
            console.warn('[TTS] fallback to non-stream playback');
          }
        } else {
          console.warn('[TTS] stream unsupported, use non-stream playback');
        }

        await playOnce(text);
      } catch (error) {
        console.error('TTS error:', error);
        setStatus('idle');
        cleanupStream();
      }
    },
    [setStatus, cleanupStream, canStream, playStream]
  );

  const stop = useCallback(() => {
    cleanupStream();
    setStatus('idle');
  }, [cleanupStream, setStatus]);

  return {
    speak,
    stop,
  };
}
