#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

function exitWithCode(code) {
  if (typeof code === 'number') process.exit(code);
  process.exit(0);
}

function run(command, args) {
  const child = spawn(command, args, { stdio: 'inherit' });

  child.on('exit', exitWithCode);
  child.on('error', (err) => {
    if (err && err.code === 'ENOENT' && command === 'bun') {
      console.error('[reason] bun not found in PATH.');
      console.error('[reason] Either install Bun, or build the CLI so dist exists.');
      console.error('[reason] Try: bun run --cwd packages/cli build');
      process.exit(1);
    }

    console.error(err?.message || String(err));
    process.exit(1);
  });
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
  // 使用 --no-deprecation 禁用弃用警告（如 punycode DEP0040）
  run(process.execPath, ['--no-deprecation', distEntry, ...args]);
} else {
  const bunArgs = [];
  if (hasWatchFlag) bunArgs.push('--watch');
  bunArgs.push('run', srcEntry, ...args);
  run('bun', bunArgs);
}
