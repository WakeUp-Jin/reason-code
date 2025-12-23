#!/usr/bin/env node

import { Command } from 'commander'
import chalk from 'chalk'
import ora from 'ora'
import { Agent, MockLLM } from '@reason-cli/core'

const program = new Command()

program
  .name('reason')
  .description('AI Agent CLI powered by Reason')
  .version('0.0.1')

program
  .command('chat')
  .description('Start a chat session with the AI agent')
  .argument('[message]', 'message to send to the agent')
  .action(async (message?: string) => {
    console.log(chalk.green('🤖 Reason Agent started!\n'))

    // 创建 Agent 实例
    const agent = new Agent({
      llm: new MockLLM(),
      systemPrompt: 'You are a helpful AI assistant.',
    })

    // 如果提供了消息，直接处理
    if (message) {
      const spinner = ora('Thinking...').start()

      try {
        const response = await agent.run(message)
        spinner.stop()
        console.log(chalk.blue('Agent: ') + response)
      } catch (error) {
        spinner.stop()
        console.error(chalk.red('Error: ') + (error as Error).message)
        process.exit(1)
      }
    } else {
      console.log(chalk.yellow('Interactive mode not yet implemented.'))
      console.log(chalk.gray('Usage: reason chat "your message here"'))
    }
  })

program
  .command('info')
  .description('Show information about the Reason CLI')
  .action(() => {
    console.log(chalk.bold('\n📦 Reason CLI'))
    console.log(chalk.gray('─'.repeat(50)))
    console.log(chalk.cyan('Version: ') + '0.0.1')
    console.log(chalk.cyan('Architecture: ') + 'Monorepo + Core/CLI')
    console.log(chalk.cyan('Package Manager: ') + 'Bun')
    console.log(chalk.cyan('Build System: ') + 'Turbo')
    console.log(chalk.gray('─'.repeat(50)))
    console.log(chalk.green('\nCore Features:'))
    console.log(chalk.gray('  • Agent Engine'))
    console.log(chalk.gray('  • LLM Interface'))
    console.log(chalk.gray('  • Tool System'))
    console.log('')
  })

// 解析命令行参数
program.parse()
