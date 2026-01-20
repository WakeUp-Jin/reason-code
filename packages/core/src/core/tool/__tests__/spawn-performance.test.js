/**
 * Bun 子进程性能基准测试（原 Bun vs Node.js 对比脚本）
 *
 * 测试项目：
 * 1. 启动速度对比
 * 2. 内存占用对比
 * 3. 大量输出处理性能
 * 4. 并发子进程处理能力
 *
 * 注意：
 * - 本脚本测量的是“父进程”的内存变化（process.memoryUsage），不是子进程内存。
 * - Bun(JSC) 与 Node(V8) 的 GC/内存策略不同，RSS/heap 指标仅作趋势参考。
 */

import { performance } from 'perf_hooks';

// Bun-only：本脚本用于 Bun 环境基准测试
const runtime = 'Bun';

console.log(`🚀 运行环境: ${runtime}`);
console.log(`📊 开始子进程性能测试...\n`);

const CONFIG = {
  iterations: Number(process.env.SPAWN_BENCH_ITERATIONS ?? 30),
  warmupIterations: Number(process.env.SPAWN_BENCH_WARMUP ?? 5),
  concurrency: Number(process.env.SPAWN_BENCH_CONCURRENCY ?? 20),
  memSampleIntervalMs: Number(process.env.SPAWN_BENCH_MEM_SAMPLE_MS ?? 5),
  largeOutputLines: Number(process.env.SPAWN_BENCH_LARGE_OUTPUT_LINES ?? 200000),
};

/**
 * 获取当前进程内存使用情况
 */
function getMemoryUsage() {
  const usage = process.memoryUsage();
  return {
    rss: Math.round(usage.rss / 1024 / 1024 * 100) / 100, // MB
    heapUsed: Math.round(usage.heapUsed / 1024 / 1024 * 100) / 100, // MB
    external: Math.round(usage.external / 1024 / 1024 * 100) / 100, // MB
  };
}

async function maybeGc() {
  try {
    // @ts-ignore - Bun.gc 在 Bun 环境可用
    if (typeof Bun?.gc === 'function') Bun.gc(true);
  } catch {
    // ignore
  }
}

function summarizeTimesMs(times) {
  const sorted = [...times].sort((a, b) => a - b);
  const mean = times.reduce((a, b) => a + b, 0) / times.length;
  const median = sorted[Math.floor(sorted.length / 2)];
  const p95 = sorted[Math.floor(sorted.length * 0.95) - 1] ?? sorted[sorted.length - 1];
  return {
    count: times.length,
    mean,
    median,
    p95,
    min: sorted[0],
    max: sorted[sorted.length - 1],
  };
}

async function sampleMemoryWhile(fn) {
  await maybeGc();
  const before = getMemoryUsage();
  let peak = { ...before };

  let timer = null;
  try {
    const startTime = performance.now();
    timer = setInterval(() => {
      const cur = getMemoryUsage();
      if (cur.rss > peak.rss) peak.rss = cur.rss;
      if (cur.heapUsed > peak.heapUsed) peak.heapUsed = cur.heapUsed;
      if (cur.external > peak.external) peak.external = cur.external;
    }, CONFIG.memSampleIntervalMs);

    const result = await fn();
    const endTime = performance.now();
    return { before, peak, after: getMemoryUsage(), result, durationMs: endTime - startTime };
  } finally {
    if (timer) clearInterval(timer);
    await maybeGc();
  }
}

/**
 * 创建子进程的统一接口
 */
async function createProcess(command, args, options = {}) {
  // @ts-ignore - Bun 全局变量
  return Bun.spawn([command, ...args], {
    stdin: 'ignore',
    stdout: options.stdout ?? 'pipe',
    stderr: options.stderr ?? 'pipe',
    ...options,
  });
}

function getSimpleCommand() {
  if (process.platform === 'win32') return { command: 'cmd', args: ['/c', 'echo', 'hello world'] };
  return { command: 'echo', args: ['hello world'] };
}

async function waitForExit(proc) {
  await proc.exited;
  return proc.exitCode ?? -1;
}

/**
 * 读取进程输出
 */
async function readProcessOutput(proc) {
  const output = proc.stdout ? await new Response(proc.stdout).text() : '';
  await proc.exited;
  if (proc.exitCode === 0) return output;
  throw new Error(`Process exited with code ${proc.exitCode}`);
}

/**
 * 测试1: 简单命令启动速度
 */
async function testSimpleCommandSpeed() {
  console.log('📋 测试1: 简单命令启动速度');
  
  const { command, args } = getSimpleCommand();

  for (let i = 0; i < CONFIG.warmupIterations; i++) {
    const proc = await createProcess(command, args, { stdout: 'ignore', stderr: 'ignore' });
    await waitForExit(proc);
  }

  const times = [];
  const mem = await sampleMemoryWhile(async () => {
    for (let i = 0; i < CONFIG.iterations; i++) {
      const start = performance.now();
      const proc = await createProcess(command, args, { stdout: 'ignore', stderr: 'ignore' });
      const exitCode = await waitForExit(proc);
      const end = performance.now();

      if (exitCode !== 0) {
        console.error(`  ❌ 第${i + 1}次测试退出码异常: ${exitCode}`);
        continue;
      }
      times.push(end - start);
    }
  });

  const summary = summarizeTimesMs(times);
  const peakDiff = { rss: mem.peak.rss - mem.before.rss, heapUsed: mem.peak.heapUsed - mem.before.heapUsed };
  const endDiff = { rss: mem.after.rss - mem.before.rss, heapUsed: mem.after.heapUsed - mem.before.heapUsed };

  console.log(`  ⏱️  平均: ${summary.mean.toFixed(2)}ms, 中位数: ${summary.median.toFixed(2)}ms, P95: ${summary.p95.toFixed(2)}ms`);
  console.log(`  📈 最快: ${summary.min.toFixed(2)}ms, 最慢: ${summary.max.toFixed(2)}ms (样本 ${summary.count})`);
  console.log(`  💾 内存(父进程): 峰值 RSS +${peakDiff.rss.toFixed(2)}MB, 峰值 Heap +${peakDiff.heapUsed.toFixed(2)}MB`);
  console.log(`  💾 内存(父进程): 结束 RSS +${endDiff.rss.toFixed(2)}MB, 结束 Heap +${endDiff.heapUsed.toFixed(2)}MB\n`);

  return { times, summary, peakDiff, endDiff };
}

/**
 * 测试2: 大量输出处理
 */
async function testLargeOutputHandling() {
  try {
    const command = process.platform === 'win32' ? 'cmd' : 'seq';
    const args =
      process.platform === 'win32'
        ? ['/c', 'for', '/l', '%i', 'in', '(1,1,' + CONFIG.largeOutputLines + ')', 'do', '@echo', '%i']
        : ['1', String(CONFIG.largeOutputLines)];

    console.log(`📋 测试2: 大量输出处理 (${command} 生成 ${CONFIG.largeOutputLines} 行输出)`);

    const mem = await sampleMemoryWhile(async () => {
      const proc = await createProcess(command, args, { stdout: 'pipe', stderr: 'ignore' });
      return await readProcessOutput(proc);
    });

    const output = mem.result ?? '';
    const peakDiff = { rss: mem.peak.rss - mem.before.rss, heapUsed: mem.peak.heapUsed - mem.before.heapUsed };
    const endDiff = { rss: mem.after.rss - mem.before.rss, heapUsed: mem.after.heapUsed - mem.before.heapUsed };

    console.log(`  ⏱️  处理时间: ${mem.durationMs.toFixed(2)}ms`);
    console.log(`  📄 输出大小: ${output.length} 字符`);
    console.log(`  💾 内存(父进程): 峰值 RSS +${peakDiff.rss.toFixed(2)}MB, 峰值 Heap +${peakDiff.heapUsed.toFixed(2)}MB`);
    console.log(`  💾 内存(父进程): 结束 RSS +${endDiff.rss.toFixed(2)}MB, 结束 Heap +${endDiff.heapUsed.toFixed(2)}MB\n`);

    return { timeMs: mem.durationMs, outputSize: output.length, peakDiff, endDiff };
  } catch (error) {
    console.error(`  ❌ 测试失败:`, error.message);
    return null;
  }
}

/**
 * 测试3: 并发子进程处理
 */
async function testConcurrentProcesses() {
  try {
    console.log(`📋 测试3: 并发子进程处理 (${CONFIG.concurrency} 个并发简单命令)`);

    const { command, args } = getSimpleCommand();

    const mem = await sampleMemoryWhile(async () => {
      const promises = Array.from({ length: CONFIG.concurrency }, async () => {
        const proc = await createProcess(command, args, { stdout: 'ignore', stderr: 'ignore' });
        const exitCode = await waitForExit(proc);
        if (exitCode !== 0) throw new Error(`Process exited with code ${exitCode}`);
        return exitCode;
      });
      return await Promise.all(promises);
    });

    const peakDiff = { rss: mem.peak.rss - mem.before.rss, heapUsed: mem.peak.heapUsed - mem.before.heapUsed };
    const endDiff = { rss: mem.after.rss - mem.before.rss, heapUsed: mem.after.heapUsed - mem.before.heapUsed };
    const ok = Array.isArray(mem.result) ? mem.result.length : 0;

    console.log(`  ⏱️  总处理时间: ${mem.durationMs.toFixed(2)}ms`);
    console.log(`  ✅ 成功处理: ${ok}/${CONFIG.concurrency} 个进程`);
    console.log(`  📈 平均每进程: ${(mem.durationMs / CONFIG.concurrency).toFixed(2)}ms`);
    console.log(`  💾 内存(父进程): 峰值 RSS +${peakDiff.rss.toFixed(2)}MB, 峰值 Heap +${peakDiff.heapUsed.toFixed(2)}MB`);
    console.log(`  💾 内存(父进程): 结束 RSS +${endDiff.rss.toFixed(2)}MB, 结束 Heap +${endDiff.heapUsed.toFixed(2)}MB\n`);

    return {
      totalTimeMs: mem.durationMs,
      avgTimePerProcessMs: mem.durationMs / CONFIG.concurrency,
      peakDiff,
      endDiff,
    };
  } catch (error) {
    console.error(`  ❌ 测试失败:`, error.message);
    return null;
  }
}

/**
 * 测试4: 文件搜索性能 (模拟 ripgrep 场景)
 */
async function testFileSearchPerformance() {
  console.log('📋 测试4: 文件搜索性能 (find 命令)');

  try {
    const mem = await sampleMemoryWhile(async () => {
      // 搜索当前目录下的 .ts 文件
      const proc = await createProcess('find', ['.', '-name', '*.ts', '-type', 'f']);
      return await readProcessOutput(proc);
    });

    const output = mem.result ?? '';
    const fileCount = output.trim().split('\n').filter(line => line.length > 0).length;
    const peakDiff = { rss: mem.peak.rss - mem.before.rss, heapUsed: mem.peak.heapUsed - mem.before.heapUsed };
    const endDiff = { rss: mem.after.rss - mem.before.rss, heapUsed: mem.after.heapUsed - mem.before.heapUsed };
    
    console.log(`  ⏱️  搜索时间: ${mem.durationMs.toFixed(2)}ms`);
    console.log(`  📁 找到文件: ${fileCount} 个`);
    console.log(`  📈 平均每文件: ${(mem.durationMs / Math.max(fileCount, 1)).toFixed(2)}ms`);
    console.log(`  💾 内存(父进程): 峰值 RSS +${peakDiff.rss.toFixed(2)}MB, 峰值 Heap +${peakDiff.heapUsed.toFixed(2)}MB`);
    console.log(`  💾 内存(父进程): 结束 RSS +${endDiff.rss.toFixed(2)}MB, 结束 Heap +${endDiff.heapUsed.toFixed(2)}MB\n`);
    
    return {
      searchTimeMs: mem.durationMs,
      fileCount,
      peakDiff,
      endDiff,
    };
  } catch (error) {
    console.error(`  ❌ 测试失败:`, error.message);
    return null;
  }
}

/**
 * 运行所有测试
 */
async function runAllTests() {
  console.log(`🔬 ${runtime} 子进程性能测试报告`);
  console.log('='.repeat(50));
  console.log(
    `⚙️  配置: iterations=${CONFIG.iterations}, warmup=${CONFIG.warmupIterations}, concurrency=${CONFIG.concurrency}, largeOutputLines=${CONFIG.largeOutputLines}\n`
  );
  
  const results = {};
  
  // 运行所有测试
  results.simpleCommand = await testSimpleCommandSpeed();
  results.largeOutput = await testLargeOutputHandling();
  results.concurrent = await testConcurrentProcesses();
  results.fileSearch = await testFileSearchPerformance();
  
  // 生成总结报告
  console.log('📊 测试总结:');
  console.log('='.repeat(30));
  console.log(`🚀 运行时: ${runtime}`);
  
  if (results.simpleCommand) {
    console.log(
      `⚡ 启动速度(均值/中位/P95): ${results.simpleCommand.summary.mean.toFixed(2)}/${results.simpleCommand.summary.median.toFixed(
        2
      )}/${results.simpleCommand.summary.p95.toFixed(2)} ms`
    );
  }
  
  if (results.concurrent) {
    console.log(`🔄 并发处理能力: ${results.concurrent.avgTimePerProcessMs.toFixed(2)}ms/进程`);
  }
  
  if (results.fileSearch) {
    console.log(
      `🔍 文件搜索效率: ${(results.fileSearch.searchTimeMs / Math.max(results.fileSearch.fileCount, 1)).toFixed(2)}ms/文件`
    );
  }

  console.log(`💾 内存口径: 父进程采样峰值/结束值 (非子进程内存)`);
  console.log('\n✅ 测试完成!');
  
  return results;
}

// 运行测试
runAllTests().catch(console.error);
