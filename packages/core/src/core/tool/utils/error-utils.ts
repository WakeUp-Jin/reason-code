/**
 * 错误工具函数
 *
 * 目标：
 * - 统一 AbortError 的创建与识别
 * - 统一 TimeoutError 的创建与识别
 * - 统一 unknown -> message 的安全转换
 * - 提供带超时控制的 Promise 包装器
 */

export function createAbortError(message = 'AbortError'): Error {
  const error = new Error(message);
  error.name = 'AbortError';
  return error;
}

/**
 * 
 * @param error - 错误对象
 * @returns 是否是 AbortError
 * 错误对象: AbortError: This operation was aborted
error.name: "AbortError"
error.message: "This operation was aborted"
error.code: "ABORT_ERR
 */
export function isAbortError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (error.name === 'AbortError' || error.message === 'AbortError') return true;

  const code = (error as any)?.code;
  return typeof code === 'string' && (code === 'ABORT_ERR' || code === 'ERR_ABORTED');
}

export function createTimeoutError(operation: string, timeoutMs: number): Error {
  const error = new Error(`${operation} 执行超时 (${timeoutMs / 1000}秒)`);
  error.name = 'TimeoutError';
  return error;
}

export function isTimeoutError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return error.name === 'TimeoutError';
}

export function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * 工具执行超时时间（毫秒）
 * 默认 60 秒，防止工具执行卡住导致整个会话无响应
 */
export const TOOL_EXECUTION_TIMEOUT_MS = 60_000;

/**
 * 创建一个带超时的 AbortSignal
 *
 * 当超时或外部信号触发时，返回的 signal 会被 abort。
 * 这样可以让底层的子进程（如 ripgrep）也能被正确终止。
 *
 * @param timeoutMs - 超时时间（毫秒）
 * @param externalSignal - 外部的 AbortSignal（可选）
 * @returns 包含 signal 和清理函数的对象
 */
export function createTimeoutSignal(
  timeoutMs: number,
  externalSignal?: AbortSignal
): {
  signal: AbortSignal;
  cleanup: () => void;
  isTimeout: () => boolean;
} {
  const controller = new AbortController();
  let timedOut = false;

  // 超时定时器
  const timeoutId = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  // 监听外部中止信号
  const abortHandler = () => {
    clearTimeout(timeoutId);
    controller.abort();
  };
  externalSignal?.addEventListener('abort', abortHandler, { once: true });

  // 清理函数
  const cleanup = () => {
    clearTimeout(timeoutId);
    externalSignal?.removeEventListener('abort', abortHandler);
  };

  return {
    signal: controller.signal,
    cleanup,
    isTimeout: () => timedOut,
  };
}

/**
 * 带超时的 Promise 包装器
 *
 * 特点：
 * 1. 超时时会触发 AbortSignal，让底层子进程也能被终止
 * 2. 支持外部 AbortSignal 传入
 * 3. 自动清理资源（定时器、事件监听器）
 *
 * @param promiseFactory - 接收 AbortSignal 并返回 Promise 的工厂函数
 * @param timeoutMs - 超时时间（毫秒）
 * @param operation - 操作名称（用于错误消息）
 * @param externalSignal - 可选的外部 AbortSignal
 * @returns Promise 结果
 * @throws TimeoutError 或 AbortError
 */
export async function withTimeout<T>(
  promiseFactory: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  operation: string,
  externalSignal?: AbortSignal
): Promise<T> {
  // 如果已经被中止，立即抛出
  if (externalSignal?.aborted) {
    throw createAbortError();
  }

  const { signal, cleanup, isTimeout } = createTimeoutSignal(timeoutMs, externalSignal);

  try {
    const result = await promiseFactory(signal);
    cleanup();
    return result;
  } catch (error) {
    cleanup();

    // 如果是超时导致的中止，抛出 TimeoutError
    if (isTimeout() && isAbortError(error)) {
      throw createTimeoutError(operation, timeoutMs);
    }

    // 其他情况原样抛出
    throw error;
  }
}
