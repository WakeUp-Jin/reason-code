#!/usr/bin/env bun
'use strict';

const fs = require('node:fs');
const path = require('node:path');

function exitWithCode(code) {
  if (typeof code === 'number') process.exit(code);
  process.exit(0);
}

function runBun(args) {
  // Bun-only：入口脚本本身就由 bun 执行，这里统一用 bun 启动 dist/src
  // @ts-ignore - Bun 全局变量
  const result = Bun.spawnSync(['bun', ...args], {
    stdin: 'inherit',
    stdout: 'inherit',
    stderr: 'inherit',
  });

  exitWithCode(result.exitCode);
}

const rawArgs = process.argv.slice(2);

const hasDevFlag = rawArgs.includes('--dev');
const hasWatchFlag = rawArgs.includes('--watch');
const forceDev =
  hasWatchFlag || hasDevFlag || process.env.REASON_DEV === '1' || process.env.REASON_DEV === 'true';

const args = rawArgs.filter((arg) => arg !== '--dev' && arg !== '--watch');

const packageRoot = path.resolve(__dirname, '..');
const distEntry = path.join(packageRoot, 'dist', 'index.js');
const srcEntry = path.join(packageRoot, 'src', 'index.ts');

if (!forceDev && fs.existsSync(distEntry)) {
  runBun([distEntry, ...args]);
} else {
  const bunArgs = [];
  if (hasWatchFlag) bunArgs.push('--watch');
  bunArgs.push(srcEntry, ...args);
  runBun(bunArgs);
}
