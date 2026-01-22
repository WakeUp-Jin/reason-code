import { useCallback, useEffect } from 'react';
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
      setStatus('idle');
      setIsRecording(false);
      onFinished?.(fullText);
    }));

    // 监听错误
    registerListener(onAgentError((message) => {
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
      clearOutput();
      if (prefillOutput) {
        appendOutput(prefillOutput);
      }
      setStatus('thinking');

      try {
        await invokeAgent(prompt);
      } catch (error) {
        setError((error as Error).message);
      }
    },
    [clearOutput, appendOutput, setStatus, setError]
  );

  return {
    runAgent,
  };
}
