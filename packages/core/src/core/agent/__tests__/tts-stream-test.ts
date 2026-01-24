/**
 * TTS 流式测试文件
 *
 * 功能：
 * 1. 接收 LLM 流式输出的 chunk，直接发送到火山引擎 TTS
 * 2. 火山引擎服务端自动处理切句（官方推荐，效果更自然）
 * 3. 即时播放收到的音频
 *
 * 使用方式：
 * ```typescript
 * import { createTTSProcessor } from './tts-stream-test';
 *
 * const tts = await createTTSProcessor({
 *   appId: 'your-app-id',
 *   accessToken: 'your-access-token',
 *   resourceId: 'your-resource-id',
 * });
 *
 * // 在 Agent.run 中使用
 * await agent.run('你好', {
 *   llmOptions: {
 *     onChunk: (chunk) => tts.push(chunk),
 *   },
 * });
 *
 * // 等待所有音频播放完成
 * await tts.finish();
 * ```
 */

import WebSocket from 'ws';
import { v4 as uuidv4 } from 'uuid';
import { spawn, ChildProcess } from 'child_process';

// 注意：Bun 的原生 WebSocket 不支持自定义 headers
// 火山引擎 TTS 需要通过 headers 传递认证信息
// 因此必须使用 ws 库，并用 Node 运行：
//   npx tsx src/core/agent/__tests__/tts-stream-test.ts
// 或者在测试文件中用：
//   npx tsx src/core/agent/__tests__/testbutler.test.ts

// ============================================================
// 常量定义
// ============================================================

const TTS_WS_ENDPOINT = 'wss://openspeech.bytedance.com/api/v3/tts/bidirection';

const PROTOCOL_VERSION = 0x1;
const HEADER_SIZE = 0x1;

const MSG_TYPE_FULL_CLIENT = 0x1;
const MSG_TYPE_AUDIO_ONLY_RESPONSE = 0xb;
const MSG_TYPE_ERROR = 0xf;

const FLAG_WITH_EVENT = 0x4;
const SERIALIZATION_JSON = 0x1;
const COMPRESSION_NONE = 0x0;

const EVENT_START_CONNECTION = 1;
const EVENT_FINISH_CONNECTION = 2;
const EVENT_CONNECTION_STARTED = 50;
const EVENT_START_SESSION = 100;
const EVENT_FINISH_SESSION = 102;
const EVENT_SESSION_STARTED = 150;
const EVENT_SESSION_FINISHED = 152;
const EVENT_TASK_REQUEST = 200;
const EVENT_TTS_RESPONSE = 352;

// ============================================================
// 类型定义
// ============================================================

export interface TTSConfig {
  appId: string;
  accessToken: string;
  resourceId: string;
  voiceType?: string;
  /** 是否启用即时播放（需要 ffplay） */
  enablePlayback?: boolean;
  /** 音频输出回调 */
  onAudioChunk?: (chunk: Buffer) => void;
  /** 调试日志 */
  debug?: boolean;
}

interface ParsedFrame {
  messageType: number;
  flags: number;
  serialization: number;
  event?: number;
  payload: Buffer;
}

// ============================================================
// 辅助函数
// ============================================================

function buildFullClientFrame(event: number, sessionId: string | null, payload: Buffer): Buffer {
  const parts: Buffer[] = [];

  const header = Buffer.alloc(4);
  header[0] = (PROTOCOL_VERSION << 4) | HEADER_SIZE;
  header[1] = (MSG_TYPE_FULL_CLIENT << 4) | FLAG_WITH_EVENT;
  header[2] = (SERIALIZATION_JSON << 4) | COMPRESSION_NONE;
  header[3] = 0x00;
  parts.push(header);

  const eventBuf = Buffer.alloc(4);
  eventBuf.writeInt32BE(event, 0);
  parts.push(eventBuf);

  if (sessionId) {
    const idBytes = Buffer.from(sessionId, 'utf-8');
    const idLen = Buffer.alloc(4);
    idLen.writeUInt32BE(idBytes.length, 0);
    parts.push(idLen);
    parts.push(idBytes);
  }

  const payloadLen = Buffer.alloc(4);
  payloadLen.writeUInt32BE(payload.length, 0);
  parts.push(payloadLen);
  parts.push(payload);

  return Buffer.concat(parts);
}

function parseFrame(data: Buffer): ParsedFrame {
  if (data.length < 4) throw new Error('Frame too short');

  const headerSize = (data[0] & 0x0f) * 4;
  const messageType = data[1] >> 4;
  const flags = data[1] & 0x0f;
  const serialization = data[2] >> 4;

  let offset = headerSize;
  let event: number | undefined;

  if ((flags & FLAG_WITH_EVENT) !== 0 && offset + 4 <= data.length) {
    event = data.readInt32BE(offset);
    offset += 4;
  }

  if (messageType === MSG_TYPE_ERROR) {
    return { messageType, flags, serialization, event, payload: data.subarray(offset + 4) };
  }

  // 跳过 session ID
  if (offset + 4 <= data.length) {
    const idLen = data.readUInt32BE(offset);
    offset += 4 + idLen;
  }

  // 解析 payload
  let payload = Buffer.alloc(0);
  if (offset + 4 <= data.length) {
    const payloadLen = data.readUInt32BE(offset);
    offset += 4;
    payload = data.subarray(offset, offset + payloadLen);
  }

  return { messageType, flags, serialization, event, payload };
}

// ============================================================
// TTS 处理器
// ============================================================

export class TTSStreamProcessor {
  private config: Required<TTSConfig>;
  private ws: WebSocket | null = null;
  private sessionId = '';
  private totalAudioBytes = 0;
  private startTime = 0;
  private firstChunkTime = 0;
  private ffplayProcess: ChildProcess | null = null;
  private finishResolve: (() => void) | null = null;
  private isSessionStarted = false;

  constructor(config: TTSConfig) {
    this.config = {
      voiceType: 'zh_male_m191_uranus_bigtts',
      enablePlayback: true,
      debug: false,
      onAudioChunk: undefined as any,
      ...config,
    };
  }

  private log(...args: any[]) {
    if (this.config.debug) console.log('[TTS]', ...args);
  }

  /**
   * 连接并初始化（必须先调用）
   */
  async connect(): Promise<void> {
    this.startTime = Date.now();
    this.sessionId = uuidv4();
    const connectId = uuidv4();

    this.log('建立 WebSocket 连接...');

    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(TTS_WS_ENDPOINT, {
        headers: {
          'X-Api-App-Key': this.config.appId,
          'X-Api-Access-Key': this.config.accessToken,
          'X-Api-Resource-Id': this.config.resourceId,
          'X-Api-Connect-Id': connectId,
        },
      });

      this.ws.on('open', () => {
        this.log('WebSocket 已连接，发送建连请求...');
        const startConn = buildFullClientFrame(EVENT_START_CONNECTION, null, Buffer.from('{}'));
        this.ws!.send(startConn);
      });

      this.ws.on('message', (data: Buffer) => {
        try {
          const frame = parseFrame(data);

          if (frame.messageType === MSG_TYPE_ERROR) {
            const errorMsg = frame.payload.toString('utf-8');
            console.error('[TTS] 服务错误:', errorMsg);
            reject(new Error(errorMsg));
            return;
          }

          // 音频数据
          if (
            (frame.messageType === MSG_TYPE_AUDIO_ONLY_RESPONSE ||
              frame.event === EVENT_TTS_RESPONSE) &&
            frame.payload.length > 0
          ) {
            this.handleAudioChunk(frame.payload);
            return;
          }

          // 事件处理
          if (frame.event === EVENT_CONNECTION_STARTED) {
            this.log('连接已建立，启动会话...');
            this.startSession();
          } else if (frame.event === EVENT_SESSION_STARTED) {
            this.log('会话已启动，可以发送文本');
            this.isSessionStarted = true;
            resolve();
          } else if (frame.event === EVENT_SESSION_FINISHED) {
            this.log('会话已结束');
            this.cleanup();
          }
        } catch (error) {
          console.error('[TTS] 消息处理失败:', error);
        }
      });

      this.ws.on('error', (error) => {
        console.error('[TTS] WebSocket 错误:', error);
        reject(error);
      });

      this.ws.on('close', () => {
        this.log('WebSocket 已关闭');
        this.ws = null;
      });
    });
  }

  private startSession(): void {
    const sessionPayload = JSON.stringify({
      user: { uid: 'reason-code-test' },
      event: EVENT_START_SESSION,
      namespace: 'BidirectionalTTS',
      req_params: {
        speaker: this.config.voiceType,
        audio_params: { format: 'mp3', sample_rate: 24000 },
      },
    });
    const frame = buildFullClientFrame(
      EVENT_START_SESSION,
      this.sessionId,
      Buffer.from(sessionPayload)
    );
    this.ws!.send(frame);
  }

  /**
   * 推送文本 chunk（直接发送，不做切句处理）
   * 火山引擎服务端会自动处理切句
   */
  push(chunk: string): void {
    if (!this.ws || !this.isSessionStarted) {
      console.warn('[TTS] 未连接或会话未启动，忽略 chunk');
      return;
    }

    this.log(`发送 chunk: "${chunk}"`);

    const taskPayload = JSON.stringify({
      event: EVENT_TASK_REQUEST,
      namespace: 'BidirectionalTTS',
      req_params: { text: chunk },
    });
    const frame = buildFullClientFrame(
      EVENT_TASK_REQUEST,
      this.sessionId,
      Buffer.from(taskPayload)
    );
    this.ws.send(frame);
  }

  private handleAudioChunk(chunk: Buffer): void {
    if (this.totalAudioBytes === 0) {
      this.firstChunkTime = Date.now();
      const latency = this.firstChunkTime - this.startTime;
      console.log(`[TTS] 首个音频延迟: ${latency}ms, 大小: ${chunk.length} bytes`);
    }

    this.totalAudioBytes += chunk.length;
    this.config.onAudioChunk?.(chunk);

    if (this.config.enablePlayback) {
      this.playAudio(chunk);
    }
  }

  private playAudio(chunk: Buffer): void {
    if (!this.ffplayProcess) {
      try {
        this.ffplayProcess = spawn('ffplay', ['-nodisp', '-autoexit', '-i', 'pipe:0'], {
          stdio: ['pipe', 'ignore', 'ignore'],
        });
        this.ffplayProcess.on('close', () => {
          this.ffplayProcess = null;
          this.finishResolve?.();
        });
        this.ffplayProcess.on('error', (err) => {
          console.error('[TTS] ffplay 错误:', err.message);
          console.log('[TTS] 提示: 请安装 ffmpeg (brew install ffmpeg)');
        });
      } catch (error) {
        console.error('[TTS] 启动 ffplay 失败:', error);
        return;
      }
    }

    if (this.ffplayProcess?.stdin?.writable) {
      this.ffplayProcess.stdin.write(chunk);
    }
  }

  /**
   * 结束发送，等待播放完成
   */
  async finish(): Promise<void> {
    if (!this.ws) return;

    this.log('发送结束会话...');
    const finishSession = buildFullClientFrame(
      EVENT_FINISH_SESSION,
      this.sessionId,
      Buffer.from('{}')
    );
    this.ws.send(finishSession);

    return new Promise((resolve) => {
      this.finishResolve = resolve;
      // 超时保护
      setTimeout(() => {
        this.cleanup();
        resolve();
      }, 10000);
    });
  }

  private cleanup(): void {
    if (this.ws) {
      const finishConn = buildFullClientFrame(EVENT_FINISH_CONNECTION, null, Buffer.from('{}'));
      this.ws.send(finishConn);
      this.ws.close();
      this.ws = null;
    }

    if (this.ffplayProcess?.stdin?.writable) {
      this.ffplayProcess.stdin.end();
    }

    const totalTime = Date.now() - this.startTime;
    console.log(`[TTS] 完成! 总音频: ${this.totalAudioBytes} bytes, 总耗时: ${totalTime}ms`);

    this.finishResolve?.();
  }
}

/**
 * 创建 TTS 处理器（便捷函数）
 * 返回已连接的处理器，可直接使用 push()
 */
export async function createTTSProcessor(config: TTSConfig): Promise<TTSStreamProcessor> {
  const processor = new TTSStreamProcessor(config);
  await processor.connect();
  return processor;
}

// ============================================================
// 测试
// ============================================================

async function testTTSStream() {
  // 加载 .env 文件
  const dotenv = await import('dotenv');
  dotenv.config();

  const appId = process.env.VOLCENGINE_APP_ID;
  const accessToken = process.env.VOLCENGINE_ACCESS_TOKEN;
  const resourceId = process.env.VOLCENGINE_RESOURCE_ID;

  if (!appId || !accessToken || !resourceId) {
    console.error(
      '请设置环境变量: VOLCENGINE_APP_ID, VOLCENGINE_ACCESS_TOKEN, VOLCENGINE_RESOURCE_ID'
    );
    return;
  }

  const tts = await createTTSProcessor({
    appId,
    accessToken,
    resourceId,
    enablePlayback: true,
    debug: true,
  });

  // 模拟 LLM 流式输出（直接逐字符发送，服务端自动切句）
  const testText =
    '你好，这是一个测试。我正在测试火山引擎的语音合成功能。希望能够实现边输出边播放的效果！';

  console.log('[Test] 模拟 LLM 流式输出（直接发送，服务端切句）...');

  for (const char of testText) {
    tts.push(char);
    await new Promise((resolve) => setTimeout(resolve, 50)); // 模拟 LLM 输出间隔
  }

  console.log('[Test] 等待 TTS 完成...');
  await tts.finish();
  console.log('[Test] 测试完成!');
}

// ESM 入口检测
const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  testTTSStream().catch(console.error);
}
