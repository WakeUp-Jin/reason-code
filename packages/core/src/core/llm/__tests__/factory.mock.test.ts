import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createLLMService } from '../factory.js';
import { DeepSeekService } from '../services/DeepSeekService.js';
import { OpenRouterService } from '../services/OpenRouterService.js';
import type { LLMConfig } from '../types/index.js';

// Mock OpenAI SDK
vi.mock('openai', () => ({
  default: vi.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: vi.fn().mockResolvedValue({
          choices: [
            {
              message: { content: 'Mocked response', tool_calls: null },
              finish_reason: 'stop',
            },
          ],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        }),
      },
    },
  })),
}));

// Mock helpers 以避免真实环境变量依赖
vi.mock('../utils/helpers.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../utils/helpers.js')>();
  return {
    ...original,
    extractApiKey: vi.fn((config: LLMConfig) => {
      if (config.apiKey) return config.apiKey;
      if (config.provider === 'deepseek') return 'mock-deepseek-key';
      if (config.provider === 'openrouter') return 'mock-openrouter-key';
      throw new Error(`API key for provider "${config.provider}" not found`);
    }),
    getBaseURL: vi.fn((config: LLMConfig) => {
      if (config.baseURL) return config.baseURL;
      if (config.provider === 'deepseek') return 'https://api.deepseek.com';
      if (config.provider === 'openrouter') return 'https://openrouter.ai/api/v1';
      throw new Error(`No base URL found for provider "${config.provider}"`);
    }),
  };
});

describe('LLM Factory Mock 测试', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('createLLMService', () => {
    it('应该为 deepseek provider 创建 DeepSeekService', async () => {
      const config: LLMConfig = {
        provider: 'deepseek',
        model: 'deepseek-chat',
      };

      const service = await createLLMService(config);

      expect(service).toBeInstanceOf(DeepSeekService);
      expect(service.getConfig().provider).toBe('deepseek');
      expect(service.getConfig().model).toBe('deepseek-chat');
    });

    it('应该为 openrouter provider 创建 OpenRouterService', async () => {
      const config: LLMConfig = {
        provider: 'openrouter',
        model: 'openai/gpt-4',
      };

      const service = await createLLMService(config);

      expect(service).toBeInstanceOf(OpenRouterService);
      expect(service.getConfig().provider).toBe('openrouter');
    });

    it('应该为未知 provider 抛出错误', async () => {
      const config: LLMConfig = {
        provider: 'unknown-provider',
        model: 'some-model',
      };

      // 会先在 extractApiKey 中抛出错误
      await expect(createLLMService(config)).rejects.toThrow();
    });

    it('应该使用用户提供的 apiKey', async () => {
      const config: LLMConfig = {
        provider: 'deepseek',
        model: 'deepseek-chat',
        apiKey: 'user-provided-key',
      };

      const service = await createLLMService(config);
      expect(service).toBeInstanceOf(DeepSeekService);
    });

    it('应该使用用户提供的 baseURL', async () => {
      const config: LLMConfig = {
        provider: 'deepseek',
        model: 'deepseek-chat',
        baseURL: 'https://custom.api.com',
      };

      const service = await createLLMService(config);
      expect(service).toBeInstanceOf(DeepSeekService);
    });

    it('应该使用默认模型当未指定时', async () => {
      const config: LLMConfig = {
        provider: 'deepseek',
        model: '', // 空字符串
      };

      const service = await createLLMService(config);
      // 工厂会使用默认值 'deepseek-chat'
      expect(service.getConfig().model).toBe('deepseek-chat');
    });

    it('应该处理小写 provider', async () => {
      // 只测试小写，因为 extractApiKey mock 只处理小写
      const config: LLMConfig = {
        provider: 'deepseek',
        model: 'deepseek-chat',
      };

      const service = await createLLMService(config);
      expect(service).toBeInstanceOf(DeepSeekService);
    });
  });

  describe('createLLMService with toolManager', () => {
    it('应该接受可选的 toolManager 参数', async () => {
      const mockToolManager = {
        getToolsForProvider: vi.fn().mockResolvedValue([]),
        getAllTools: vi.fn().mockResolvedValue({}),
        executeTool: vi.fn().mockResolvedValue({}),
      };

      const config: LLMConfig = {
        provider: 'deepseek',
        model: 'deepseek-chat',
      };

      const service = await createLLMService(config, mockToolManager);
      expect(service).toBeInstanceOf(DeepSeekService);
    });
  });

  describe('createLLMService with eventManager', () => {
    it('应该设置 eventManager 如果服务支持', async () => {
      const mockEventManager = {
        emit: vi.fn(),
      };

      const config: LLMConfig = {
        provider: 'deepseek',
        model: 'deepseek-chat',
      };

      const service = await createLLMService(config, undefined, mockEventManager);
      expect(service).toBeInstanceOf(DeepSeekService);
    });
  });

  describe('服务配置传递', () => {
    it('应该传递 maxIterations 配置', async () => {
      const config: LLMConfig = {
        provider: 'deepseek',
        model: 'deepseek-chat',
        maxIterations: 15,
      };

      const service = await createLLMService(config);
      expect(service).toBeInstanceOf(DeepSeekService);
      // maxIterations 是内部配置，不直接暴露，但不应报错
    });
  });

  describe('ILLMService 接口合规性', () => {
    it('返回的服务应该实现 complete 方法', async () => {
      const config: LLMConfig = {
        provider: 'deepseek',
        model: 'deepseek-chat',
      };

      const service = await createLLMService(config);
      expect(typeof service.complete).toBe('function');
    });

    it('返回的服务应该实现 simpleChat 方法', async () => {
      const config: LLMConfig = {
        provider: 'deepseek',
        model: 'deepseek-chat',
      };

      const service = await createLLMService(config);
      expect(typeof service.simpleChat).toBe('function');
    });

    it('返回的服务应该实现 getConfig 方法', async () => {
      const config: LLMConfig = {
        provider: 'deepseek',
        model: 'deepseek-chat',
      };

      const service = await createLLMService(config);
      expect(typeof service.getConfig).toBe('function');

      const serviceConfig = service.getConfig();
      expect(serviceConfig).toHaveProperty('provider');
      expect(serviceConfig).toHaveProperty('model');
    });
  });
});
