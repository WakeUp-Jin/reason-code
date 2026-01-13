/**
 * 子进程管理工具（Bun-only）
 *
 * 统一封装 Bun.spawn 的创建、取消、输出读取与一次性 runCommand。
 *
 * 说明：
 * - Bun.spawn 的 stdout/stderr 是 WHATWG ReadableStream<Uint8Array>，没有 Node 的 .on('data')
 * - 本文件不再做 ChildProcess/Node 兼容层，避免类型与语义不一致导致的混乱
 */

import { createAbortError } from './error-utils.js';
import { logger } from '../../../utils/logger.js';

type WebReadableStreamLike = {
  getReader: () => {
    read: () => Promise<{ value?: Uint8Array; done: boolean }>;
    releaseLock?: () => void;
  };
  cancel?: (reason?: unknown) => Promise<void> | void;
};

type TextDecoderLike = {
  decode: (input?: Uint8Array, options?: { stream?: boolean }) => string;
};

export interface SpawnedProcess {
  pid: number;
  killed: boolean;
  exitCode: number | null;
  stdout: WebReadableStreamLike | null;
  stderr: WebReadableStreamLike | null;
  exited: Promise<number>;
  kill: (signal?: string) => void;
}

/**
 * 进程创建选项
 */
export interface SpawnOptions {
  /** 工作目录 */
  cwd: string;
  /** stdio 配置：[stdin, stdout, stderr] */
  stdio?: ['ignore' | 'pipe', 'pipe', 'pipe' | 'ignore'];
  /** 保留字段（Bun 不使用） */
  windowsHide?: boolean;
}

/**
 * Abort 处理器
 */
export interface AbortHandler {
  /** 是否已中止 */
  readonly aborted: boolean;
  /** 清理函数 */
  cleanup: () => void;
}

/**
 * 命令执行选项
 */
export interface RunCommandOptions {
  /** 工作目录 */
  cwd: string;
  /** 取消信号 */
  signal?: AbortSignal;
  /** stderr 处理器（可选，用于过滤或处理 stderr） */
  stderrHandler?: (chunk: string) => string | null;
}

/**
 * 命令执行结果
 */
export interface CommandResult {
  /** 标准输出 */
  stdout: string;
  /** 标准错误（经过 stderrHandler 处理后的） */
  stderr: string;
  /** 退出码 */
  exitCode: number;
}

function getBunSpawn(): ((argv: string[], opts: any) => any) | null {
  // @ts-ignore - Bun 全局变量
  const bun = typeof Bun !== 'undefined' ? Bun : undefined;
  return bun?.spawn ? bun.spawn.bind(bun) : null;
}

function chunkToString(chunk: unknown, decoder: TextDecoderLike): string {
  if (typeof chunk === 'string') return chunk;
  if (chunk instanceof Uint8Array) return decoder.decode(chunk, { stream: true });
  if (chunk instanceof ArrayBuffer) return decoder.decode(new Uint8Array(chunk), { stream: true });
  return String(chunk);
}

async function consumeWebStream(
  stream: WebReadableStreamLike | null,
  onChunk: (chunk: string) => void
): Promise<void> {
  if (!stream) return;
  if (typeof stream.getReader !== 'function') {
    throw new Error('Expected a WHATWG ReadableStream (missing getReader())');
  }

  const decoder = new TextDecoder('utf-8');
  const reader = stream.getReader();

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      const s = chunkToString(value, decoder);
      if (s) onChunk(s);
    }
  } finally {
    try {
      reader.releaseLock?.();
    } catch {
      // ignore
    }
    const tail = decoder.decode();
    if (tail) onChunk(tail);
  }
}

/**
 * 检测命令是否可用（Bun-only）
 *
 * 适用于工具探测场景：执行一次轻量命令（通常是 --version），
 * 并在超时时间内返回是否成功（exitCode === 0）。
 */
export async function isCommandAvailable(
  command: string,
  args: string[] = ['--version'],
  options?: {
    cwd?: string;
    timeoutMs?: number;
  }
): Promise<boolean> {
  const spawnFn = getBunSpawn();
  if (!spawnFn) return false;

  const cwd = options?.cwd ?? process.cwd();
  const timeoutMs = options?.timeoutMs ?? 3000;

  try {
    const proc = spawnFn([command, ...args], {
      cwd,
      stdin: 'ignore',
      stdout: 'ignore',
      stderr: 'ignore',
    });

    let settled = false;
    return await new Promise<boolean>((resolve) => {
      const finalize = (value: boolean) => {
        if (settled) return;
        settled = true;
        resolve(value);
      };

      const timer = setTimeout(() => {
        try {
          proc.kill();
        } catch {
          // ignore
        }
        finalize(false);
      }, timeoutMs);

      proc.exited
        .then(() => {
          clearTimeout(timer);
          finalize(proc.exitCode === 0);
        })
        .catch(() => {
          clearTimeout(timer);
          finalize(false);
        });
    });
  } catch {
    return false;
  }
}

/**
 * 创建进程（Bun.spawn）
 */
export function createProcess(
  command: string,
  args: string[],
  options: SpawnOptions
): SpawnedProcess {
  const spawnFn = getBunSpawn();
  if (!spawnFn) {
    throw new Error('Bun.spawn is not available in this runtime');
  }

  const stdio = options.stdio ?? ['ignore', 'pipe', 'pipe'];

  const proc = spawnFn([command, ...args], {
    cwd: options.cwd,
    stdin: stdio[0] === 'pipe' ? 'pipe' : 'ignore',
    stdout: 'pipe',
    stderr: stdio[2] === 'pipe' ? 'pipe' : 'ignore',
  });

  return {
    pid: proc.pid,
    get killed() {
      return proc.killed;
    },
    get exitCode() {
      return proc.exitCode;
    },
    stdout: (proc.stdout as WebReadableStreamLike) ?? null,
    stderr: (proc.stderr as WebReadableStreamLike) ?? null,
    exited: proc.exited,
    kill: (signal?: string) => {
      try {
        proc.kill(signal as any);
      } catch {
        proc.kill();
      }
    },
  };
}

/**
 * 设置 Abort 处理器
 */
export function setupAbortHandler(
  proc: SpawnedProcess,
  signal?: AbortSignal,
  logPrefix: string = 'Process'
): AbortHandler {
  const state = { aborted: false };

  const onAbort = () => {
    state.aborted = true;

    logger.debug(`🛑 [${logPrefix}:Abort] Killing process`, { pid: proc.pid });

    try {
      proc.stdout?.cancel?.();
    } catch {
      // ignore
    }
    try {
      proc.stderr?.cancel?.();
    } catch {
      // ignore
    }

    proc.kill('SIGTERM');

    setTimeout(() => {
      if (!proc.killed) {
        logger.debug(`🛑 [${logPrefix}:ForceKill] Forcing kill`, { pid: proc.pid });
        proc.kill('SIGKILL');
      }
    }, 500);
  };

  signal?.addEventListener('abort', onAbort, { once: true });

  return {
    get aborted() {
      return state.aborted;
    },
    cleanup: () => signal?.removeEventListener('abort', onAbort),
  };
}

/**
 * 从 stdout/stderr 流中逐行读取
 */
export async function* readLinesFromStream(
  stream: unknown,
  checkAborted: () => boolean
): AsyncGenerator<string, void, unknown> {
  const webStream = stream as WebReadableStreamLike | null;
  if (!webStream?.getReader) {
    throw new Error('readLinesFromStream expects a WHATWG ReadableStream');
  }

  const decoder = new TextDecoder('utf-8');
  const reader = webStream.getReader();
  let buffer = '';

  try {
    while (true) {
      if (checkAborted()) break;

      const { value, done } = await reader.read();
      if (done) break;

      buffer += chunkToString(value, decoder);
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (line) yield line;
      }
    }
  } catch (err) {
    if (!checkAborted()) throw err;
  } finally {
    try {
      reader.releaseLock?.();
    } catch {
      // ignore
    }
  }

  buffer += decoder.decode();
  if (buffer && !checkAborted()) yield buffer;
}

/**
 * 等待进程退出（Bun-only）
 */
export async function waitForProcessExit(
  proc: SpawnedProcess,
  checkAborted: () => boolean,
  allowedExitCodes: number[] = [0, 1],
  commandName: string = 'process'
): Promise<void> {
  if (checkAborted()) throw createAbortError();
  if (proc.killed || proc.exitCode !== null) return;

  await proc.exited;

  if (checkAborted()) throw createAbortError();

  const code = proc.exitCode ?? -1;
  if (!allowedExitCodes.includes(code)) {
    throw new Error(`${commandName} exited with code ${code}`);
  }
}

/**
 * 运行命令并收集输出（Bun-only）
 */
export async function runCommand(
  command: string,
  args: string[],
  options: RunCommandOptions
): Promise<CommandResult> {
  const proc = createProcess(command, args, {
    cwd: options.cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const abortHandler = setupAbortHandler(proc, options.signal, command);

  let stdout = '';
  const stderrChunks: string[] = [];

  const stdoutPromise = consumeWebStream(proc.stdout, (chunkStr) => {
    stdout += chunkStr;
  });

  const stderrPromise = consumeWebStream(proc.stderr, (chunkStr) => {
    if (options.stderrHandler) {
      const processed = options.stderrHandler(chunkStr);
      if (processed !== null) stderrChunks.push(processed);
    } else {
      stderrChunks.push(chunkStr);
    }
  });

  let exitCode: number = -1;
  try {
    exitCode = await proc.exited;
  } finally {
    abortHandler.cleanup();
  }

  if (abortHandler.aborted) {
    throw createAbortError();
  }

  await Promise.all([
    stdoutPromise.catch((err) => {
      if (!abortHandler.aborted) throw err;
    }),
    stderrPromise.catch((err) => {
      if (!abortHandler.aborted) throw err;
    }),
  ]);

  return {
    stdout,
    stderr: stderrChunks.join(''),
    exitCode: proc.exitCode ?? exitCode,
  };
}
