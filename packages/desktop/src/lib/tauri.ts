import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';

// ============ 配置管理 ============

export interface VolcengineConfig {
  appId: string;
  accessToken: string;
  resourceId: string;
  tts: {
    voiceType: string;
    cluster: string;
  };
}

export async function getVolcengineConfig(): Promise<VolcengineConfig | null> {
  try {
    return await invoke<VolcengineConfig>('get_volcengine_config');
  } catch {
    return null;
  }
}

export async function saveVolcengineConfig(
  config: VolcengineConfig
): Promise<void> {
  await invoke('save_volcengine_config', { config });
}

// ============ 语音识别 (STT) ============

export async function transcribeAudio(
  audioBytes: number[],
  mimeType: string
): Promise<string> {
  return await invoke<string>('stt_transcribe', { audioBytes, mimeType });
}

// ============ Agent 调用 ============

export async function runAgent(prompt: string): Promise<string> {
  return await invoke<string>('agent_run', { prompt });
}

export function onAgentOutput(
  callback: (chunk: string) => void
): Promise<UnlistenFn> {
  return listen<{ chunk: string }>('agent-output', (event) => {
    callback(event.payload.chunk);
  });
}

export function onAgentFinished(
  callback: (fullText: string) => void
): Promise<UnlistenFn> {
  return listen<{ fullText: string }>('agent-finished', (event) => {
    callback(event.payload.fullText);
  });
}

export function onAgentError(
  callback: (message: string) => void
): Promise<UnlistenFn> {
  return listen<{ message: string }>('agent-error', (event) => {
    callback(event.payload.message);
  });
}

// ============ 语音合成 (TTS) ============

export async function speakText(
  text: string,
  voiceType?: string
): Promise<Uint8Array> {
  const bytes = await invoke<number[]>('tts_speak', { text, voiceType });
  return new Uint8Array(bytes);
}

// ============ 窗口控制 ============

export async function setWindowSize(
  width: number,
  height: number
): Promise<void> {
  await invoke('set_window_size', { width, height });
}

export async function setWindowPosition(x: number, y: number): Promise<void> {
  await invoke('set_window_position', { x, y });
}

export async function setWindowResizable(resizable: boolean): Promise<void> {
  await invoke('set_window_resizable', { resizable });
}
