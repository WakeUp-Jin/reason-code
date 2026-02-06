import { agentManager } from '../AgentManager';
import { createTTSProcessor, type TTSConfig } from './tts-stream-test';
import dotenv from 'dotenv';

// 必须先加载 .env
dotenv.config();

async function testButler() {
  // ============================================================
  // 初始化 TTS（可选）
  // ============================================================
  let ttsConfig: TTSConfig | null = null;

  const appId = process.env.VOLCENGINE_APP_ID;
  const accessToken = process.env.VOLCENGINE_ACCESS_TOKEN;
  const resourceId = process.env.VOLCENGINE_RESOURCE_ID;

  if (appId && accessToken && resourceId) {
    console.log('[Test] 火山引擎 TTS 配置已设置，启用语音合成');
    ttsConfig = {
      appId,
      accessToken,
      resourceId,
      enablePlayback: true,
      debug: false,
    };
  } else {
    console.log('[Test] 缺少火山引擎配置，跳过 TTS');
  }

  // ============================================================
  // 创建 Agent
  // ============================================================
  const butler = agentManager.createAgent('steward');
  await butler.init();

  console.log('[Test] 开始运行 Agent...');

  // ============================================================
  // TTS 调度：中间状态覆盖，最终结果优先
  // ============================================================
  let pendingIntermediate: string | null = null;
  let finalText: string | null = null;
  let isPlaying = false;
  let drainScheduled = false;
  let playbackQueue = Promise.resolve();

  const playSegment = async (text: string) => {
    if (!ttsConfig) return;
    const trimmed = text.trim();
    if (!trimmed) return;
    try {
      const tts = await createTTSProcessor(ttsConfig);
      tts.push(trimmed);
      await tts.finish();
    } catch (error) {
      console.error('[TTS] 播放失败:', error);
    }
  };

  const drainPlayback = async () => {
    if (isPlaying) return;
    if (finalText) {
      const text = finalText;
      finalText = null;
      pendingIntermediate = null;
      isPlaying = true;
      await playSegment(text);
      isPlaying = false;
      return;
    }
    if (pendingIntermediate) {
      const text = pendingIntermediate;
      pendingIntermediate = null;
      isPlaying = true;
      await playSegment(text);
      isPlaying = false;
      if (finalText || pendingIntermediate) {
        await drainPlayback();
      }
    }
  };

  const requestDrain = () => {
    if (drainScheduled) return;
    drainScheduled = true;
    playbackQueue = playbackQueue
      .then(async () => {
        drainScheduled = false;
        await drainPlayback();
      })
      .catch((error) => {
        console.error('[TTS] 播放调度失败:', error);
      });
  };

  // ============================================================
  // 事件订阅 + TTS 集成
  // ============================================================
  const executionStream = butler.getExecutionStream();
  executionStream.on((event) => {
    switch (event.type) {
      // 工具调用前的 assistant 消息（包含 content 和 tool_calls）
      // → 中间状态（覆盖式，不排队）
      case 'assistant:message':
        console.log('\n[Event: assistant:message]');
        console.log('  Content:', event.content || '(empty)');
        if (event.tool_calls.length > 0) {
          console.log(
            '  Tool Calls:',
            event.tool_calls.map((tc) => tc.function.name)
          );
        }
        if (ttsConfig && event.tool_calls.length > 0) {
          const content = event.content?.trim();
          if (content) {
            pendingIntermediate = content;
            requestDrain();
          }
        }
        break;

      // 工具执行完成
      case 'tool:complete':
        console.log('\n[Event: tool:complete]');
        console.log('  Tool:', event.toolCall.toolName);
        console.log('  Summary:', event.toolCall.resultSummary);
        break;
    }
  });

  // ============================================================
  // 运行 Agent
  // ============================================================
  const result = await butler.run('看看目前主Agent的运行情况', {
    llmOptions: {
      stream: false,
      reasoning: { enabled: false },
    },
  });

  console.log('\n[Test] Agent 执行完成!');

  // ============================================================
  // 等待 TTS 完成
  // ============================================================
  if (ttsConfig) {
    console.log('[Test] 等待 TTS 播放完成...');
    const finalResponse = result.finalResponse?.trim();
    if (finalResponse) {
      finalText = finalResponse;
      pendingIntermediate = null;
      requestDrain();
    }
    await playbackQueue;
  }

  console.log('[Test] 完成!');
  console.log('Final Response:', result.finalResponse?.slice(0, 200) + '...');
}

testButler().catch(console.error);
