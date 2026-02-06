const TARGET_SAMPLE_RATE = 16000;
const TARGET_MIME_TYPE = 'audio/wav';

function decodeAudioData(
  context: AudioContext,
  data: ArrayBuffer
): Promise<AudioBuffer> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const onResolve = (buffer: AudioBuffer) => {
      if (settled) return;
      settled = true;
      resolve(buffer);
    };
    const onReject = (error: unknown) => {
      if (settled) return;
      settled = true;
      reject(error);
    };

    const result = context.decodeAudioData(data, onResolve, onReject);
    if (result && typeof (result as Promise<AudioBuffer>).then === 'function') {
      (result as Promise<AudioBuffer>).then(onResolve).catch(onReject);
    }
  });
}

function encodeWav(samples: Float32Array, sampleRate: number): Uint8Array {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  const writeString = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i += 1) {
      view.setUint8(offset + i, value.charCodeAt(i));
    }
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, samples.length * 2, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i += 1, offset += 2) {
    const sample = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
  }

  return new Uint8Array(buffer);
}

async function convertToWav(blob: Blob): Promise<Uint8Array> {
  const AudioContextCtor =
    window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  const OfflineContextCtor =
    window.OfflineAudioContext ||
    (window as typeof window & { webkitOfflineAudioContext?: typeof OfflineAudioContext })
      .webkitOfflineAudioContext;

  if (!AudioContextCtor || !OfflineContextCtor) {
    throw new Error('AudioContext not available');
  }

  const audioContext = new AudioContextCtor();
  let decoded: AudioBuffer;
  try {
    decoded = await decodeAudioData(audioContext, await blob.arrayBuffer());
  } finally {
    if (typeof audioContext.close === 'function') {
      await audioContext.close();
    }
  }

  const targetLength = Math.max(1, Math.ceil(decoded.duration * TARGET_SAMPLE_RATE));
  const offlineContext = new OfflineContextCtor(1, targetLength, TARGET_SAMPLE_RATE);
  const source = offlineContext.createBufferSource();
  source.buffer = decoded;
  source.connect(offlineContext.destination);
  source.start(0);

  const rendered = await offlineContext.startRendering();
  return encodeWav(rendered.getChannelData(0), rendered.sampleRate);
}

function isServerSupportedMime(mimeType: string): boolean {
  return (
    mimeType.includes('audio/wav') ||
    mimeType.includes('audio/pcm') ||
    mimeType.includes('audio/ogg') ||
    mimeType.includes('audio/mpeg') ||
    mimeType.includes('audio/mp3')
  );
}

export async function prepareSttAudio(
  blob: Blob,
  mimeType: string
): Promise<{ audioBytes: number[]; mimeType: string }> {
  const normalizedMime = (mimeType || '').toLowerCase();
  try {
    const wavBytes = await convertToWav(blob);
    return { audioBytes: Array.from(wavBytes), mimeType: TARGET_MIME_TYPE };
  } catch (error) {
    if (isServerSupportedMime(normalizedMime)) {
      const rawBytes = new Uint8Array(await blob.arrayBuffer());
      return { audioBytes: Array.from(rawBytes), mimeType };
    }
    throw new Error(
      'Unsupported audio format. Use wav/ogg/mp3 or adjust recording settings.'
    );
  }
}
