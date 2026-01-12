/**
 * Ripgrep 底层工具类
 *
 * 负责管理 ripgrep 二进制文件的下载、安装和调用。
 *
 * 核心功能：
 * 1. 自动下载管理：首次使用时自动下载对应平台的 ripgrep 二进制
 * 2. 跨平台支持：支持 macOS、Linux、Windows（ARM64 和 x64）
 * 3. 懒加载机制：只在需要时才下载和初始化
 * 4. 文件列表生成：files() 函数用于 Glob 工具
 */

import { spawn, execSync, type ChildProcess } from 'child_process';
import { existsSync, mkdirSync, chmodSync, unlinkSync, createWriteStream, statSync } from 'fs';
import { join, resolve } from 'path';
import { pipeline } from 'stream/promises';
import { createGunzip } from 'zlib';
import { Readable } from 'stream';
import { createAbortError } from './error-utils.js';
import { ripgrepLogger } from '../../../utils/logUtils.js';
import { logger } from '../../../utils/logger.js';
import { detectRuntime, RuntimeEnvironment } from './runtime.js';

/**
 * 平台配置
 */
const PLATFORM_CONFIG: Record<
  string,
  {
    platform: string;
    extension: 'tar.gz' | 'zip';
  }
> = {
  'arm64-darwin': {
    platform: 'aarch64-apple-darwin',
    extension: 'tar.gz',
  },
  'arm64-linux': {
    platform: 'aarch64-unknown-linux-gnu',
    extension: 'tar.gz',
  },
  'x64-darwin': {
    platform: 'x86_64-apple-darwin',
    extension: 'tar.gz',
  },
  'x64-linux': {
    platform: 'x86_64-unknown-linux-musl',
    extension: 'tar.gz',
  },
  'x64-win32': {
    platform: 'x86_64-pc-windows-msvc',
    extension: 'zip',
  },
};

/**
 * Ripgrep 版本
 */
const RIPGREP_VERSION = '14.1.1';

/**
 * 下载超时时间（毫秒）
 * 默认 30 秒，防止网络问题导致无限等待
 */
const DOWNLOAD_TIMEOUT_MS = 30_000;

/**
 * 获取平台标识
 */
function getPlatformKey(): string {
  return `${process.arch}-${process.platform}`;
}

/**
 * 获取 ripgrep 二进制文件名
 */
function getRipgrepBinaryName(): string {
  return process.platform === 'win32' ? 'rg.exe' : 'rg';
}

function tryGetSystemRipgrepPath(): string | null {
  try {
    const output = execSync('which rg 2>/dev/null || where rg 2>nul', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();

    const firstLine = output.split(/\r?\n/)[0]?.trim();
    if (firstLine && existsSync(firstLine)) {
      return firstLine;
    }
  } catch {
    // ignore
  }

  return null;
}

/**
 * 懒加载状态
 */
let _ripgrepPath: string | null = null;
let _initPromise: Promise<string> | null = null;

/**
 * Ripgrep 工具类
 */
export const Ripgrep = {
  /**
   * 获取 ripgrep 可执行文件路径
   *
   * 检测逻辑：
   * 1. 首先尝试使用系统已安装的 rg
   * 2. 如果系统没有，使用本地缓存
   * 3. 如果本地缓存没有，自动下载
   *
   * @param binDir - 本地二进制缓存目录
   * @returns ripgrep 路径
   */
  async filepath(binDir?: string): Promise<string> {
    if (_ripgrepPath) {
      return _ripgrepPath;
    }

    if (_initPromise) {
      return _initPromise;
    }

    _initPromise = (async (): Promise<string> => {
      // 1) 优先使用系统 PATH 中的 rg（用户已安装、无需下载）
      const systemPath = tryGetSystemRipgrepPath();
      if (systemPath) {
        _ripgrepPath = systemPath; // 缓存：后续调用不再重复探测
        ripgrepLogger.useSystem(systemPath);
        return systemPath;
      }

      // 2) 系统没有 rg：如果未提供 binDir，就既不能用缓存也不能下载（直接失败）
      if (!binDir) {
        const reason = 'No system rg and no binDir specified for download';
        ripgrepLogger.unavailable(reason);
        throw new Error(`Ripgrep not available: ${reason}`);
      }

      // 3) 检查本地缓存：binDir 下是否已有 rg/rg.exe
      const localPath = join(binDir, getRipgrepBinaryName());
      const hasLocalCache = existsSync(localPath);

      // 记录检测结果
      ripgrepLogger.detection(false, hasLocalCache, !hasLocalCache, binDir);

      if (hasLocalCache) {
        _ripgrepPath = localPath; // 缓存：直接复用本地二进制
        ripgrepLogger.useLocalCache(localPath);
        return localPath;
      }

      // 4) 本地也没有：下载到 binDir（只有调用方传入 binDir 时才会发生）
      await downloadRipgrep(binDir);

      // 5) 下载完成后做一次存在性校验，避免下载/解压失败导致返回错误路径
      if (!existsSync(localPath)) {
        throw new Error(`Ripgrep download completed but binary not found at ${localPath}`);
      }

      _ripgrepPath = localPath; // 缓存：以后都用这一份
      ripgrepLogger.useLocalCache(localPath);
      return localPath;
    })().catch((err) => {
      // 6) 重要：初始化失败时清空 _initPromise，避免"失败 Promise 被永久缓存"导致无法重试
      _initPromise = null;
      throw err;
    });

    return _initPromise;
  },

  /**
   * 文件列表生成器
   *
   * 使用 ripgrep 的 --files 模式列出文件。
   *
   * @param input - 输入参数
   * @param input.cwd - 工作目录
   * @param input.glob - glob 模式数组
   * @param input.binDir - 本地二进制缓存目录
   * @yields 文件路径
   */
  async *files(input: {
    cwd: string;
    glob?: string[];
    binDir?: string;
    signal?: AbortSignal;
  }): AsyncGenerator<string, void, unknown> {
    // 1. 初始检查
    if (input.signal?.aborted) {
      throw createAbortError();
    }

    // 2. 准备 ripgrep 命令
    ripgrepLogger.detection(false, false, false, input.binDir);
    const rgPath = await Ripgrep.filepath(input.binDir);

    const args = [
      '--files', // 只列出文件，不搜索内容
      '--hidden', // 包含隐藏文件
      '--glob=!.git/**', // 排除 .git 目录
      '--glob=!node_modules/**', // 排除 node_modules 目录
      '--glob=!.turbo/**', // 排除 turbo 缓存目录
      '--glob=!dist/**', // 排除构建输出目录
      '--glob=!store/**', // 排除 store 缓存目录
      '--glob=!logs/**', // 排除日志目录
    ];

    // 添加 glob 模式
    if (input.glob) {
      for (const g of input.glob) {
        args.push(`--glob=${g}`);
      }
    }

    // 3. 检查目录是否存在
    if (!existsSync(input.cwd)) {
      throw Object.assign(new Error(`No such file or directory: '${input.cwd}'`), {
        code: 'ENOENT',
        errno: -2,
        path: input.cwd,
      });
    }

    // 4. 启动进程（自动选择 Bun 或 Node.js）
    const runtime = detectRuntime();
    logger.debug(`🚀 [Ripgrep:Spawn] Starting process`, {
      rgPath,
      args,
      cwd: input.cwd,
      runtime,
    });

    const proc = this._createProcess(rgPath, args, {
      cwd: input.cwd,
      stdio: ['ignore', 'pipe', 'ignore'],
      windowsHide: true,
    });

    // 5. 设置 Abort 处理
    const abortHandler = this._setupAbortHandler(proc, input.signal);
    const checkAborted = () => abortHandler.aborted;

    try {
      // 6. 流式读取并返回结果
      yield* this._readLinesFromStream(proc.stdout as Readable, checkAborted);

      // 7. 等待进程退出
      await this._waitForProcessExit(proc, checkAborted);
    } finally {
      // 8. 清理资源
      abortHandler.cleanup();
    }
  },

  /**
   * 执行搜索
   *
   * @param input - 输入参数
   * @param input.cwd - 工作目录
   * @param input.pattern - 搜索模式
   * @param input.glob - 文件过滤 glob 模式
   * @param input.binDir - 本地二进制缓存目录
   * @returns 搜索输出
   */
  async search(input: {
    cwd: string;
    pattern: string;
    glob?: string;
    binDir?: string;
    signal?: AbortSignal;
  }): Promise<string> {
    // 1. 初始检查
    if (input.signal?.aborted) {
      throw createAbortError();
    }

    // 2. 准备命令
    const rgPath = await Ripgrep.filepath(input.binDir);
    const args = [
      '-nH', // -n: 行号, -H: 文件名
      '--field-match-separator=|', // 使用 | 分隔字段
      '--regexp',
      input.pattern,
    ];

    if (input.glob) {
      args.push('--glob', input.glob);
    }
    args.push(input.cwd);

    // 3. 启动进程（自动选择 Bun 或 Node.js）
    const runtime = detectRuntime();
    logger.debug(`🚀 [Ripgrep:Search] Starting process`, {
      rgPath,
      args,
      runtime,
    });

    const proc = this._createProcess(rgPath, args, {
      cwd: input.cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    // 4. 设置 Abort 处理
    const abortHandler = this._setupAbortHandler(proc, input.signal);
    const checkAborted = () => abortHandler.aborted;

    try {
      // 5. 读取所有输出
      let result = '';
      for await (const line of this._readLinesFromStream(proc.stdout as Readable, checkAborted)) {
        result += line + '\n';
      }

      // 6. 等待进程退出
      await this._waitForProcessExit(proc, checkAborted);

      return result.trimEnd();
    } finally {
      // 7. 清理资源
      abortHandler.cleanup();
    }
  },

  /**
   * 检查 ripgrep 是否可用
   *
   * @param binDir - 本地二进制缓存目录
   * @returns 是否可用
   */
  async isAvailable(binDir?: string): Promise<boolean> {
    try {
      await Ripgrep.filepath(binDir);
      return true;
    } catch {
      return false;
    }
  },

  /**
   * 重置缓存（仅用于测试）
   */
  _resetCache(): void {
    _ripgrepPath = null;
    _initPromise = null;
  },

  // ==================== 私有方法：进程管理和流处理 ====================

  /**
   * 创建进程（自动选择 Bun 或 Node.js）
   * @private
   */
  _createProcess(
    command: string,
    args: string[],
    options: {
      cwd: string;
      stdio: [string, string, string];
      windowsHide?: boolean;
    }
  ): ChildProcess {
    const runtime = detectRuntime();

    if (runtime === RuntimeEnvironment.BUN) {
      return this._createBunProcess(command, args, options);
    } else {
      return this._createNodeProcess(command, args, options);
    }
  },

  /**
   * 创建 Bun 进程（包装为 Node.js ChildProcess 兼容接口）
   * @private
   */
  _createBunProcess(command: string, args: string[], options: any): any {
    // @ts-ignore - Bun 全局变量
    const proc = Bun.spawn([command, ...args], {
      cwd: options.cwd,
      stdout: 'pipe',
      stderr: options.stdio[2] === 'pipe' ? 'pipe' : 'ignore',
    });

    // 包装成 Node.js ChildProcess 兼容接口
    const wrapper: any = {
      // 将 Bun 的 ReadableStream 转换为 Node.js Readable
      stdout: proc.stdout as any,
      stderr: proc.stderr as any,
      pid: proc.pid,
      get killed() {
        return proc.killed;
      },
      get exitCode() {
        return proc.exitCode;
      },
      kill(signal?: string) {
        proc.kill(signal as any);
        return true;
      },
      on(event: string, handler: any) {
        if (event === 'close') {
          proc.exited.then(() => handler(proc.exitCode));
        } else if (event === 'error') {
          // Bun 进程错误处理（暂时不实现，因为 Bun.spawn 很少出错）
        }
        return wrapper;
      },
    };

    return wrapper;
  },

  /**
   * 创建 Node.js 进程
   * @private
   */
  _createNodeProcess(command: string, args: string[], options: any): ChildProcess {
    return spawn(command, args, {
      cwd: options.cwd,
      stdio: options.stdio,
      windowsHide: options.windowsHide ?? true,
    });
  },

  /**
   * 设置 Abort 处理器
   * @private
   */
  _setupAbortHandler(
    proc: ChildProcess,
    signal?: AbortSignal
  ): { aborted: boolean; cleanup: () => void } {
    const state = { aborted: false };

    const onAbort = () => {
      state.aborted = true;

      logger.debug(`🛑 [Ripgrep:Abort] Killing process`, { pid: proc.pid });

      // 先销毁流，再杀进程
      (proc.stdout as any)?.destroy?.();
      proc.kill('SIGTERM');

      // 500ms 后强制杀死
      setTimeout(() => {
        if (!proc.killed) {
          logger.debug(`🛑 [Ripgrep:ForceKill] Forcing kill`, { pid: proc.pid });
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
  },

  /**
   * 从流中逐行读取数据
   * @private
   */
  async *_readLinesFromStream(
    stream: Readable,
    checkAborted: () => boolean
  ): AsyncGenerator<string, void, unknown> {
    let buffer = '';

    try {
      for await (const chunk of stream as AsyncIterable<Buffer>) {
        if (checkAborted()) break;

        buffer += chunk.toString('utf-8');
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line) yield line;
        }
      }
    } catch (streamError: unknown) {
      if (!checkAborted()) throw streamError;
    }

    if (buffer && !checkAborted()) {
      yield buffer;
    }
  },

  /**
   * 等待进程退出
   * @private
   */
  async _waitForProcessExit(
    proc: ChildProcess,
    checkAborted: () => boolean
  ): Promise<void> {
    if (checkAborted()) {
      throw createAbortError();
    }

    if (proc.killed || proc.exitCode !== null) {
      return;
    }

    await new Promise<void>((resolve, reject) => {
      proc.on('close', (code) => {
        if (checkAborted()) {
          reject(createAbortError());
          return;
        }

        if (code === 0 || code === 1) {
          resolve();
        } else {
          reject(new Error(`ripgrep exited with code ${code}`));
        }
      });

      proc.on('error', (err) => {
        if (checkAborted()) {
          reject(createAbortError());
          return;
        }
        reject(err);
      });
    });
  },
};

/**
 * 下载 ripgrep
 *
 * @param binDir - 目标目录
 */
async function downloadRipgrep(binDir: string): Promise<void> {
  const downloadStartTime = Date.now();
  const platformKey = getPlatformKey();
  const config = PLATFORM_CONFIG[platformKey];

  if (!config) {
    const error = `Unsupported platform: ${platformKey}`;
    ripgrepLogger.downloadError(error, '', 0);
    throw new Error(error);
  }

  // 确保目录存在
  if (!existsSync(binDir)) {
    mkdirSync(binDir, { recursive: true });
  }

  const filename = `ripgrep-${RIPGREP_VERSION}-${config.platform}.${config.extension}`;
  const url = `https://github.com/BurntSushi/ripgrep/releases/download/${RIPGREP_VERSION}/${filename}`;
  const archivePath = join(binDir, filename);
  const binaryPath = join(binDir, getRipgrepBinaryName());

  // 记录下载开始
  ripgrepLogger.downloadStart(url, binDir);

  // 创建 AbortController 用于超时控制
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, DOWNLOAD_TIMEOUT_MS);

  try {
    // 下载文件（带超时控制）
    const response = await fetch(url, {
      signal: controller.signal,
    });

    if (!response.ok) {
      const error = `HTTP ${response.status} ${response.statusText}`;
      const duration = Date.now() - downloadStartTime;
      ripgrepLogger.downloadError(error, url, duration);
      throw new Error(`Failed to download ripgrep: ${error}`);
    }

    // 获取文件大小（如果可用）
    const contentLength = response.headers.get('content-length');
    const totalBytes = contentLength ? parseInt(contentLength, 10) : null;

    // 保存到文件（带进度日志）
    const fileStream = createWriteStream(archivePath);
    let downloadedBytes = 0;
    let lastLogTime = Date.now();

    // 创建一个 TransformStream 来追踪进度
    const progressStream = new TransformStream({
      transform(chunk, controller) {
        downloadedBytes += chunk.length;
        const now = Date.now();
        // 每 2 秒记录一次进度，避免日志过多
        if (now - lastLogTime > 2000) {
          ripgrepLogger.downloadProgress(downloadedBytes, totalBytes);
          lastLogTime = now;
        }
        controller.enqueue(chunk);
      },
    });

    // 使用 pipeline 进行流式下载
    const bodyStream = response.body;
    if (!bodyStream) {
      throw new Error('Response body is null');
    }

    await pipeline(
      Readable.fromWeb(bodyStream.pipeThrough(progressStream) as any),
      fileStream
    );

    // 清除超时
    clearTimeout(timeoutId);

    const downloadDuration = Date.now() - downloadStartTime;
    ripgrepLogger.downloadProgress(downloadedBytes, totalBytes); // 最终进度

    // 解压
    const extractStartTime = Date.now();
    ripgrepLogger.extractStart(archivePath, binDir);

    if (config.extension === 'tar.gz') {
      await extractTarGz(archivePath, binDir, platformKey);
    } else {
      await extractZip(archivePath, binDir);
    }

    const extractDuration = Date.now() - extractStartTime;
    ripgrepLogger.extractComplete(extractDuration);

    // 设置可执行权限（非 Windows）
    if (process.platform !== 'win32') {
      chmodSync(binaryPath, 0o755);
    }

    // 删除压缩包
    try {
      unlinkSync(archivePath);
    } catch {
      // 忽略删除失败
    }

    // 记录下载完成
    const totalDuration = Date.now() - downloadStartTime;
    ripgrepLogger.downloadComplete(totalDuration, binaryPath);
  } catch (error: unknown) {
    clearTimeout(timeoutId);
    const duration = Date.now() - downloadStartTime;

    // 处理超时错误
    if (error instanceof Error && error.name === 'AbortError') {
      const timeoutError = `Download timeout after ${DOWNLOAD_TIMEOUT_MS}ms`;
      ripgrepLogger.downloadError(timeoutError, url, duration);
      throw new Error(timeoutError);
    }

    // 处理其他错误
    const errorMessage = error instanceof Error ? error.message : String(error);
    ripgrepLogger.downloadError(errorMessage, url, duration);
    throw error;
  }
}

/**
 * 解压 tar.gz 文件
 */
async function extractTarGz(archivePath: string, targetDir: string, platformKey: string): Promise<void> {
  const args = ['tar', '-xzf', archivePath, '--strip-components=1', '-C', targetDir];

  // 不同平台需要不同的参数来只提取 rg 二进制
  if (platformKey.endsWith('-darwin')) {
    args.push('--include=*/rg');
  } else if (platformKey.endsWith('-linux')) {
    args.push('--wildcards', '*/rg');
  }

  return new Promise((resolve, reject) => {
    const proc = spawn(args[0], args.slice(1), {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });

    let stderr = '';
    proc.stderr.on('data', (chunk) => {
      stderr += chunk.toString('utf-8');
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        const error = `Failed to extract tar.gz: ${stderr}`;
        ripgrepLogger.extractError(error, archivePath);
        reject(new Error(error));
      }
    });

    proc.on('error', (err) => {
      ripgrepLogger.extractError(err.message, archivePath);
      reject(err);
    });
  });
}

/**
 * 解压 zip 文件（Windows）
 */
async function extractZip(archivePath: string, targetDir: string): Promise<void> {
  // 使用 PowerShell 解压
  const script = `
    $zip = [System.IO.Compression.ZipFile]::OpenRead('${archivePath.replace(/'/g, "''")}')
    try {
      $entry = $zip.Entries | Where-Object { $_.Name -eq 'rg.exe' } | Select-Object -First 1
      if ($entry) {
        $targetPath = Join-Path '${targetDir.replace(/'/g, "''")}' 'rg.exe'
        [System.IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $targetPath, $true)
      }
    } finally {
      $zip.Dispose()
    }
  `;

  return new Promise((resolve, reject) => {
    const proc = spawn('powershell', ['-NoProfile', '-Command', script], {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });

    let stderr = '';
    proc.stderr.on('data', (chunk) => {
      stderr += chunk.toString('utf-8');
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        const error = `Failed to extract zip: ${stderr}`;
        ripgrepLogger.extractError(error, archivePath);
        reject(new Error(error));
      }
    });

    proc.on('error', (err) => {
      ripgrepLogger.extractError(err.message, archivePath);
      reject(err);
    });
  });
}

export default Ripgrep;
