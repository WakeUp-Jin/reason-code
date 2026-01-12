/**
 * fs.statSync() 性能测试（跨运行时对比）
 *
 * 运行方式：
 * - Bun:     bun run packages/core/src/core/tool/__tests__/stat-performance.test.cjs
 * - Node.js: node packages/core/src/core/tool/__tests__/stat-performance.test.cjs
 *
 * 注意：
 * - 单次运行内无法“同时”测试 Node 与 Bun 运行时；需要分别用 Node 和 Bun 各跑一次再对比输出。
 * - 在 Bun 里 require('fs') 是 Bun 的 Node 兼容层实现，不是 Node.js 本体。
 */

const { statSync, readdirSync } = require('fs');
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

/**
 * 获取测试文件列表
 */
function getTestFiles(count = 1000) {
  const cwd = process.cwd();
  const files = [];
  
  // 收集项目中的真实文件
  const collectFiles = (dir, depth = 0) => {
    if (depth > 3 || files.length >= count) return;
    
    try {
      const entries = readdirSync(dir, { withFileTypes: true });
      
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
          collectFiles(fullPath, depth + 1);
        }
      }
    } catch (err) {
      // 忽略权限错误
    }
  };
  
  collectFiles(cwd);
  return files.slice(0, count);
}

/**
 * 测试 fs.statSync()
 */
function statSyncOnce(files) {
  const start = performance.now();
  
  for (const file of files) {
    try {
      statSync(file);
    } catch (err) {
      // 忽略错误
    }
  }
  
  const end = performance.now();
  return end - start;
}

/**
 * 主测试函数
 */
async function runPerformanceTest() {
  const runtime = detectRuntime();
  const runs = getArgNumber('--runs', 7);
  const warmupRuns = getArgNumber('--warmup', 2);

  console.log('\nfs.statSync() 性能测试（跨运行时对比）\n');
  console.log(`运行时: ${runtime}`);
  console.log(`Node 版本: ${process.versions?.node ?? 'unknown'}`);
  if (runtime === 'bun') console.log(`Bun 版本: ${Bun.version}`);
  console.log(`参数: --warmup=${warmupRuns} --runs=${runs}\n`);
  
  // 获取测试文件
  const fileCounts = [100, 500, 1000];
  
  for (const count of fileCounts) {
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`📁 测试 ${count} 个文件\n`);
    
    const files = getTestFiles(count);
    console.log(`   实际文件数: ${files.length}`);
    
    if (files.length === 0) {
      console.log('   ⚠️  没有找到测试文件，跳过');
      continue;
    }

    for (let i = 0; i < warmupRuns; i++) statSyncOnce(files);
    
    console.log('\n   🟦 测试 fs.statSync()...');
    const samples = [];
    for (let i = 0; i < runs; i++) samples.push(statSyncOnce(files));
    const med = median(samples);
    const avg = med / files.length;
    console.log(`      中位数: ${med.toFixed(2)}ms (${runs} 次)`);
    console.log(`      平均:   ${avg.toFixed(3)}ms/文件`);
    console.log(`      JSON:   ${JSON.stringify({ runtime, api: 'fs.statSync', count: files.length, warmupRuns, runs, medianMs: Number(med.toFixed(3)) })}`);
  }
  
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  // 总结
  console.log('说明:\n');
  console.log('  - 要对比 Node vs Bun，请分别用 Node 与 Bun 各运行一次此脚本，对比上面的 JSON 行。');
  console.log('  - 结果会受操作系统页缓存、磁盘类型、后台负载影响；建议多跑几次取中位数。\n');
}

// 运行测试
runPerformanceTest().catch(console.error);
