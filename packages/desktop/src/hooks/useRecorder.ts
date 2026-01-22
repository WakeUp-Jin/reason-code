import { useRef, useCallback } from 'react';
import { useAppStore } from '@/lib/store';
import { transcribeAudio } from '@/lib/tauri';
import { useAgent } from './useAgent';

export function useRecorder() {
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const { setStatus, setError } = useAppStore();
  const { runAgent } = useAgent();

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus',
      });

      chunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        // 停止所有音轨
        stream.getTracks().forEach((track) => track.stop());

        // 合并音频数据
        const audioBlob = new Blob(chunksRef.current, { type: 'audio/webm' });

        // 转换为 bytes 数组发送到 Rust
        const arrayBuffer = await audioBlob.arrayBuffer();
        const audioBytes = Array.from(new Uint8Array(arrayBuffer));

        try {
          setStatus('transcribing');
          const transcript = await transcribeAudio(audioBytes, 'audio/webm');

          if (transcript.trim()) {
            // 识别成功，调用 Agent
            await runAgent(transcript);
          } else {
            setStatus('idle');
          }
        } catch (error) {
          setError((error as Error).message);
        }
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start(100); // 每 100ms 收集一次数据
    } catch (error) {
      setError('无法访问麦克风，请检查权限设置');
    }
  }, [setStatus, setError, runAgent]);

  const stopRecording = useCallback(async () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
  }, []);

  return {
    startRecording,
    stopRecording,
  };
}
