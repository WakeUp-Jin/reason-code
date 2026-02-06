/**
 * 评估模块使用示例
 * 展示如何使用 Agent 进行测试
 */
import { eventBus } from './EventBus.js';
import { evaluate, formatResult } from './evaluate.js';
import { TEST_CASES, getTestById, getSimpleAgentTests } from './dataset.js';
import { TestCase, EvaluateResult } from './types.js';
import { agentManager, Agent, buildAgent } from '../core/agent/index.js';

// 缓存 Agent 实例
let agent: Agent | null = null;

/**
 * 获取 Agent 实例（延迟初始化）
 * 模型配置由 ConfigService 管理，LLM 服务由 LLMServiceRegistry 提供
 */
async function getAgent(): Promise<Agent> {
  if (!agent) {
    // 创建 Agent（模型配置已由 ConfigService 管理）
    agent = agentManager.createAgent('build');
    await agent.init();
  }
  return agent;
}

/**
 * 运行单个测试用例
 */
async function runTest(testCase: TestCase): Promise<EvaluateResult | null> {
  console.log(`\n${'='.repeat(50)}`);
  console.log(`🧪 测试: ${testCase.id} - ${testCase.description}`);
  console.log(`${'='.repeat(50)}`);

  const startTime = Date.now();

  try {
    const agentInstance = await getAgent();
    const result = await agentInstance.run(testCase.input, {
      sessionId: `eval-${testCase.id}-${Date.now()}`,
    });

    const { agents, tools, finalResponse, success, error } = result;

    // 评估
    const evalResult = evaluate(testCase, {
      agents,
      tools,
      editResult: null,
    });

    // 输出结果
    const status = evalResult.passed ? '✅ PASS' : '❌ FAIL';
    const time = Date.now() - startTime;
    console.log(`\n${status} (${time}ms)`);
    console.log(formatResult(evalResult));

    const responsePreview = finalResponse.slice(0, 200);
    console.log(`\n📝 Agent回复: ${responsePreview}${finalResponse.length > 200 ? '...' : ''}`);

    if (!success) {
      console.log(`\n⚠️ Agent 执行失败: ${error}`);
    }

    return evalResult;
  } catch (err) {
    console.error(`❌ 执行失败:`, err);
    return null;
  }
}

/**
 * 运行测试集
 */
async function runTests(testCases: TestCase[], title: string) {
  console.log(`\n${'#'.repeat(60)}`);
  console.log(`# ${title}: ${testCases.length} 个用例`);
  console.log(`${'#'.repeat(60)}`);

  const results: Array<{ testCase: TestCase; result: EvaluateResult }> = [];
  const startTime = Date.now();

  for (const testCase of testCases) {
    const result = await runTest(testCase);
    if (result) {
      results.push({ testCase, result });
    }
  }

  // 汇总
  const passed = results.filter((r) => r.result.passed).length;
  const failed = results.length - passed;
  const totalTime = Date.now() - startTime;

  console.log(`\n${'='.repeat(60)}`);
  console.log(`${title} 完成`);
  console.log(`${'='.repeat(60)}`);
  console.log(`总数: ${results.length}`);
  console.log(`✅ 通过: ${passed}`);
  console.log(`❌ 失败: ${failed}`);
  console.log(`⏱️  耗时: ${(totalTime / 1000).toFixed(2)}s`);

  return results;
}

/**
 * 运行所有测试用例
 */
async function runAllTests() {
  console.log(`\n${'#'.repeat(60)}`);
  console.log(`# 开始全量测试: ${TEST_CASES.length} 个用例`);
  console.log(`${'#'.repeat(60)}`);

  const startTime = Date.now();

  // 运行测试
  const results = await runTests(getSimpleAgentTests(), 'Agent 测试');

  // 总汇总
  const passed = results.filter((r) => r.result.passed).length;
  const failed = results.length - passed;
  const totalTime = Date.now() - startTime;

  console.log(`\n${'#'.repeat(60)}`);
  console.log(`# 全部测试完成`);
  console.log(`${'#'.repeat(60)}`);
  console.log(`总数: ${results.length}`);
  console.log(`✅ 通过: ${passed}`);
  console.log(`❌ 失败: ${failed}`);
  console.log(`⏱️  总耗时: ${(totalTime / 1000).toFixed(2)}s`);
}

/**
 * 打印帮助信息
 */
function printHelp() {
  console.log(`
评估模块使用说明:

  npx ts-node example.ts [选项]

选项:
  --help                显示帮助信息
  --test <id>           运行指定测试用例 (如: S1, S2)
  (无参数)              运行所有测试用例

测试用例 ID:
  S1, S2                Agent 测试
`);
}

/**
 * 主函数
 */
async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help')) {
    printHelp();
  } else if (args.includes('--test') && args[args.indexOf('--test') + 1]) {
    // 运行指定测试用例
    const testId = args[args.indexOf('--test') + 1];
    const testCase = getTestById(testId);
    if (testCase) {
      await runTest(testCase);
    } else {
      console.error(`未找到测试用例: ${testId}`);
      console.log('可用的测试用例 ID: S1, S2');
    }
  } else {
    // 运行所有测试
    await runAllTests();
  }
}

// 运行
main().catch(console.error);
