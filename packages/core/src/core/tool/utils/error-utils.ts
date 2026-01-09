/**
 * 错误工具函数
 *
 * 目标：
 * - 统一 AbortError 的创建与识别
 * - 统一 unknown -> message 的安全转换
 */

export function createAbortError(message = 'AbortError'): Error {
  const error = new Error(message);
  error.name = 'AbortError';
  return error;
}

export function isAbortError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (error.name === 'AbortError' || error.message === 'AbortError') return true;

  const code = (error as any)?.code;
  return typeof code === 'string' && (code === 'ABORT_ERR' || code === 'ERR_ABORTED');
}

export function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
