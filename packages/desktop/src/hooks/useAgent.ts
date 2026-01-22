import { useCallback, useEffect } from 'react';
import { useAppStore } from '@/lib/store';
import {
  runAgent as invokeAgent,
  onAgentOutput,
  onAgentFinished,
  onAgentError,
} from '@/lib/tauri';

export function useAgent() {
  const { setStatus, appendOutput, clearOutput, setError, setIsRecording } =
    useAppStore();

  // 监听 Agent 事件
  useEffect(() => {
    const unlisteners: (() => void)[] = [];

    // 监听输出
    onAgentOutput((chunk) => {
      appendOutput(chunk);
    }).then((unlisten) => unlisteners.push(unlisten));

    // 监听完成
    onAgentFinished((_fullText) => {
      setStatus('idle');
      setIsRecording(false);
    }).then((unlisten) => unlisteners.push(unlisten));

    // 监听错误
    onAgentError((message) => {
      setError(message);
      setIsRecording(false);
    }).then((unlisten) => unlisteners.push(unlisten));

    return () => {
      unlisteners.forEach((unlisten) => unlisten());
    };
  }, [appendOutput, setStatus, setError, setIsRecording]);

  const runAgent = useCallback(
    async (prompt: string) => {
      clearOutput();
      setStatus('thinking');

      try {
        await invokeAgent(prompt);
      } catch (error) {
        setError((error as Error).message);
      }
    },
    [clearOutput, setStatus, setError]
  );

  return {
    runAgent,
  };
}
