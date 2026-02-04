import { describe, it, expect } from 'vitest';
import { TokenEstimator } from '../utils/tokenEstimator.js';
import type { Message } from '../types.js';

describe('TokenEstimator 测试', () => {
  describe('estimate 方法', () => {
    it('应该返回 0 对于空字符串', () => {
      expect(TokenEstimator.estimate('')).toBe(0);
    });

    it('应该处理 null/undefined（转为字符串后估算）', () => {
      // null 被 JSON.stringify 转为 "null" (4 chars)
      // undefined 被转为 undefined 字符串
      const nullResult = TokenEstimator.estimate(null);
      const undefinedResult = TokenEstimator.estimate(undefined);
      // 只要不抛错且返回数字即可
      expect(typeof nullResult).toBe('number');
      expect(typeof undefinedResult).toBe('number');
    });

    it('应该估算纯 ASCII 文本', () => {
      // "Hello" = 5 chars / 4 = ~2 tokens
      const result = TokenEstimator.estimate('Hello');
      expect(result).toBeGreaterThan(0);
      expect(result).toBeLessThan(10);
    });

    it('应该估算纯中文文本', () => {
      // "你好世界" = 4 中文字符 / 1.5 = ~3 tokens
      const result = TokenEstimator.estimate('你好世界');
      expect(result).toBeGreaterThan(0);
      expect(result).toBeLessThan(10);
    });

    it('应该估算混合文本', () => {
      // "Hello你好" = 5 ASCII + 2 中文
      const result = TokenEstimator.estimate('Hello你好');
      expect(result).toBeGreaterThan(0);
    });

    it('应该处理长文本', () => {
      const longText = 'a'.repeat(1000);
      const result = TokenEstimator.estimate(longText);
      // 1000 ASCII / 4 = 250 tokens
      expect(result).toBe(250);
    });

    it('应该处理对象输入（转为 JSON）', () => {
      const obj = { name: 'test', value: 123 };
      const result = TokenEstimator.estimate(obj);
      expect(result).toBeGreaterThan(0);
    });

    it('应该处理数组输入', () => {
      const arr = [1, 2, 3, 'test'];
      const result = TokenEstimator.estimate(arr);
      expect(result).toBeGreaterThan(0);
    });

    it('应该处理特殊字符', () => {
      const special = '!@#$%^&*()_+-=[]{}|;:,.<>?';
      const result = TokenEstimator.estimate(special);
      expect(result).toBeGreaterThan(0);
    });

    it('应该处理换行符和空格', () => {
      const text = 'Hello\n\nWorld   Test';
      const result = TokenEstimator.estimate(text);
      expect(result).toBeGreaterThan(0);
    });

    it('中文文本应该比等长 ASCII 文本估算更多 token', () => {
      const ascii = 'abcd'; // 4 chars / 4 = 1 token
      const chinese = '你好世界'; // 4 chars / 1.5 = ~3 tokens
      expect(TokenEstimator.estimate(chinese)).toBeGreaterThan(TokenEstimator.estimate(ascii));
    });
  });

  describe('estimateMessages 方法', () => {
    it('应该返回 0 对于空数组', () => {
      expect(TokenEstimator.estimateMessages([])).toBe(0);
    });

    it('应该返回 0 对于 null/undefined', () => {
      expect(TokenEstimator.estimateMessages(null as any)).toBe(0);
      expect(TokenEstimator.estimateMessages(undefined as any)).toBe(0);
    });

    it('应该估算单条消息', () => {
      const messages: Message[] = [{ role: 'user', content: 'Hello' }];
      const result = TokenEstimator.estimateMessages(messages);
      // content tokens + 4 (role)
      expect(result).toBeGreaterThan(4);
    });

    it('应该估算多条消息', () => {
      const messages: Message[] = [
        { role: 'system', content: 'You are helpful' },
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there!' },
      ];
      const result = TokenEstimator.estimateMessages(messages);
      // 3 messages * 4 (role) + content tokens
      expect(result).toBeGreaterThan(12);
    });

    it('应该包含 tool_calls 的 token', () => {
      const messagesWithoutTools: Message[] = [{ role: 'assistant', content: 'Let me help' }];

      const messagesWithTools: Message[] = [
        {
          role: 'assistant',
          content: 'Let me help',
          tool_calls: [
            {
              id: 'call_123',
              type: 'function',
              function: { name: 'read_file', arguments: '{"path": "/test"}' },
            },
          ],
        },
      ];

      const withoutTools = TokenEstimator.estimateMessages(messagesWithoutTools);
      const withTools = TokenEstimator.estimateMessages(messagesWithTools);
      expect(withTools).toBeGreaterThan(withoutTools);
    });

    it('应该包含 tool_call_id 的 token', () => {
      const messages: Message[] = [
        {
          role: 'tool',
          content: 'File content here',
          tool_call_id: 'call_123456789',
        },
      ];
      const result = TokenEstimator.estimateMessages(messages);
      expect(result).toBeGreaterThan(0);
    });

    it('应该包含 name 的 token', () => {
      const messagesWithoutName: Message[] = [{ role: 'user', content: 'Hello' }];

      const messagesWithName: Message[] = [{ role: 'user', content: 'Hello', name: 'John' }];

      const withoutName = TokenEstimator.estimateMessages(messagesWithoutName);
      const withName = TokenEstimator.estimateMessages(messagesWithName);
      expect(withName).toBeGreaterThan(withoutName);
    });
  });

  describe('formatTokens 方法', () => {
    it('应该保持小于 1000 的数字不变', () => {
      expect(TokenEstimator.formatTokens(0)).toBe('0');
      expect(TokenEstimator.formatTokens(1)).toBe('1');
      expect(TokenEstimator.formatTokens(999)).toBe('999');
    });

    it('应该将千级别格式化为 K', () => {
      expect(TokenEstimator.formatTokens(1000)).toBe('1.0K');
      expect(TokenEstimator.formatTokens(1500)).toBe('1.5K');
      expect(TokenEstimator.formatTokens(45600)).toBe('45.6K');
      expect(TokenEstimator.formatTokens(999999)).toBe('1000.0K');
    });

    it('应该将百万级别格式化为 M', () => {
      expect(TokenEstimator.formatTokens(1_000_000)).toBe('1.00M');
      expect(TokenEstimator.formatTokens(1_500_000)).toBe('1.50M');
      expect(TokenEstimator.formatTokens(12_345_678)).toBe('12.35M');
    });
  });

  describe('边界条件', () => {
    it('应该处理非常长的字符串', () => {
      const veryLong = 'x'.repeat(100000);
      const result = TokenEstimator.estimate(veryLong);
      // 100000 / 4 = 25000
      expect(result).toBe(25000);
    });

    it('应该处理只有空格的字符串', () => {
      const spaces = '     ';
      const result = TokenEstimator.estimate(spaces);
      expect(result).toBeGreaterThan(0);
    });

    it('应该处理 emoji', () => {
      const emoji = '😀🎉🚀';
      const result = TokenEstimator.estimate(emoji);
      expect(result).toBeGreaterThan(0);
    });

    it('应该处理日文/韩文字符', () => {
      // 日文平假名和韩文也应该被估算
      const japanese = 'こんにちは';
      const korean = '안녕하세요';
      expect(TokenEstimator.estimate(japanese)).toBeGreaterThan(0);
      expect(TokenEstimator.estimate(korean)).toBeGreaterThan(0);
    });
  });
});
