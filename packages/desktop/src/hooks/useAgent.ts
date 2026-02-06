import { useCallback, useEffect, useRef } from 'react';
import { useAppStore } from '@/lib/store';
import {
  runAgent as invokeAgent,
  onAgentOutput,
  onAgentFinished,
  onAgentError,
} from '@/lib/tauri';

interface UseAgentOptions {
  onFinished?: (fullText: string) => void;
  onError?: (message: string) => void;
}

export function useAgent(options: UseAgentOptions = {}) {
  const { setStatus, appendOutput, clearOutput, setError, setIsRecording } =
    useAppStore();
  const { onFinished, onError } = options;
  const finishHandledRef = useRef(false);

  // 监听 Agent 事件
  useEffect(() => {
    let isActive = true;
    const unlisteners: (() => void)[] = [];

    const registerListener = (promise: Promise<() => void>) => {
      promise.then((unlisten) => {
        if (!isActive) {
          unlisten();
          return;
        }
        unlisteners.push(unlisten);
      });
    };

    // 监听输出
    registerListener(onAgentOutput((chunk) => {
      appendOutput(chunk);
    }));

    // 监听完成
    registerListener(onAgentFinished((fullText) => {
      if (finishHandledRef.current) return;
      finishHandledRef.current = true;
      console.log('[Agent] finished event', { length: fullText.length });
      setStatus('idle');
      setIsRecording(false);
      onFinished?.(fullText);
    }));

    // 监听错误
    registerListener(onAgentError((message) => {
      finishHandledRef.current = true;
      console.error('[Agent] error event', message);
      setError(message);
      setIsRecording(false);
      onError?.(message);
    }));

    return () => {
      isActive = false;
      unlisteners.forEach((unlisten) => unlisten());
    };
  }, [appendOutput, setStatus, setError, setIsRecording, onFinished, onError]);

  const runAgent = useCallback(
    async (prompt: string, prefillOutput?: string) => {
      finishHandledRef.current = false;
      clearOutput();
      if (prefillOutput) {
        appendOutput(prefillOutput);
      }
      setStatus('thinking');
      console.log('[Agent] run', { length: prompt.length });

      try {
        const fullText = await invokeAgent(prompt);
        if (!finishHandledRef.current) {
          finishHandledRef.current = true;
          console.log('[Agent] finished via invoke', { length: fullText.length });
          setStatus('idle');
          setIsRecording(false);
          onFinished?.(fullText);
        }
      } catch (error) {
        finishHandledRef.current = true;
        console.error('[Agent] invoke failed', error);
        setError((error as Error).message);
        setIsRecording(false);
      }
    },
    [clearOutput, appendOutput, setStatus, setError, setIsRecording, onFinished]
  );

  return {
    runAgent,
  };
}
