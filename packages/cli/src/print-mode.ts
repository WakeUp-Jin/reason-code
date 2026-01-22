/**
 * Print Mode 执行器
 * 用于 `reason -p "prompt"` 命令，执行后直接输出结果到终端
 */

import { agentManager } from '@reason-code/core';
import chalk from 'chalk';
import ora from 'ora';

/**
 * 运行 Print Mode
 * @param prompt - 用户输入的提示词
 */
export async function runPrintMode(prompt: string): Promise<void> {
  // 1. 创建 Agent
  const agent = agentManager.createAgent('build');

  // 2. 初始化 Agent
  const spinner = ora('Initializing...').start();
  try {
    await agent.init({
      promptContext: {
        workingDirectory: process.cwd(),
        modelName: 'default',
      },
    });
  } catch (error) {
    spinner.fail('Failed to initialize agent');
    console.error(chalk.red('Error: ') + (error as Error).message);
    process.exit(1);
  }

  spinner.text = 'Thinking...';

  // 3. 执行 Agent
  // 不提供 onConfirmRequired 回调，ToolScheduler 会自动跳过需要确认的危险操作
  try {
    const result = await agent.run(prompt, {
      sessionId: `print-${Date.now()}`,
      // 不传 onConfirmRequired，危险操作会被跳过
    });

    spinner.stop();

    // 4. 输出结果
    if (result.success) {
      // 直接打印最终响应（纯文本，不做额外渲染）
      console.log(result.finalResponse);
    } else {
      console.error(chalk.red('Error: ') + result.error);
      process.exit(1);
    }
  } catch (error) {
    spinner.stop();
    console.error(chalk.red('Error: ') + (error as Error).message);
    process.exit(1);
  }
}
