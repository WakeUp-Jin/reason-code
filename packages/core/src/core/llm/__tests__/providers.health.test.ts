/**
 * LLM 供应商健康检查测试
 *
 * 这个测试文件用于验证 LLM 供应商是否能正常响应。
 * 会发送真实的 API 请求，因此：
 * - 需要配置有效的 API Key
 * - 会产生实际的 API 费用（虽然很少）
 * - 在 vitest.config.ts 中被排除，不会在日常 `pnpm test` 中运行
 *
 * 运行方式：
 * - pnpm test:health
 * - vitest run providers.health.test.ts
 */

import { describe, it, expect } from 'vitest';
import { createLLMService } from '../factory.js';

describe('LLM 供应商健康检查', () => {
  const TEST_PROMPT = '你好，你可以做什么？请用一句话简短回答。';
  const TIMEOUT = 30000; // 30s 超时

  describe('DeepSeek', () => {
    it(
      'DeepSeek 应该能正常响应',
      async () => {
        const service = await createLLMService({
          provider: 'deepseek',
          model: 'deepseek-chat',
        });

        const startTime = Date.now();
        const response = await service.simpleChat(TEST_PROMPT);
        const latency = Date.now() - startTime;

        console.log(`[DeepSeek] 响应时间: ${latency}ms`);
        console.log(`[DeepSeek] 响应内容: ${response.slice(0, 100)}...`);

        expect(response).toBeTruthy();
        expect(response.length).toBeGreaterThan(0);
      },
      TIMEOUT
    );

    it(
      'DeepSeek 应该能处理简单的 complete 调用',
      async () => {
        const service = await createLLMService({
          provider: 'deepseek',
          model: 'deepseek-chat',
        });

        const response = await service.complete([{ role: 'user', content: 'Hi' }]);

        expect(response).toBeDefined();
        expect(response.content).toBeTruthy();
        expect(response.finishReason).toBeDefined();
      },
      TIMEOUT
    );
  });

  describe('OpenRouter', () => {
    it(
      'OpenRouter 应该能正常响应',
      async () => {
        const service = await createLLMService({
          provider: 'openrouter',
          model: 'openai/gpt-3.5-turbo', // 使用便宜的模型测试
        });

        const startTime = Date.now();
        const response = await service.simpleChat(TEST_PROMPT);
        const latency = Date.now() - startTime;

        console.log(`[OpenRouter] 响应时间: ${latency}ms`);
        console.log(`[OpenRouter] 响应内容: ${response.slice(0, 100)}...`);

        expect(response).toBeTruthy();
        expect(response.length).toBeGreaterThan(0);
      },
      TIMEOUT
    );

    it(
      'OpenRouter 应该能处理简单的 complete 调用',
      async () => {
        const service = await createLLMService({
          provider: 'openrouter',
          model: 'openai/gpt-3.5-turbo',
        });

        const response = await service.complete([{ role: 'user', content: 'Hi' }]);

        expect(response).toBeDefined();
        expect(response.content).toBeTruthy();
        expect(response.finishReason).toBeDefined();
      },
      TIMEOUT
    );
  });

  describe('服务配置验证', () => {
    it(
      'DeepSeek 服务应该返回正确的配置',
      async () => {
        const service = await createLLMService({
          provider: 'deepseek',
          model: 'deepseek-chat',
        });

        const config = service.getConfig();
        expect(config.provider).toBe('deepseek');
        expect(config.model).toBe('deepseek-chat');
      },
      TIMEOUT
    );

    it(
      'OpenRouter 服务应该返回正确的配置',
      async () => {
        const service = await createLLMService({
          provider: 'openrouter',
          model: 'openai/gpt-3.5-turbo',
        });

        const config = service.getConfig();
        expect(config.provider).toBe('openrouter');
        expect(config.model).toBe('openai/gpt-3.5-turbo');
      },
      TIMEOUT
    );
  });
});
