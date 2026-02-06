import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OpenRouterService } from '../services/OpenRouterService.js';
import type OpenAI from 'openai';

// Mock OpenAI client
const createMockOpenAI = (mockResponse?: any) => {
  const defaultResponse = {
    choices: [
      {
        message: {
          content: 'Mocked OpenRouter response',
          tool_calls: null,
        },
        finish_reason: 'stop',
      },
    ],
    usage: {
      prompt_tokens: 100,
      completion_tokens: 50,
      total_tokens: 150,
    },
  };

  return {
    chat: {
      completions: {
        create: vi.fn().mockResolvedValue(mockResponse || defaultResponse),
      },
    },
  } as unknown as OpenAI;
};

describe('OpenRouterService Mock 测试', () => {
  let service: OpenRouterService;
  let mockOpenAI: OpenAI;

  beforeEach(() => {
    vi.clearAllMocks();
    mockOpenAI = createMockOpenAI();
    service = new OpenRouterService(mockOpenAI, 'openai/gpt-4');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('构造函数', () => {
    it('应该使用默认配置创建实例', () => {
      const service = new OpenRouterService(mockOpenAI, 'openai/gpt-4');
      expect(service).toBeInstanceOf(OpenRouterService);
      expect(service.getConfig().provider).toBe('openrouter');
      expect(service.getConfig().model).toBe('openai/gpt-4');
    });

    it('应该接受自定义配置', () => {
      const service = new OpenRouterService(mockOpenAI, 'anthropic/claude-3-opus', {
        maxRetries: 5,
        maxIterations: 10,
      });
      expect(service).toBeInstanceOf(OpenRouterService);
      expect(service.getConfig().model).toBe('anthropic/claude-3-opus');
    });
  });

  describe('complete 方法', () => {
    it('应该发送正确的消息格式', async () => {
      const messages = [
        { role: 'system', content: 'You are helpful' },
        { role: 'user', content: 'Hello' },
      ];

      await service.complete(messages);

      expect(mockOpenAI.chat.completions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'openai/gpt-4',
          messages: expect.any(Array),
        })
      );
    });

    it('应该传递工具定义', async () => {
      const messages = [{ role: 'user', content: 'Read a file' }];
      const tools = [
        {
          type: 'function',
          function: {
            name: 'read_file',
            description: 'Read a file',
            parameters: { type: 'object', properties: {} },
          },
        },
      ];

      await service.complete(messages, tools);

      expect(mockOpenAI.chat.completions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          tools,
        })
      );
    });

    it('应该返回正确格式的响应', async () => {
      const messages = [{ role: 'user', content: 'Hello' }];
      const response = await service.complete(messages);

      expect(response).toHaveProperty('content');
      expect(response).toHaveProperty('toolCalls');
      expect(response).toHaveProperty('finishReason');
      expect(response).toHaveProperty('usage');
      expect(response.content).toBe('Mocked OpenRouter response');
    });

    it('应该处理 usage 统计', async () => {
      const messages = [{ role: 'user', content: 'Hello' }];
      const response = await service.complete(messages);

      expect(response.usage).toEqual({
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150,
        reasoningTokens: undefined,
      });
    });

    it('应该处理工具调用响应', async () => {
      const mockWithToolCalls = createMockOpenAI({
        choices: [
          {
            message: {
              content: null,
              tool_calls: [
                {
                  id: 'call_456',
                  type: 'function',
                  function: {
                    name: 'search',
                    arguments: '{"query": "test"}',
                  },
                },
              ],
            },
            finish_reason: 'tool_calls',
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      });

      const service = new OpenRouterService(mockWithToolCalls, 'openai/gpt-4');
      const response = await service.complete([{ role: 'user', content: 'Search' }]);

      expect(response.toolCalls).toBeDefined();
      expect(response.toolCalls).toHaveLength(1);
      expect(response.toolCalls![0].function.name).toBe('search');
    });

    it('应该传递 options 参数', async () => {
      const messages = [{ role: 'user', content: 'Hello' }];

      await service.complete(messages, undefined, {
        temperature: 0.8,
        maxTokens: 1000,
        toolChoice: 'auto',
      });

      expect(mockOpenAI.chat.completions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          temperature: 0.8,
          maxTokens: 1000,
          toolChoice: 'auto',
        })
      );
    });
  });

  describe('simpleChat 方法', () => {
    it('应该发送用户消息', async () => {
      await service.simpleChat('Hello');

      expect(mockOpenAI.chat.completions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: expect.arrayContaining([expect.objectContaining({ role: 'user' })]),
        })
      );
    });

    it('应该包含 systemPrompt（如果提供）', async () => {
      await service.simpleChat('Hello', 'You are a helpful assistant');

      expect(mockOpenAI.chat.completions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: expect.arrayContaining([expect.objectContaining({ role: 'system' })]),
        })
      );
    });

    it('应该返回响应内容字符串', async () => {
      const response = await service.simpleChat('Hello');
      expect(typeof response).toBe('string');
      expect(response).toBe('Mocked OpenRouter response');
    });
  });

  describe('getConfig 方法', () => {
    it('应该返回正确的 provider 和 model', () => {
      const config = service.getConfig();
      expect(config.provider).toBe('openrouter');
      expect(config.model).toBe('openai/gpt-4');
    });

    it('应该支持不同的模型', () => {
      const claudeService = new OpenRouterService(mockOpenAI, 'anthropic/claude-3.5-sonnet');
      expect(claudeService.getConfig().model).toBe('anthropic/claude-3.5-sonnet');

      const geminiService = new OpenRouterService(mockOpenAI, 'google/gemini-pro');
      expect(geminiService.getConfig().model).toBe('google/gemini-pro');
    });
  });

  describe('重试逻辑', () => {
    it('应该在失败时重试', async () => {
      const failingMock = {
        chat: {
          completions: {
            create: vi
              .fn()
              .mockRejectedValueOnce(new Error('Rate limit'))
              .mockResolvedValueOnce({
                choices: [{ message: { content: 'Success' }, finish_reason: 'stop' }],
                usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
              }),
          },
        },
      } as unknown as OpenAI;

      const service = new OpenRouterService(failingMock, 'openai/gpt-4', { maxRetries: 3 });
      const response = await service.complete([{ role: 'user', content: 'Hello' }]);

      expect(response.content).toBe('Success');
      expect(failingMock.chat.completions.create).toHaveBeenCalledTimes(2);
    });

    it('应该在达到最大重试次数后抛出错误', async () => {
      const alwaysFailingMock = {
        chat: {
          completions: {
            create: vi.fn().mockRejectedValue(new Error('Service unavailable')),
          },
        },
      } as unknown as OpenAI;

      const service = new OpenRouterService(alwaysFailingMock, 'openai/gpt-4', { maxRetries: 2 });

      await expect(service.complete([{ role: 'user', content: 'Hello' }])).rejects.toThrow(
        'OpenRouter API 调用失败'
      );
      expect(alwaysFailingMock.chat.completions.create).toHaveBeenCalledTimes(2);
    });
  });

  describe('错误处理', () => {
    it('应该处理空 message', async () => {
      const emptyMessageMock = {
        chat: {
          completions: {
            create: vi.fn().mockResolvedValue({
              choices: [{ message: null, finish_reason: 'stop' }],
            }),
          },
        },
      } as unknown as OpenAI;

      const service = new OpenRouterService(emptyMessageMock, 'openai/gpt-4', { maxRetries: 1 });

      await expect(service.complete([{ role: 'user', content: 'Hello' }])).rejects.toThrow(
        '空响应'
      );
    });
  });

  describe('generate 方法', () => {
    it('没有 toolManager 时应该抛出错误', async () => {
      await expect(service.generate('Hello')).rejects.toThrow('需要 toolManager');
    });

    it('有 toolManager 时应该能执行', async () => {
      const mockToolManager = {
        getToolsForProvider: vi.fn().mockResolvedValue([]),
        getAllTools: vi.fn().mockResolvedValue({}),
        executeTool: vi.fn().mockResolvedValue({}),
      };

      const serviceWithTools = new OpenRouterService(mockOpenAI, 'openai/gpt-4', {
        toolManager: mockToolManager,
      });

      const result = await serviceWithTools.generate('Hello');
      expect(typeof result).toBe('string');
    });
  });

  describe('getAllTools 方法', () => {
    it('没有 toolManager 时应该返回空对象', async () => {
      const tools = await service.getAllTools();
      expect(tools).toEqual({});
    });
  });

  describe('chatStream 方法', () => {
    it('应该抛出未实现错误', async () => {
      await expect(service.chatStream([], undefined, undefined)).rejects.toThrow('暂未实现');
    });
  });
});
