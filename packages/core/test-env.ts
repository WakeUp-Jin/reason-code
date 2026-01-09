/**
 * 测试环境变量加载
 * 运行：DEBUG_ENV=true bun run test-env.ts
 */

import { config } from './src/config/env.js';

console.log('\n✅ 环境变量加载成功！\n');
console.log('=== 配置信息 ===');
console.log('NODE_ENV:', config.nodeEnv);
console.log('LOG_LEVEL:', config.logging.level);
console.log('ENABLE_CONSOLE_LOG:', config.logging.enableConsole);
console.log('DEFAULT_LLM_PROVIDER:', config.defaultProvider);
console.log('DEEPSEEK_API_KEY:', config.llm.deepseek.apiKey ? '已设置 ✅' : '未设置 ⚠️');
console.log('DEEPSEEK_BASE_URL:', config.llm.deepseek.baseURL);
console.log('================\n');
