/**
 * 通用测试数据集
 * 包含 Agent 的测试用例
 */
import { TestCase } from './types.js';

/**
 * Agent 测试用例
 */
export const SIMPLE_AGENT_TESTS: TestCase[] = [
  // S1. 单工具测试 - 列出文件
  {
    id: 'S1',
    description: '单工具调用 - 列出当前目录文件',
    input: '列出当前目录下的所有文件和文件夹',
    expected: {
      agents: ['eval_agent'],
      tools: { eval_agent: ['list_files'] },
    },
  },

  // S2. 多工具测试 - 先列出再读取
  {
    id: 'S2',
    description: '多工具调用 - 列出文件后读取',
    input: '先列出当前目录的文件，然后读取 README.md 的内容',
    expected: {
      agents: ['eval_agent'],
      tools: { eval_agent: ['list_files', 'read_file'] },
    },
  },
];

/**
 * 所有测试用例
 */
export const TEST_CASES: TestCase[] = [...SIMPLE_AGENT_TESTS];

/**
 * 根据ID获取测试用例
 */
export function getTestById(id: string): TestCase | undefined {
  return TEST_CASES.find((test) => test.id === id);
}

/**
 * 获取 Agent 测试用例
 */
export function getSimpleAgentTests(): TestCase[] {
  return SIMPLE_AGENT_TESTS;
}
