#!/usr/bin/env node

const { performance } = require('perf_hooks');
const { spawn } = require('child_process');
const { ProcessManager } = require('../implementation.js');

/**
 * 性能基准测试套件
 */
class PerformanceBenchmark {
  constructor() {
    this.processManager = new ProcessManager();
    this.results = {};
  }

  /**
   * 运行所有基准测试
   */
  async runAll() {
    console.log('🚀 开始性能基准测试...\n');
    
    await this.testStartupTime();
    await this.testSpawnPerformance();
    await this.testMemoryUsage();
    await this.testSearchPerformance();
    
    this.printResults();
  }

  /**
   * 测试启动时间
   */
  async testStartupTime() {
    console.log('📊 测试启动时间...');
    
    const iterations = 10;
    const times = [];
    
    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      
      // 模拟启动过程
      const proc = this.processManager.createProcess('echo', ['hello']);
      await this.waitForProcess(proc);
      
      const end = performance.now();
      times.push(end - start);
    }
    
    const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
    this.results.startupTime = {
      average: avgTime.toFixed(2),
      samples: times.length
    };
    
    console.log(`   平均启动时间: ${avgTime.toFixed(2)}ms\n`);
  }

  /**
   * 测试子进程创建性能
   */
  async testSpawnPerformance() {
    console.log('📊 测试子进程创建性能...');
    
    const duration = 5000; // 5秒测试
    const startTime = performance.now();
    let count = 0;
    
    while (performance.now() - startTime < duration) {
      const proc = this.processManager.createProcess('echo', ['test']);
      await this.waitForProcess(proc);
      count++;
    }
    
    const actualDuration = performance.now() - startTime;
    const opsPerSecond = Math.round((count * 1000) / actualDuration);
    
    this.results.spawnPerformance = {
      opsPerSecond,
      totalOps: count,
      duration: actualDuration.toFixed(2)
    };
    
    console.log(`   子进程创建: ${opsPerSecond} ops/sec\n`);
  }

  /**
   * 测试内存使用情况
   */
  async testMemoryUsage() {
    console.log('📊 测试内存使用情况...');
    
    const initialMemory = process.memoryUsage();
    
    // 创建多个进程来测试内存使用
    const processes = [];
    for (let i = 0; i < 50; i++) {
      const proc = this.processManager.createProcess('sleep', ['0.1']);
      processes.push(proc);
    }
    
    // 等待所有进程完成
    await Promise.all(processes.map(proc => this.waitForProcess(proc)));
    
    const finalMemory = process.memoryUsage();
    const memoryDiff = {
      rss: finalMemory.rss - initialMemory.rss,
      heapUsed: finalMemory.heapUsed - initialMemory.heapUsed,
      external: finalMemory.external - initialMemory.external
    };
    
    this.results.memoryUsage = {
      initial: this.formatMemory(initialMemory),
      final: this.formatMemory(finalMemory),
      diff: this.formatMemory(memoryDiff)
    };
    
    console.log(`   内存使用: ${this.formatBytes(finalMemory.rss)}\n`);
  }

  /**
   * 测试搜索性能
   */
  async testSearchPerformance() {
    console.log('📊 测试搜索性能...');
    
    const searchTimes = [];
    const iterations = 20;
    
    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      
      const proc = this.processManager.createProcess('rg', [
        'function',
        '--type', 'js',
        '--max-count', '100',
        '.'
      ]);
      
      await this.waitForProcess(proc);
      
      const end = performance.now();
      searchTimes.push(end - start);
    }
    
    const avgSearchTime = searchTimes.reduce((a, b) => a + b, 0) / searchTimes.length;
    
    this.results.searchPerformance = {
      average: avgSearchTime.toFixed(2),
      min: Math.min(...searchTimes).toFixed(2),
      max: Math.max(...searchTimes).toFixed(2),
      samples: iterations
    };
    
    console.log(`   平均搜索时间: ${avgSearchTime.toFixed(2)}ms\n`);
  }

  /**
   * 等待进程完成
   */
  async waitForProcess(proc) {
    return new Promise((resolve, reject) => {
      if (this.processManager.runtime === 'bun') {
        // Bun 进程处理
        proc.exited.then(resolve).catch(reject);
      } else {
        // Node.js/Deno 进程处理
        proc.on('close', resolve);
        proc.on('error', reject);
      }
    });
  }

  /**
   * 格式化内存信息
   */
  formatMemory(memory) {
    return {
      rss: this.formatBytes(memory.rss),
      heapUsed: this.formatBytes(memory.heapUsed),
      external: this.formatBytes(memory.external)
    };
  }

  /**
   * 格式化字节数
   */
  formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * 打印测试结果
   */
  printResults() {
    console.log('📋 测试结果汇总');
    console.log('='.repeat(50));
    console.log(`运行时环境: ${this.processManager.runtime}`);
    console.log(`启动时间: ${this.results.startupTime.average}ms`);
    console.log(`子进程性能: ${this.results.spawnPerformance.opsPerSecond} ops/sec`);
    console.log(`内存使用: ${this.results.memoryUsage.final.rss}`);
    console.log(`搜索性能: ${this.results.searchPerformance.average}ms`);
    
    // 性能建议
    console.log('\n💡 性能建议:');
    const recommendations = this.getPerformanceRecommendations();
    recommendations.forEach(rec => console.log(`   ${rec}`));
  }

  /**
   * 获取性能建议
   */
  getPerformanceRecommendations() {
    const runtime = this.processManager.runtime;
    const spawnOps = this.results.spawnPerformance.opsPerSecond;
    
    const recommendations = [];
    
    if (runtime === 'node' && spawnOps < 1000) {
      recommendations.push('🚀 考虑升级到 Bun 以获得 3-5x 性能提升');
      recommendations.push('⚡ 或使用进程池来减少 spawn 开销');
    }
    
    if (runtime === 'bun') {
      recommendations.push('✅ 已使用最优运行时环境');
      recommendations.push('🎯 当前配置可获得最佳性能');
    }
    
    if (this.results.memoryUsage.final.rss > '100 MB') {
      recommendations.push('💾 考虑优化内存使用或增加进程回收');
    }
    
    return recommendations;
  }
}

/**
 * 比较测试 - 在不同运行时下运行相同测试
 */
async function runComparison() {
  console.log('🔄 运行时对比测试\n');
  
  const runtimes = ['node', 'bun', 'deno'];
  const results = {};
  
  for (const runtime of runtimes) {
    try {
      console.log(`测试 ${runtime}...`);
      const result = await runBenchmarkInRuntime(runtime);
      results[runtime] = result;
    } catch (error) {
      console.log(`${runtime} 不可用: ${error.message}`);
    }
  }
  
  printComparison(results);
}

/**
 * 在指定运行时中运行基准测试
 */
async function runBenchmarkInRuntime(runtime) {
  return new Promise((resolve, reject) => {
    const proc = spawn(runtime, [__filename, '--single'], {
      stdio: 'pipe'
    });
    
    let output = '';
    proc.stdout.on('data', data => output += data);
    proc.on('close', code => {
      if (code === 0) {
        try {
          resolve(JSON.parse(output));
        } catch (e) {
          reject(new Error('Failed to parse output'));
        }
      } else {
        reject(new Error(`Process exited with code ${code}`));
      }
    });
  });
}

/**
 * 打印对比结果
 */
function printComparison(results) {
  console.log('\n📊 运行时性能对比');
  console.log('='.repeat(60));
  
  const metrics = ['startupTime', 'spawnPerformance', 'searchPerformance'];
  
  metrics.forEach(metric => {
    console.log(`\n${metric}:`);
    Object.entries(results).forEach(([runtime, data]) => {
      if (data[metric]) {
        const value = data[metric].average || data[metric].opsPerSecond;
        console.log(`  ${runtime}: ${value}`);
      }
    });
  });
}

// 主函数
async function main() {
  const args = process.argv.slice(2);
  
  if (args.includes('--single')) {
    // 单次测试模式（用于对比）
    const benchmark = new PerformanceBenchmark();
    await benchmark.runAll();
    console.log(JSON.stringify(benchmark.results));
  } else if (args.includes('--compare')) {
    // 对比测试模式
    await runComparison();
  } else {
    // 默认模式
    const benchmark = new PerformanceBenchmark();
    await benchmark.runAll();
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  main().catch(console.error);
}

module.exports = { PerformanceBenchmark };
