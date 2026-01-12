/**
 * Glob（npm 包）vs ripgrep（rg --files）文件枚举 + mtime 获取性能对比
 *
 * 运行方式：
 * - Bun:     bun run packages/core/src/core/tool/__tests__/glob-ripgrep-performance.test.cjs
 * - Node.js: node packages/core/src/core/tool/__tests__/glob-ripgrep-performance.test.cjs
 *
 * 参数：
 * - --pattern=**\\/*         glob 模式（默认 **\\/*）
 * - --limit=1000             最多取多少个文件做 mtime+排序（默认 1000）
 * - --includeHidden=1        是否包含隐藏文件（默认 1）
 * - --statConcurrency=1      ripgrep 方案 stat 并发（默认 1；与当前策略更接近）
 * - --warmup=2 --runs=7      预热次数 & 采样次数（默认 2/7）
 *
 * 注意：
 * - Node 下的 “glob vs ripgrep+stat” 往往主要由 stat 成本决定；Bun 下 Bun.file().stat 可能更便宜。
 * - 若系统未安装 rg，本脚本会提示安装（不会触发自动下载，避免网络依赖）。
 */

const { spawn } = require('child_process');
const { resolve } = require('path');
const { performance } = require('perf_hooks');
const { stat: statAsync } = require('fs/promises');

function detectRuntime() {
  if (typeof Bun !== 'undefined') return 'bun';
  return 'node';
}

function getArgString(name, fallback) {
  const prefix = `${name}=`;
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith(prefix)) return arg.slice(prefix.length);
  }
  return fallback;
}

function getArgNumber(name, fallback) {
  const prefix = `${name}=`;
  for (const arg of process.argv.slice(2)) {
    if (!arg.startsWith(prefix)) continue;
    const value = Number(arg.slice(prefix.length));
    return Number.isFinite(value) ? value : fallback;
  }
  return fallback;
}

function getArgBoolean(name, fallback) {
  const raw = getArgString(name, '');
  if (!raw) return fallback;
  if (raw === '1' || raw === 'true') return true;
  if (raw === '0' || raw === 'false') return false;
  return fallback;
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

async function mapWithConcurrency(items, concurrency, fn) {
  const limit = Math.max(1, Math.floor(concurrency));
  let index = 0;
  const workers = new Array(Math.min(limit, items.length)).fill(0).map(async () => {
    while (true) {
      const current = index++;
      if (current >= items.length) return;
      await fn(items[current], current);
    }
  });
  await Promise.all(workers);
}

function sortByRecentFirst(files) {
  const now = Date.now();
  const RECENT_THRESHOLD = 24 * 60 * 60 * 1000;

  files.sort((a, b) => {
    const aRecent = now - a.mtime < RECENT_THRESHOLD;
    const bRecent = now - b.mtime < RECENT_THRESHOLD;
    if (aRecent && !bRecent) return -1;
    if (!aRecent && bRecent) return 1;
    return b.mtime - a.mtime;
  });
}

function getExcludeDirs() {
  // 对齐项目里 Glob 的默认排除目录，并加上 ripgrep 工具默认额外排除项
  return ['node_modules', '.git', 'dist', 'build', 'coverage', '.next', '.nuxt', '.turbo', 'store', 'logs'];
}

async function assertRipgrepAvailable() {
  return new Promise((resolvePromise, rejectPromise) => {
    const proc = spawn('rg', ['--version'], { stdio: ['ignore', 'pipe', 'pipe'] });
    proc.on('error', (err) => rejectPromise(err));
    proc.on('close', (code) => {
      if (code === 0) return resolvePromise();
      rejectPromise(new Error(`rg exited with code ${code}`));
    });
  });
}

async function ripgrepListFiles({ cwd, pattern, includeHidden, limit }) {
  const args = ['--files'];
  if (includeHidden) args.push('--hidden');

  for (const dir of getExcludeDirs()) {
    args.push(`--glob=!${dir}/**`);
  }

  // 让 rg 自己做 glob 过滤，减少输出量
  if (pattern) args.push(`--glob=${pattern}`);

  const proc = spawn('rg', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '';
  let stderr = '';
  let done = false;
  const files = [];

  const killProc = () => {
    if (done) return;
    done = true;
    try {
      proc.kill('SIGKILL');
    } catch {
      // ignore
    }
  };

  return await new Promise((resolvePromise, rejectPromise) => {
    proc.on('error', (err) => rejectPromise(err));

    proc.stdout.on('data', (chunk) => {
      stdout += chunk.toString('utf8');
      while (true) {
        const idx = stdout.indexOf('\n');
        if (idx === -1) break;
        const line = stdout.slice(0, idx).trim();
        stdout = stdout.slice(idx + 1);
        if (!line) continue;
        files.push(line);
        if (files.length >= limit) {
          killProc();
          break;
        }
      }
    });

    proc.stderr.on('data', (chunk) => {
      stderr += chunk.toString('utf8');
    });

    proc.on('close', (code, signal) => {
      // 如果是我们提前 kill 的，code/signal 可能是非 0；忽略。
      if (!done && code && code !== 0) {
        return rejectPromise(new Error(`rg failed: code=${code} signal=${signal || ''} stderr=${stderr}`));
      }
      done = true;
      // rg 输出是相对 cwd 的路径
      resolvePromise(files);
    });
  });
}

async function getMtimeMs(fullPath) {
  if (typeof Bun !== 'undefined') {
    const stats = await Bun.file(fullPath).stat();
    return stats.mtime.getTime();
  }
  const stats = await statAsync(fullPath);
  return stats.mtimeMs;
}

async function strategyRipgrepPlusStat({ cwd, pattern, includeHidden, limit, statConcurrency }) {
  const startList = performance.now();
  const relativePaths = await ripgrepListFiles({ cwd, pattern, includeHidden, limit });
  const listMs = performance.now() - startList;

  const startStat = performance.now();
  const files = relativePaths.map((p) => ({ path: resolve(cwd, p), mtime: 0 }));
  await mapWithConcurrency(files, statConcurrency, async (file) => {
    try {
      file.mtime = await getMtimeMs(file.path);
    } catch {
      file.mtime = 0;
    }
  });
  sortByRecentFirst(files);
  const statAndSortMs = performance.now() - startStat;

  return {
    fileCount: files.length,
    listMs,
    statAndSortMs,
    totalMs: listMs + statAndSortMs,
  };
}

async function strategyGlobNpm({ cwd, pattern, includeHidden, limit }) {
  const { glob } = await import('glob');
  const ignore = getExcludeDirs().map((dir) => `**/${dir}/**`);

  const start = performance.now();
  const results = await glob(pattern, {
    cwd,
    withFileTypes: true,
    stat: true,
    nodir: true,
    follow: false,
    dot: includeHidden,
    ignore,
  });

  const files = [];
  for (const entry of results) {
    if (files.length >= limit) break;
    try {
      files.push({
        path: entry.fullpath(),
        mtime: entry.mtimeMs ?? 0,
      });
    } catch {
      files.push({ path: entry.fullpath(), mtime: 0 });
    }
  }
  sortByRecentFirst(files);
  const totalMs = performance.now() - start;

  return {
    fileCount: files.length,
    totalMs,
  };
}

async function benchmark(label, runOnce, { warmupRuns, runs }) {
  for (let i = 0; i < warmupRuns; i++) await runOnce();
  const samples = [];
  for (let i = 0; i < runs; i++) samples.push(await runOnce());

  const totals = samples.map((s) => s.totalMs);
  return {
    label,
    medianMs: median(totals),
    samples,
  };
}

async function main() {
  const runtime = detectRuntime();
  const cwd = process.cwd();
  const pattern = getArgString('--pattern', '**/*');
  const limit = getArgNumber('--limit', 1000);
  const includeHidden = getArgBoolean('--includeHidden', true);
  const statConcurrency = getArgNumber('--statConcurrency', 1);
  const warmupRuns = getArgNumber('--warmup', 2);
  const runs = getArgNumber('--runs', 7);

  console.log('\nGlob（npm 包）vs ripgrep（rg --files）性能对比\n');
  console.log(`运行时: ${runtime}`);
  console.log(`Node 版本: ${process.versions?.node ?? 'unknown'}`);
  if (runtime === 'bun') console.log(`Bun 版本: ${Bun.version}`);
  console.log(
    `参数: --pattern=${pattern} --limit=${limit} --includeHidden=${includeHidden ? 1 : 0} --statConcurrency=${statConcurrency} --warmup=${warmupRuns} --runs=${runs}\n`
  );

  try {
    await assertRipgrepAvailable();
  } catch {
    console.log('未检测到系统 rg（ripgrep）。请先安装：');
    console.log('  - macOS: brew install ripgrep');
    console.log('  - 其他: https://github.com/BurntSushi/ripgrep\n');
    process.exit(1);
  }

  const globBench = await benchmark(
    'glob-npm(stat:true)',
    async () => strategyGlobNpm({ cwd, pattern, includeHidden, limit }),
    { warmupRuns, runs }
  );

  const rgBench = await benchmark(
    'rg --files + stat',
    async () =>
      strategyRipgrepPlusStat({
        cwd,
        pattern,
        includeHidden,
        limit,
        statConcurrency,
      }),
    { warmupRuns, runs }
  );

  console.log('结果（中位数）:\n');
  console.log(`- glob: ${globBench.medianMs.toFixed(2)}ms`);
  console.log(`- rg+stat: ${rgBench.medianMs.toFixed(2)}ms`);

  const ratio = globBench.medianMs / rgBench.medianMs;
  console.log('\n对比:');
  if (ratio > 1) {
    console.log(`- rg+stat 比 glob 快: ${ratio.toFixed(2)}x`);
  } else {
    console.log(`- glob 比 rg+stat 快: ${(1 / ratio).toFixed(2)}x`);
  }

  console.log('\nJSON:');
  console.log(
    JSON.stringify(
      {
        runtime,
        cwd,
        pattern,
        limit,
        includeHidden,
        statConcurrency,
        warmupRuns,
        runs,
        glob: { medianMs: Number(globBench.medianMs.toFixed(3)) },
        rg: { medianMs: Number(rgBench.medianMs.toFixed(3)) },
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
