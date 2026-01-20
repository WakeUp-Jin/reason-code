/**
 * 异步 stat 性能测试（跨运行时 + Bun API 对比）
 *
 * 运行方式：
 * - Bun:     bun run packages/core/src/core/tool/__tests__/stat-async-performance.test.cjs
 * - Node.js: node packages/core/src/core/tool/__tests__/stat-async-performance.test.cjs
 *
 * 注意：
 * - 单次运行内无法“同时”测试 Node 与 Bun 运行时；需要分别用 Node 和 Bun 各跑一次再对比输出。
 * - 在 Bun 里 require('fs/promises') 是 Bun 的 Node 兼容层实现，不是 Node.js 本体。
 */

const { stat, readdir } = require('fs/promises');
const { join } = require('path');
const { performance } = require('perf_hooks');

/**
 * 检测运行时
 */
function detectRuntime() {
  if (typeof Bun !== 'undefined') return 'bun';
  return 'node';
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

/**
 * 获取测试文件列表
 */
async function getTestFiles(count = 1000) {
  const cwd = process.cwd();
  const files = [];
  
  // 收集项目中的真实文件
  const collectFiles = async (dir, depth = 0) => {
    if (depth > 3 || files.length >= count) return;
    
    try {
      const entries = await readdir(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        if (files.length >= count) break;
        
        const fullPath = join(dir, entry.name);
        
        // 跳过常见的大目录
        if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist') {
          continue;
        }
        
        if (entry.isFile()) {
          files.push(fullPath);
        } else if (entry.isDirectory()) {
          await collectFiles(fullPath, depth + 1);
        }
      }
    } catch (err) {
      // 忽略权限错误
    }
  };
  
  await collectFiles(cwd);
  return files.slice(0, count);
}

/**
 * 测试 fs.promises.stat() (异步)
 */
async function testFsPromisesStat(files, concurrency) {
  const start = performance.now();

  await mapWithConcurrency(files, concurrency, async (file) => {
    try {
      await stat(file);
    } catch {
      // 忽略错误
    }
  });
  
  const end = performance.now();
  return end - start;
}

/**
 * 测试 Bun.file().stat()（Bun 运行时专用 API）
 */
async function testBunFileStat(fileObjects, concurrency) {
  if (typeof Bun === 'undefined') {
    throw new Error('Bun.file() is not available in Node.js environment');
  }
  
  const start = performance.now();

  await mapWithConcurrency(fileObjects, concurrency, async (file) => {
    try {
      await file.stat();
    } catch {
      // 忽略错误
    }
  });
  
  const end = performance.now();
  return end - start;
}

async function benchmark(label, runOnce, { warmupRuns, runs }) {
  for (let i = 0; i < warmupRuns; i++) await runOnce();
  const samples = [];
  for (let i = 0; i < runs; i++) samples.push(await runOnce());
  const med = median(samples);
  return { label, samples, medianMs: med };
}

/**
 * 主测试函数
 */
async function runPerformanceTest() {
  const runtime = detectRuntime();
  const concurrency = getArgNumber('--concurrency', 16);
  const runs = getArgNumber('--runs', 7);
  const warmupRuns = getArgNumber('--warmup', 2);

  console.log('\n异步 stat 性能测试（跨运行时 + Bun API 对比）\n');
  console.log(`运行时: ${runtime}`);
  console.log(`Node 版本: ${process.versions?.node ?? 'unknown'}`);
  if (runtime === 'bun') console.log(`Bun 版本: ${Bun.version}`);
  console.log(`参数: --concurrency=${concurrency} --warmup=${warmupRuns} --runs=${runs}\n`);
  
  // 获取测试文件
  const fileCounts = [100, 500, 1000];
  
  for (const count of fileCounts) {
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`📁 测试 ${count} 个文件\n`);
    
    const files = await getTestFiles(count);
    console.log(`   实际文件数: ${files.length}`);
    
    if (files.length === 0) {
      console.log('   ⚠️  没有找到测试文件，跳过');
      continue;
    }
    
    console.log('\n   🟦 测试 fs.promises.stat()...');
    const fsBench = await benchmark(
      'fs.promises.stat',
      async () => testFsPromisesStat(files, concurrency),
      { warmupRuns, runs }
    );
    console.log(`      中位数: ${fsBench.medianMs.toFixed(2)}ms (${runs} 次)`);
    console.log(`      平均:   ${(fsBench.medianMs / files.length).toFixed(3)}ms/文件`);
    console.log(
      `      JSON:   ${JSON.stringify({
        runtime,
        api: 'fs.promises.stat',
        count: files.length,
        concurrency,
        warmupRuns,
        runs,
        medianMs: Number(fsBench.medianMs.toFixed(3)),
      })}`
    );
    
    // 测试 Bun stat（仅在 Bun 环境）
    if (runtime === 'bun') {
      const bunFiles = files.map((p) => Bun.file(p));
      console.log('\n   🟩 测试 Bun.file().stat()...');
      const bunBench = await benchmark(
        'Bun.file().stat',
        async () => testBunFileStat(bunFiles, concurrency),
        { warmupRuns, runs }
      );
      console.log(`      中位数: ${bunBench.medianMs.toFixed(2)}ms (${runs} 次)`);
      console.log(`      平均:   ${(bunBench.medianMs / files.length).toFixed(3)}ms/文件`);
      console.log(
        `      JSON:   ${JSON.stringify({
          runtime,
          api: 'Bun.file().stat',
          count: files.length,
          concurrency,
          warmupRuns,
          runs,
          medianMs: Number(bunBench.medianMs.toFixed(3)),
        })}`
      );

      const ratio = fsBench.medianMs / bunBench.medianMs;
      console.log('\n   对比（同一 Bun 运行时内）:');
      if (ratio > 1) {
        console.log(`      Bun.file().stat 比 fs.promises.stat 快: ${ratio.toFixed(2)}x`);
      } else {
        console.log(`      fs.promises.stat 比 Bun.file().stat 快: ${(1 / ratio).toFixed(2)}x`);
      }
    } else {
      console.log('\n   说明: Bun.file().stat() 仅在 Bun 环境可用（要看它请用 Bun 运行）。');
    }
  }
  
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  // 总结
  console.log('说明:\n');
  console.log('  - 要对比 Node vs Bun，请分别用 Node 与 Bun 各运行一次，对比 fs.promises.stat 的 JSON 行。');
  console.log('  - 并发度会显著影响结果；可用 --concurrency=4/16/64 等多跑几组看趋势。');
  console.log('  - 结果会受操作系统页缓存、磁盘类型、后台负载影响；建议多跑几次取中位数。\n');
}

// 运行测试
runPerformanceTest().catch(console.error);
