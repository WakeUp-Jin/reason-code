/**
 * Grep 四种策略性能对比（ripgrep / git grep / system grep / JavaScript）
 *
 * 这是一个可直接运行的 benchmark 脚本（不会被 vitest 默认收集，因为不是 *.test.ts）。
 *
 * 运行方式：
 * - Bun:     bun run --cwd packages/core src/core/tool/__tests__/grep-strategies-performance.bench.ts
 * - Node.js: node --import tsx packages/core/src/core/tool/__tests__/grep-strategies-performance.bench.ts
 *
 * 参数：
 * - --cwd=packages/core          搜索目录（默认：packages/core）
 * - --pattern=import             正则模式（默认：import；ripgrep 默认区分大小写）
 * - --include=**\\/*.ts          文件过滤（默认：**\\/*.ts；按各策略的 include 语义透传；可留空）
 * - --limit=100                  结果截断上限（仅影响返回数组长度；底层命令仍可能扫描全量）
 * - --warmup=1                   预热次数（默认 1）
 * - --runs=5                     采样次数（默认 5）
 *
 * 注意：
 * - ripgrep 策略这里不会触发自动下载（binDir=undefined）；系统未安装 rg 时会自动跳过。
 * - git-grep 需要在 git 仓库内运行；否则会跳过。
 */

import { performance } from 'node:perf_hooks';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { GrepStrategyOptions } from '../Grep/types.js';
import {
  grepWithGit,
  grepWithJavaScript,
  grepWithRipgrep,
  grepWithSystemGrep,
} from '../Grep/strategies/index.js';

type BenchResult = {
  strategy: string;
  ms: number;
  matchCount: number;
};

function getArgString(name: string, fallback: string): string {
  const prefix = `${name}=`;
  for (const arg of process.argv.slice(2)) {
    if (arg === `--${name}`) return '1';
    if (arg.startsWith(`--${prefix}`)) return arg.slice(`--${prefix}`.length);
  }
  return fallback;
}

function getArgNumber(name: string, fallback: number): number {
  const raw = getArgString(name, '');
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

type Lang = 'zh' | 'en';

function getLang(): Lang {
  const raw = getArgString('lang', 'zh').toLowerCase();
  return raw === 'en' ? 'en' : 'zh';
}

function t(lang: Lang, zh: string, en: string): string {
  return lang === 'zh' ? zh : en;
}

function strategyLabel(lang: Lang, name: string): string {
  if (lang === 'en') return name;
  switch (name) {
    case 'ripgrep':
      return 'ripgrep（rg）';
    case 'git-grep':
      return 'git grep';
    case 'system-grep':
      return '系统 grep';
    case 'javascript':
      return 'JavaScript';
    default:
      return name;
  }
}

function printHelp(lang: Lang): void {
  // eslint-disable-next-line no-console
  console.log(`
${t(lang, '用法', 'Usage')}:
  bun run --cwd packages/core src/core/tool/__tests__/grep-strategies-performance.bench.ts [args]
  node --import tsx packages/core/src/core/tool/__tests__/grep-strategies-performance.bench.ts [args]

${t(lang, '参数', 'Args')}:
  --cwd=...        ${t(lang, '默认', 'default')}: packages/core
  --pattern=...    ${t(lang, '默认', 'default')}: import
  --include=...    ${t(lang, '默认', 'default')}: **/*.ts
  --limit=...      ${t(lang, '默认', 'default')}: 100
  --warmup=...     ${t(lang, '默认', 'default')}: 1
  --runs=...       ${t(lang, '默认', 'default')}: 5
  --lang=zh|en     ${t(lang, '默认', 'default')}: zh
`);
}

async function timeOne(
  strategy: string,
  run: () => Promise<{ matchCount: number }>
): Promise<BenchResult> {
  const start = performance.now();
  const { matchCount } = await run();
  const ms = performance.now() - start;
  return { strategy, ms, matchCount };
}

async function main(): Promise<void> {
  const lang = getLang();
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    printHelp(lang);
    return;
  }

  const here = dirname(fileURLToPath(import.meta.url));
  const packageRoot = resolve(here, '../../../..');

  const cwd = resolve(process.cwd(), getArgString('cwd', packageRoot));
  const pattern = getArgString('pattern', 'import');
  const include = getArgString('include', '**/*.ts');
  const limit = getArgNumber('limit', 100);
  const warmup = getArgNumber('warmup', 1);
  const runs = getArgNumber('runs', 5);

  const options: GrepStrategyOptions = {
    include: include ? include : undefined,
    limit,
    // 关键：不提供 binDir，避免 ripgrep 自动下载，保证 benchmark 离线可跑。
    binDir: undefined,
  };

  const candidates: Array<{
    name: string;
    run: () => Promise<{ matchCount: number }>;
  }> = [
    {
      name: 'ripgrep',
      run: async () => ({ matchCount: (await grepWithRipgrep(pattern, cwd, options)).length }),
    },
    {
      name: 'git-grep',
      run: async () => ({ matchCount: (await grepWithGit(pattern, cwd, options)).length }),
    },
    {
      name: 'system-grep',
      run: async () => ({ matchCount: (await grepWithSystemGrep(pattern, cwd, options)).length }),
    },
    {
      name: 'javascript',
      run: async () => ({ matchCount: (await grepWithJavaScript(pattern, cwd, options)).length }),
    },
  ];

  // eslint-disable-next-line no-console
  console.log(
    [
      `${t(lang, '运行时', 'Runtime')}: ${
        typeof Bun !== 'undefined' ? `bun ${Bun.version}` : `node ${process.version}`
      }`,
      `${t(lang, '平台', 'Platform')}: ${process.platform} ${process.arch}`,
      `${t(lang, '搜索目录', 'CWD')}: ${cwd}`,
      `${t(lang, '搜索模式', 'Pattern')}: ${pattern}`,
      `${t(lang, '文件过滤', 'Include')}: ${options.include ?? t(lang, '(无)', '(none)')}`,
      `${t(lang, '预热/采样', 'Warmup/Runs')}: ${warmup}/${runs}`,
      '',
    ].join('\n')
  );

  const available: typeof candidates = [];
  for (const item of candidates) {
    try {
      const probe = await timeOne(item.name, item.run);
      // eslint-disable-next-line no-console
      console.log(
        `[${t(lang, '探测', 'probe')}] ${strategyLabel(lang, probe.strategy)}: ${probe.ms.toFixed(
          2
        )}ms, ${t(lang, '匹配数', 'matches')}=${probe.matchCount}`
      );
      available.push(item);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // eslint-disable-next-line no-console
      console.log(`[${t(lang, '跳过', 'skip')}]  ${strategyLabel(lang, item.name)}: ${message}`);
    }
  }

  if (available.length === 0) {
    // eslint-disable-next-line no-console
    console.log(t(lang, '没有可用的策略。', 'No strategies available.'));
    return;
  }

  // Warmup（probe 已经跑过一次，这里再额外跑 warmup-1 轮）
  for (let i = 1; i < warmup; i++) {
    for (const item of available) {
      try {
        await item.run();
      } catch {
        // ignore warmup failures
      }
    }
  }

  const timings = new Map<string, number[]>();
  const lastCounts = new Map<string, number>();
  for (const item of available) timings.set(item.name, []);

  for (let runIndex = 0; runIndex < runs; runIndex++) {
    // 轮换执行顺序，减少“后执行策略更受缓存影响”的偏差
    const startIndex = runIndex % available.length;
    const round = [...available.slice(startIndex), ...available.slice(0, startIndex)];

    // eslint-disable-next-line no-console
    console.log(
      lang === 'zh' ? `\n[第 ${runIndex + 1}/${runs} 轮]` : `\n[run ${runIndex + 1}/${runs}]`
    );
    for (const item of round) {
      try {
        const result = await timeOne(item.name, item.run);
        timings.get(item.name)?.push(result.ms);
        lastCounts.set(item.name, result.matchCount);
        // eslint-disable-next-line no-console
        console.log(
          `  ${strategyLabel(lang, result.strategy)}: ${result.ms.toFixed(2)}ms, ${t(
            lang,
            '匹配数',
            'matches'
          )}=${result.matchCount}`
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        // eslint-disable-next-line no-console
        console.log(
          `  ${strategyLabel(lang, item.name)}: ${t(lang, '错误', 'ERROR')}: ${message}`
        );
      }
    }
  }

  // eslint-disable-next-line no-console
  console.log(`\n${t(lang, '汇总（中位数 ms）', 'Summary (median ms)')}:`);
  const rows = [...timings.entries()]
    .map(([name, values]) => ({
      name,
      runs: values.length,
      medianMs: values.length ? median(values) : Number.NaN,
      minMs: values.length ? Math.min(...values) : Number.NaN,
      maxMs: values.length ? Math.max(...values) : Number.NaN,
      matches: lastCounts.get(name) ?? 0,
    }))
    .sort((a, b) => a.medianMs - b.medianMs);

  for (const row of rows) {
    // eslint-disable-next-line no-console
    console.log(
      `  ${strategyLabel(lang, row.name)}: ${t(lang, '中位数', 'median')}=${row.medianMs.toFixed(
        2
      )}ms (${t(lang, '最小', 'min')}=${row.minMs.toFixed(2)} ${t(lang, '最大', 'max')}=${row.maxMs.toFixed(
        2
      )} ${t(lang, '次数', 'n')}=${row.runs}) ${t(lang, '匹配数', 'matches')}=${row.matches}`
    );
  }
}

await main();
