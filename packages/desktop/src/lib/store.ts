import { create } from 'zustand';

export type AppStatus =
  | 'idle'
  | 'recording'
  | 'transcribing'
  | 'thinking'
  | 'speaking'
  | 'error';

interface AppState {
  // 状态
  status: AppStatus;
  isRecording: boolean;
  output: string;
  error: string | null;

  // 配置
  config: {
    volcengine: {
      appId: string;
      accessToken: string;
      resourceId: string;
    };
    tts: {
      voiceType: string;
      autoSpeak: boolean;
    };
  } | null;

  // Actions
  setStatus: (status: AppStatus) => void;
  setIsRecording: (isRecording: boolean) => void;
  appendOutput: (chunk: string) => void;
  clearOutput: () => void;
  setError: (error: string | null) => void;
  setConfig: (config: AppState['config']) => void;
}

export const useAppStore = create<AppState>((set) => ({
  // 初始状态
  status: 'idle',
  isRecording: false,
  output: '',
  error: null,
  config: null,

  // Actions
  setStatus: (status) => set({ status }),
  setIsRecording: (isRecording) => set({ isRecording }),
  appendOutput: (chunk) =>
    set((state) => ({ output: state.output + chunk })),
  clearOutput: () => set({ output: '' }),
  setError: (error) => set({ error, status: error ? 'error' : 'idle' }),
  setConfig: (config) => set({ config }),
}));
