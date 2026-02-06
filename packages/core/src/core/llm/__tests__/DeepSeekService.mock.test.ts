import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DeepSeekService } from '../services/DeepSeekService.js';
import type OpenAI from 'openai';

// Mock OpenAI client
const createMockOpenAI = (mockResponse?: any) => {
  const defaultResponse = {
    choices: [
      {
        message: {
          content: 'Mocked response content',
          tool_calls: null,
        },
        finish_reason: 'stop',
      },
    ],
    usage: {
      prompt_tokens: 100,
      completion_tokens: 50,
      total_tokens: 150,
      prompt_cache_hit_tokens: 20,
      prompt_cache_miss_tokens: 80,
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

describe('DeepSeekService Mock 测试', () => {
  let service: DeepSeekService;
  let mockOpenAI: OpenAI;

  beforeEach(() => {
    vi.clearAllMocks();
    mockOpenAI = createMockOpenAI();
    service = new DeepSeekService(mockOpenAI, 'deepseek-chat');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('构造函数', () => {
    it('应该使用默认配置创建实例', () => {
      const service = new DeepSeekService(mockOpenAI, 'deepseek-chat');
      expect(service).toBeInstanceOf(DeepSeekService);
      expect(service.getConfig().provider).toBe('deepseek');
      expect(service.getConfig().model).toBe('deepseek-chat');
    });

    it('应该接受自定义配置', () => {
      const service = new DeepSeekService(mockOpenAI, 'deepseek-chat', {
        maxRetries: 5,
        maxIterations: 10,
      });
      expect(service).toBeInstanceOf(DeepSeekService);
    });

    it('应该检测推理模型', () => {
      const reasonerService = new DeepSeekService(mockOpenAI, 'deepseek-reasoner');
      expect(reasonerService.getConfig().model).toBe('deepseek-reasoner');
    });

    it('应该检测 -think 后缀的模型', () => {
      const thinkService = new DeepSeekService(mockOpenAI, 'deepseek-chat-think');
      expect(thinkService.getConfig().model).toBe('deepseek-chat-think');
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
          model: 'deepseek-chat',
          messages,
        }),
        undefined
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
        }),
        undefined
      );
    });

    it('应该返回正确格式的响应', async () => {
      const messages = [{ role: 'user', content: 'Hello' }];
      const response = await service.complete(messages);

      expect(response).toHaveProperty('content');
      expect(response).toHaveProperty('toolCalls');
      expect(response).toHaveProperty('finishReason');
      expect(response).toHaveProperty('usage');
      expect(response.content).toBe('Mocked response content');
    });

    it('应该处理 usage 统计', async () => {
      const messages = [{ role: 'user', content: 'Hello' }];
      const response = await service.complete(messages);

      expect(response.usage).toEqual({
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150,
        cacheHitTokens: 20,
        cacheMissTokens: 80,
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
                  id: 'call_123',
                  type: 'function',
                  function: {
                    name: 'read_file',
                    arguments: '{"path": "/test.txt"}',
                  },
                },
              ],
            },
            finish_reason: 'tool_calls',
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      });

      const service = new DeepSeekService(mockWithToolCalls, 'deepseek-chat');
      const response = await service.complete([{ role: 'user', content: 'Read file' }]);

      expect(response.toolCalls).toBeDefined();
      expect(response.toolCalls).toHaveLength(1);
      expect(response.toolCalls![0].function.name).toBe('read_file');
    });

    it('应该处理推理模型的 reasoning_content', async () => {
      const mockWithReasoning = createMockOpenAI({
        choices: [
          {
            message: {
              content: 'Final answer',
              reasoning_content: 'Step by step thinking...',
            },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 50,
          total_tokens: 60,
          completion_tokens_details: { reasoning_tokens: 40 },
        },
      });

      const service = new DeepSeekService(mockWithReasoning, 'deepseek-reasoner');
      const response = await service.complete([{ role: 'user', content: 'Think step by step' }]);

      expect(response.reasoningContent).toBe('Step by step thinking...');
      expect(response.usage?.reasoningTokens).toBe(40);
    });

    it('应该传递 temperature 参数（非推理模型）', async () => {
      const messages = [{ role: 'user', content: 'Hello' }];

      await service.complete(messages, undefined, { temperature: 0.7 });

      expect(mockOpenAI.chat.completions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          temperature: 0.7,
        }),
        undefined
      );
    });

    it('推理模型不应传递 temperature', async () => {
      const reasonerMock = createMockOpenAI();
      const reasonerService = new DeepSeekService(reasonerMock, 'deepseek-reasoner');
      await reasonerService.complete([{ role: 'user', content: 'Hello' }], undefined, {
        temperature: 0.7,
      });

      // 推理模型的请求体中不应该包含 temperature
      const callArgs = vi.mocked(reasonerMock.chat.completions.create).mock.calls[0][0] as any;
      expect(callArgs.temperature).toBeUndefined();
    });

    it('应该处理 AbortSignal', async () => {
      const controller = new AbortController();
      const messages = [{ role: 'user', content: 'Hello' }];

      await service.complete(messages, undefined, { abortSignal: controller.signal });

      expect(mockOpenAI.chat.completions.create).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          signal: controller.signal,
        })
      );
    });
  });

  describe('simpleChat 方法', () => {
    it('应该发送用户消息', async () => {
      await service.simpleChat('Hello');

      expect(mockOpenAI.chat.completions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: [{ role: 'user', content: 'Hello' }],
        }),
        undefined
      );
    });

    it('应该包含 systemPrompt（如果提供）', async () => {
      await service.simpleChat('Hello', 'You are a helpful assistant');

      expect(mockOpenAI.chat.completions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: [
            { role: 'system', content: 'You are a helpful assistant' },
            { role: 'user', content: 'Hello' },
          ],
        }),
        undefined
      );
    });

    it('应该返回响应内容字符串', async () => {
      const response = await service.simpleChat('Hello');
      expect(typeof response).toBe('string');
      expect(response).toBe('Mocked response content');
    });
  });

  describe('getConfig 方法', () => {
    it('应该返回正确的 provider 和 model', () => {
      const config = service.getConfig();
      expect(config.provider).toBe('deepseek');
      expect(config.model).toBe('deepseek-chat');
    });
  });

  describe('重试逻辑', () => {
    it('应该在失败时重试', async () => {
      const failingMock = {
        chat: {
          completions: {
            create: vi
              .fn()
              .mockRejectedValueOnce(new Error('Network error'))
              .mockResolvedValueOnce({
                choices: [{ message: { content: 'Success' }, finish_reason: 'stop' }],
                usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
              }),
          },
        },
      } as unknown as OpenAI;

      const service = new DeepSeekService(failingMock, 'deepseek-chat', { maxRetries: 3 });
      const response = await service.complete([{ role: 'user', content: 'Hello' }]);

      expect(response.content).toBe('Success');
      expect(failingMock.chat.completions.create).toHaveBeenCalledTimes(2);
    });

    it('应该在达到最大重试次数后抛出错误', async () => {
      const alwaysFailingMock = {
        chat: {
          completions: {
            create: vi.fn().mockRejectedValue(new Error('Persistent error')),
          },
        },
      } as unknown as OpenAI;

      const service = new DeepSeekService(alwaysFailingMock, 'deepseek-chat', { maxRetries: 2 });

      await expect(service.complete([{ role: 'user', content: 'Hello' }])).rejects.toThrow(
        'DeepSeek API 调用失败'
      );
      expect(alwaysFailingMock.chat.completions.create).toHaveBeenCalledTimes(2);
    });
  });

  describe('错误处理', () => {
    it('应该处理无效响应（没有 choices）', async () => {
      const invalidMock = {
        chat: {
          completions: {
            create: vi.fn().mockResolvedValue({ choices: [] }),
          },
        },
      } as unknown as OpenAI;

      const service = new DeepSeekService(invalidMock, 'deepseek-chat', { maxRetries: 1 });

      await expect(service.complete([{ role: 'user', content: 'Hello' }])).rejects.toThrow(
        '无效响应'
      );
    });

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

      const service = new DeepSeekService(emptyMessageMock, 'deepseek-chat', { maxRetries: 1 });

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

      const serviceWithTools = new DeepSeekService(mockOpenAI, 'deepseek-chat', {
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

    it('有 toolManager 时应该调用其 getAllTools', async () => {
      const mockTools = { read_file: {} };
      const mockToolManager = {
        getToolsForProvider: vi.fn(),
        getAllTools: vi.fn().mockResolvedValue(mockTools),
        executeTool: vi.fn(),
      };

      const serviceWithTools = new DeepSeekService(mockOpenAI, 'deepseek-chat', {
        toolManager: mockToolManager,
      });

      const tools = await serviceWithTools.getAllTools();
      expect(tools).toEqual(mockTools);
    });
  });
});
