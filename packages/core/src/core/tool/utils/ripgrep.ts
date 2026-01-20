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

import { existsSync, mkdirSync, chmodSync, unlinkSync, createWriteStream, statSync } from 'fs';
import { join, dirname } from 'path';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';
import { createAbortError } from './error-utils.js';
import { ripgrepLogger } from '../../../utils/logUtils.js';
import { logger } from '../../../utils/logger.js';
import {
  createProcess,
  setupAbortHandler,
  readStreamAsText,
  readStreamAsTextLimited,
  waitForProcessExit,
} from './spawn.js';

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
    const cmd = process.platform === 'win32' ? 'where' : 'which';
    // @ts-ignore - Bun 全局变量
    const result = Bun.spawnSync([cmd, 'rg'], {
      stdin: 'ignore',
      stdout: 'pipe',
      stderr: 'ignore',
    });

    if (result.exitCode !== 0) return null;

    const output = new TextDecoder().decode(result.stdout).trim();
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

    // 3. 检查路径是否存在
    if (!existsSync(input.cwd)) {
      throw Object.assign(new Error(`No such file or directory: '${input.cwd}'`), {
        code: 'ENOENT',
        errno: -2,
        path: input.cwd,
      });
    }

    // 4. 检查路径是文件还是目录
    // 如果是文件，使用其父目录作为 cwd
    let processCwd = input.cwd;
    try {
      const stat = statSync(input.cwd);
      if (stat.isFile()) {
        processCwd = dirname(input.cwd);
      }
    } catch {
      // stat 失败，保持原样
    }

    // 5. 启动进程（自动选择 Bun 或 Node.js）
    logger.debug(`🚀 [Ripgrep:Spawn] Starting process`, {
      rgPath,
      args,
      cwd: processCwd,
    });

    const proc = createProcess(rgPath, args, {
      cwd: processCwd,
      stdio: ['ignore', 'pipe', 'ignore'],
      windowsHide: true,
    });

    // 5. 设置 Abort 处理
    const abortHandler = setupAbortHandler(proc, input.signal, 'Ripgrep');
    const checkAborted = () => abortHandler.aborted;

    try {
      // 6. 使用 Response.text() 读取所有输出
      const output = await readStreamAsText(proc.stdout, input.signal);

      // 7. 等待进程退出
      await waitForProcessExit(proc, checkAborted, [0, 1], 'ripgrep');

      // 8. 逐行 yield
      if (output) {
        const lines = output.trim().split(/\r?\n/);
        for (const line of lines) {
          if (line) yield line;
        }
      }
    } finally {
      // 9. 清理资源
      abortHandler.cleanup();
    }
  },

  /**
   * 流式搜索生成器
   *
   * 使用 Response.text() 读取所有输出，然后逐行 yield。
   * 这种方式比手动流式读取更可靠，不会在超时时触发 Bun 流错误。
   *
   * @param input - 输入参数
   * @param input.cwd - 搜索路径（可以是目录或文件）
   * @param input.pattern - 搜索模式
   * @param input.glob - 文件过滤 glob 模式
   * @param input.binDir - 本地二进制缓存目录
   * @param input.signal - 中止信号
   * @param input.maxCount - 每个文件的最大匹配数（默认 100）
   * @yields 每一行搜索结果（格式：文件路径|行号|行内容）
   */
  async *searchStream(input: {
    cwd: string;
    pattern: string;
    glob?: string;
    binDir?: string;
    signal?: AbortSignal;
    maxCount?: number;
  }): AsyncGenerator<string, void, unknown> {
    // 1. 初始检查
    if (input.signal?.aborted) {
      throw createAbortError();
    }

    // 2. 检查搜索路径是文件还是目录
    let searchTarget = input.cwd;
    let processCwd = input.cwd;

    try {
      const stat = statSync(input.cwd);
      if (stat.isFile()) {
        processCwd = dirname(input.cwd);
      }
    } catch {
      // stat 失败，保持原样
    }

    // 3. 准备命令
    const rgPath = await Ripgrep.filepath(input.binDir);
    const args = [
      '-nH', // -n: 行号, -H: 文件名
      '--field-match-separator=|', // 使用 | 分隔字段
      '--no-messages', // 抑制权限/读取失败等噪音错误，避免 stderr 堵塞
      '--regexp',
      input.pattern,
    ];

    // 🔑 添加 --max-count 限制（防止输出过大）
    const maxCount = input.maxCount ?? 100; // 默认每个文件最多 100 条
    args.push('--max-count', String(maxCount));

    if (input.glob) {
      args.push('--glob', input.glob);
    }
    args.push(searchTarget);

    // 4. 启动进程
    logger.debug(`🚀 [Ripgrep:SearchStream] Starting process`, {
      rgPath,
      args,
      cwd: processCwd,
    });

    const proc = createProcess(rgPath, args, {
      cwd: processCwd,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    // 5. 设置 Abort 处理
    const abortHandler = setupAbortHandler(proc, input.signal, 'Ripgrep');
    const checkAborted = () => abortHandler.aborted;

    try {
      // 6. 使用 Response.text() 读取所有输出
      // 这种方式不会在超时时触发 Bun 流错误
      logger.debug('📖 [searchStream] Starting to read stdout');
      const output = await readStreamAsText(proc.stdout, input.signal);
      logger.debug('📖 [searchStream] Finished reading stdout', { length: output.length });

      // 7. 等待进程退出
      logger.debug('⏳ [searchStream] Waiting for process exit');
      await waitForProcessExit(proc, checkAborted, [0, 1], 'ripgrep');
      logger.debug('✅ [searchStream] Process exited', { exitCode: proc.exitCode });

      // 8. 逐行 yield
      if (output) {
        const lines = output.trim().split(/\r?\n/);
        logger.debug('📝 [searchStream] Yielding lines', { count: lines.length });
        for (const line of lines) {
          if (line) yield line;
        }
      }
    } finally {
      // 9. 清理资源
      logger.debug('🧹 [searchStream] Cleaning up');
      abortHandler.cleanup();
    }
  },

  /**
   * 执行搜索（累积所有输出）
   *
   * 注意：对于大范围搜索，建议使用 searchStream() 流式方法。
   *
   * @param input - 输入参数
   * @param input.cwd - 搜索路径（可以是目录或文件）
   * @param input.pattern - 搜索模式
   * @param input.glob - 文件过滤 glob 模式
   * @param input.binDir - 本地二进制缓存目录
   * @param input.signal - 中止信号
   * @param input.maxCount - 每个文件的最大匹配数（默认 100）
   * @returns 搜索输出
   * @deprecated 建议使用 searchStream() 流式方法，避免内存问题
   */
  async search(input: {
    cwd: string;
    pattern: string;
    glob?: string;
    binDir?: string;
    signal?: AbortSignal;
    maxCount?: number;
    maxOutputBytes?: number;
    maxOutputLines?: number;
  }): Promise<string> {
    logger.debug(`[Ripgrep:search] Starting`, {
      cwd: input.cwd,
      maxOutputBytes: input.maxOutputBytes,
      maxOutputLines: input.maxOutputLines,
    });

    // 1. 初始检查
    if (input.signal?.aborted) {
      throw createAbortError();
    }

    // 2. 检查搜索路径是文件还是目录
    // 如果是文件，使用其父目录作为 cwd，文件路径作为搜索目标
    let searchTarget = input.cwd;
    let processCwd = input.cwd;

    try {
      const stat = statSync(input.cwd);
      if (stat.isFile()) {
        // 如果是文件，使用父目录作为 cwd
        processCwd = dirname(input.cwd);
      }
    } catch {
      // 如果 stat 失败，保持原样（后续 ripgrep 会报错）
    }

    // 3. 准备命令
    const rgPath = await Ripgrep.filepath(input.binDir);
    const args = [
      '-nH', // -n: 行号, -H: 文件名
      '--field-match-separator=|', // 使用 | 分隔字段
      '--regexp',
      input.pattern,
    ];

    // 🔑 添加 --max-count 限制（防止输出过大）
    const maxCount = input.maxCount ?? 100; // 默认每个文件最多 100 条
    args.push('--max-count', String(maxCount));

    if (input.glob) {
      args.push('--glob', input.glob);
    }
    args.push(searchTarget);

    // 4. 启动进程（自动选择 Bun 或 Node.js）
    logger.debug(`🚀 [Ripgrep:Search] Starting process`, {
      rgPath,
      args,
    });

    const proc = createProcess(rgPath, args, {
      cwd: processCwd,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    // 5. 设置 Abort 处理
    const abortHandler = setupAbortHandler(proc, input.signal, 'Ripgrep');
    const checkAborted = () => abortHandler.aborted;

    try {
      // 6. 以“有上限”的方式读取 stdout：
      //    - 读的过程中就限制输出规模，避免构造超大字符串触发 Bun 内部错误
      const MAX_OUTPUT_BYTES = input.maxOutputBytes ?? 50 * 1024 * 1024; // 50MB
      const { text: result, truncated, truncatedBy } = await readStreamAsTextLimited(proc.stdout, {
        signal: input.signal,
        maxBytes: MAX_OUTPUT_BYTES,
        maxLines: input.maxOutputLines,
      });

      // 7. 若触发上限：尽快停止 rg，避免继续输出/占用资源
      if (truncated) {
        logger.warn(`⚠️ [Ripgrep:search] Output capped (${truncatedBy ?? 'unknown'})`, {
          maxOutputBytes: MAX_OUTPUT_BYTES,
          maxOutputLines: input.maxOutputLines,
        });
        try {
          proc.kill('SIGTERM');
        } catch {
          // ignore
        }

        // 主动终止时不校验 exitCode（rg 可能被信号结束）
        try {
          await proc.exited;
        } catch {
          // ignore
        }

        return result.trimEnd();
      }

      // 8. 正常结束：等待进程退出并校验 exit code
      await waitForProcessExit(proc, checkAborted, [0, 1], 'ripgrep');
      return result.trimEnd();
    } finally {
      // 8. 清理资源
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

    await pipeline(Readable.fromWeb(bodyStream.pipeThrough(progressStream) as any), fileStream);

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
async function extractTarGz(
  archivePath: string,
  targetDir: string,
  platformKey: string
): Promise<void> {
  const args = ['tar', '-xzf', archivePath, '--strip-components=1', '-C', targetDir];

  // 不同平台需要不同的参数来只提取 rg 二进制
  if (platformKey.endsWith('-darwin')) {
    args.push('--include=*/rg');
  } else if (platformKey.endsWith('-linux')) {
    args.push('--wildcards', '*/rg');
  }

  try {
    // @ts-ignore - Bun 全局变量
    const proc = Bun.spawn(args, {
      stdin: 'ignore',
      stdout: 'ignore',
      stderr: 'pipe',
    });

    const stderr = proc.stderr ? await new Response(proc.stderr).text() : '';
    await proc.exited;

    if (proc.exitCode === 0) return;

    const error = `Failed to extract tar.gz: ${stderr}`;
    ripgrepLogger.extractError(error, archivePath);
    throw new Error(error);
  } catch (err: any) {
    ripgrepLogger.extractError(err?.message || String(err), archivePath);
    throw err;
  }
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

  try {
    // @ts-ignore - Bun 全局变量
    const proc = Bun.spawn(['powershell', '-NoProfile', '-Command', script], {
      stdin: 'ignore',
      stdout: 'ignore',
      stderr: 'pipe',
    });

    const stderr = proc.stderr ? await new Response(proc.stderr).text() : '';
    await proc.exited;

    if (proc.exitCode === 0) return;

    const error = `Failed to extract zip: ${stderr}`;
    ripgrepLogger.extractError(error, archivePath);
    throw new Error(error);
  } catch (err: any) {
    ripgrepLogger.extractError(err?.message || String(err), archivePath);
    throw err;
  }
}

export default Ripgrep;
