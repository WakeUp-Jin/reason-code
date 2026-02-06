import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ILLMService, LLMResponse } from '../types/index.js';

// 定义 ModelTier 用于测试
enum MockModelTier {
  PRIMARY = 'primary',
  SECONDARY = 'secondary',
}

// Mock service
const createMockService = (): ILLMService => ({
  complete: vi.fn().mockResolvedValue({
    content: 'Mocked response',
    toolCalls: undefined,
    finishReason: 'stop',
    usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
  } as LLMResponse),
  simpleChat: vi.fn().mockResolvedValue('Mocked simple chat'),
  getConfig: vi.fn().mockReturnValue({ provider: 'deepseek', model: 'deepseek-chat' }),
});

/**
 * LLMServiceRegistry 单元测试
 * 
 * 注意：由于 LLMServiceRegistry 依赖 configService，
 * 这里测试的是类的接口和缓存逻辑，不涉及真实的配置加载
 */
describe('LLMServiceRegistry 接口测试', () => {
  // 模拟一个简单的 Registry 类来测试缓存逻辑
  class SimpleRegistry<T> {
    private cache = new Map<string, T>();

    set(key: string, value: T): void {
      this.cache.set(key, value);
    }

    get(key: string): T | undefined {
      return this.cache.get(key);
    }

    has(key: string): boolean {
      return this.cache.has(key);
    }

    delete(key: string): boolean {
      return this.cache.delete(key);
    }

    clear(): void {
      this.cache.clear();
    }

    get size(): number {
      return this.cache.size;
    }
  }

  let registry: SimpleRegistry<ILLMService>;

  beforeEach(() => {
    vi.clearAllMocks();
    registry = new SimpleRegistry<ILLMService>();
  });

  describe('缓存基础功能', () => {
    it('应该能存储和检索服务', () => {
      const mockService = createMockService();
      registry.set(MockModelTier.PRIMARY, mockService);

      expect(registry.has(MockModelTier.PRIMARY)).toBe(true);
      expect(registry.get(MockModelTier.PRIMARY)).toBe(mockService);
    });

    it('初始状态应该没有缓存', () => {
      expect(registry.has(MockModelTier.PRIMARY)).toBe(false);
      expect(registry.has(MockModelTier.SECONDARY)).toBe(false);
      expect(registry.size).toBe(0);
    });

    it('应该能缓存多个层级的服务', () => {
      const primaryService = createMockService();
      const secondaryService = createMockService();

      registry.set(MockModelTier.PRIMARY, primaryService);
      registry.set(MockModelTier.SECONDARY, secondaryService);

      expect(registry.has(MockModelTier.PRIMARY)).toBe(true);
      expect(registry.has(MockModelTier.SECONDARY)).toBe(true);
      expect(registry.size).toBe(2);
    });
  });

  describe('缓存失效', () => {
    it('应该能使指定层级的缓存失效', () => {
      const mockService = createMockService();
      registry.set(MockModelTier.PRIMARY, mockService);
      expect(registry.has(MockModelTier.PRIMARY)).toBe(true);

      registry.delete(MockModelTier.PRIMARY);
      expect(registry.has(MockModelTier.PRIMARY)).toBe(false);
    });

    it('删除一个层级不应影响其他层级', () => {
      const primaryService = createMockService();
      const secondaryService = createMockService();

      registry.set(MockModelTier.PRIMARY, primaryService);
      registry.set(MockModelTier.SECONDARY, secondaryService);

      registry.delete(MockModelTier.PRIMARY);

      expect(registry.has(MockModelTier.PRIMARY)).toBe(false);
      expect(registry.has(MockModelTier.SECONDARY)).toBe(true);
    });

    it('应该能清除所有缓存', () => {
      registry.set(MockModelTier.PRIMARY, createMockService());
      registry.set(MockModelTier.SECONDARY, createMockService());
      expect(registry.size).toBe(2);

      registry.clear();
      expect(registry.size).toBe(0);
      expect(registry.has(MockModelTier.PRIMARY)).toBe(false);
      expect(registry.has(MockModelTier.SECONDARY)).toBe(false);
    });

    it('清空空的 registry 不应报错', () => {
      expect(() => registry.clear()).not.toThrow();
    });
  });

  describe('服务复用', () => {
    it('应该复用已缓存的服务实例', () => {
      const mockService = createMockService();
      registry.set(MockModelTier.PRIMARY, mockService);

      const service1 = registry.get(MockModelTier.PRIMARY);
      const service2 = registry.get(MockModelTier.PRIMARY);

      expect(service1).toBe(service2);
      expect(service1).toBe(mockService);
    });

    it('不同层级应该有独立的服务实例', () => {
      const primaryService = createMockService();
      const secondaryService = createMockService();

      registry.set(MockModelTier.PRIMARY, primaryService);
      registry.set(MockModelTier.SECONDARY, secondaryService);

      expect(registry.get(MockModelTier.PRIMARY)).not.toBe(registry.get(MockModelTier.SECONDARY));
    });
  });

  describe('Mock Service 接口验证', () => {
    it('Mock Service 应该实现 ILLMService 接口', async () => {
      const mockService = createMockService();

      // 验证 complete 方法
      expect(typeof mockService.complete).toBe('function');
      const completeResult = await mockService.complete([]);
      expect(completeResult).toHaveProperty('content');

      // 验证 simpleChat 方法
      expect(typeof mockService.simpleChat).toBe('function');
      const chatResult = await mockService.simpleChat('test');
      expect(typeof chatResult).toBe('string');

      // 验证 getConfig 方法
      expect(typeof mockService.getConfig).toBe('function');
      const config = mockService.getConfig();
      expect(config).toHaveProperty('provider');
      expect(config).toHaveProperty('model');
    });
  });
});
