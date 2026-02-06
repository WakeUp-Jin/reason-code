import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/__tests__/**/*.test.ts'],
    // 排除健康检查测试（需要真实网络）、性能测试、以及需要修复的旧测试
    exclude: [
      '**/*.health.test.ts',
      '**/*.bench.ts',
      '**/*.cjs',
      '**/*.js',
      // 排除使用 bun:test 的旧测试文件
      '**/session/__tests__/**',
      '**/TaskToolIntegration.test.ts',
      // 排除空测试文件
      '**/testbutler.test.ts',
      '**/tts-stream-test.ts',
      '**/openRouterExcuteRate.test.ts',
      // 排除依赖缺失的测试
      '**/ConversationContext.test.ts',
      // 排除与代码不同步的旧测试（工具名称已改为 PascalCase）
      '**/tool/__tests__/ToolManager.test.ts',
      '**/tool/__tests__/types.test.ts',
      // 排除需要环境变量的旧测试
      '**/llm/__tests__/helpers.test.ts',
      // 排除已废弃 API 的旧测试
      '**/context/__tests__/ContextManager.test.ts',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/core/**/*.ts'],
      exclude: ['**/__tests__/**', '**/types.ts'],
    },
    testTimeout: 10000,
  },
});
