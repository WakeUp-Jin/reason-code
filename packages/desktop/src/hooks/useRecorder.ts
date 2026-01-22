import { useRef, useCallback } from 'react';
import { useAppStore } from '@/lib/store';
import { prepareSttAudio } from '@/lib/audio';
import { appendVoiceSessionEntry, transcribeAudio } from '@/lib/tauri';

interface UseRecorderOptions {
  onTranscribed?: (text: string) => void;
}

export function useRecorder(options: UseRecorderOptions = {}) {
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const { setStatus, setError, setIsRecording } = useAppStore();
  const { onTranscribed } = options;
  const recorderMimeTypeRef = useRef<string>('');

  const getAudioStream = useCallback(async (): Promise<MediaStream> => {
    if (navigator.mediaDevices?.getUserMedia) {
      return await navigator.mediaDevices.getUserMedia({ audio: true });
    }

    const legacyGetUserMedia =
      (navigator as any).getUserMedia ||
      (navigator as any).webkitGetUserMedia ||
      (navigator as any).mozGetUserMedia;

    if (legacyGetUserMedia) {
      return await new Promise<MediaStream>((resolve, reject) => {
        legacyGetUserMedia.call(navigator, { audio: true }, resolve, reject);
      });
    }

    throw new Error('当前环境不支持音频采集接口');
  }, []);

  const startRecording = useCallback(async () => {
    try {
      console.log('[Recorder] startRecording');
      setStatus('recording');
      setIsRecording(true);
      if (typeof MediaRecorder === 'undefined') {
        throw new Error('当前环境不支持 MediaRecorder');
      }

      const stream = await getAudioStream();
      const preferredMimeTypes = [
        'audio/webm;codecs=opus',
        'audio/ogg;codecs=opus',
        'audio/webm',
        'audio/ogg',
        'audio/mp4',
        'audio/aac',
        'audio/mpeg',
      ];
      const supportedMimeType = preferredMimeTypes.find((type) =>
        MediaRecorder.isTypeSupported(type)
      );
      const mediaRecorder = supportedMimeType
        ? new MediaRecorder(stream, { mimeType: supportedMimeType })
        : new MediaRecorder(stream);
      recorderMimeTypeRef.current = supportedMimeType ?? '';

      chunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        console.log('[Recorder] onstop');
        setIsRecording(false);
        // 停止所有音轨
        stream.getTracks().forEach((track) => track.stop());

        // 合并音频数据
        const blobType =
          mediaRecorder.mimeType || recorderMimeTypeRef.current || undefined;
        const audioBlob = new Blob(chunksRef.current, { type: blobType });

        try {
          setStatus('transcribing');
          const mimeType =
            mediaRecorder.mimeType || recorderMimeTypeRef.current || '';
          const { audioBytes, mimeType: sttMimeType } = await prepareSttAudio(
            audioBlob,
            mimeType
          );
          const transcript = await transcribeAudio(audioBytes, sttMimeType);

          const cleaned = transcript.trim();
          if (!cleaned) {
            setStatus('idle');
            return;
          }

          void appendVoiceSessionEntry({
            role: 'user',
            text: cleaned,
            source: 'voice',
          }).catch((error) => {
            console.error('Failed to append voice session entry:', error);
          });

          if (onTranscribed) {
            void onTranscribed(cleaned);
          } else {
            setStatus('idle');
          }
        } catch (error) {
          console.error('[Recorder] transcribe failed', error);
          setError((error as Error).message);
        }
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start(100); // 每 100ms 收集一次数据
      console.log('[Recorder] mediaRecorder started', mediaRecorder.mimeType);
    } catch (error) {
      console.error('[Recorder] startRecording failed', error);
      setIsRecording(false);
      setError((error as Error).message || '无法访问麦克风，请检查权限设置');
    }
  }, [setStatus, setIsRecording, setError, getAudioStream, onTranscribed]);

  const stopRecording = useCallback(async () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      console.log('[Recorder] stopRecording');
      setIsRecording(false);
      mediaRecorderRef.current.stop();
    }
  }, [setIsRecording]);

  return {
    startRecording,
    stopRecording,
  };
}
