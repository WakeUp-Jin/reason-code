#!/usr/bin/env bun

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { agentManager } from '@reason-code/core';

const program = new Command();

program.name('reason').description('AI Agent CLI powered by Reason').version('0.0.1');

// 默认命令：启动 TUI
program
  .command('tui', { isDefault: true })
  .description('Start the interactive TUI interface')
  .action(async () => {
    const { startTUI } = await import('./app.js');
    await startTUI();
  });

program
  .command('chat')
  .description('Start a chat session with the AI agent')
  .argument('[message]', 'message to send to the agent')
  .action(async (message?: string) => {
    console.log(chalk.green('🤖 Reason Agent started!\n'));

    // 配置 AgentManager
    agentManager.configure({
      apiKey: process.env.DEEPSEEK_API_KEY,
    });

    // 创建 Agent
    const agent = agentManager.createAgent('build');

    // 初始化 Agent
    const initSpinner = ora('Initializing agent...').start();
    try {
      await agent.init();
      initSpinner.succeed('Agent initialized');
    } catch (error) {
      initSpinner.fail('Failed to initialize agent');
      console.error(chalk.red('Error: ') + (error as Error).message);
      process.exit(1);
    }

    // 如果提供了消息，直接处理
    if (message) {
      const spinner = ora('Thinking...').start();

      try {
        const result = await agent.run(message);
        spinner.stop();
        if (result.success) {
          console.log(chalk.blue('Agent: ') + result.finalResponse);
        } else {
          console.error(chalk.red('Error: ') + result.error);
        }
      } catch (error) {
        spinner.stop();
        console.error(chalk.red('Error: ') + (error as Error).message);
        process.exit(1);
      }
    } else {
      console.log(chalk.yellow('Interactive mode not yet implemented.'));
      console.log(chalk.gray('Usage: reason chat "your message here"'));
    }
  });

program
  .command('info')
  .description('Show information about the Reason CLI')
  .action(() => {
    console.log(chalk.bold('\n📦 Reason CLI'));
    console.log(chalk.gray('─'.repeat(50)));
    console.log(chalk.cyan('Version: ') + '0.0.1');
    console.log(chalk.cyan('Architecture: ') + 'Monorepo + Core/CLI');
    console.log(chalk.cyan('Package Manager: ') + 'Bun');
    console.log(chalk.cyan('Build System: ') + 'Turbo');
    console.log(chalk.gray('─'.repeat(50)));
    console.log(chalk.green('\nCore Features:'));
    console.log(chalk.gray('  • Agent Engine'));
    console.log(chalk.gray('  • LLM Interface'));
    console.log(chalk.gray('  • Tool System'));
    console.log(chalk.gray('  • Interactive TUI'));
    console.log('');
  });

// 解析命令行参数
program.parse();
