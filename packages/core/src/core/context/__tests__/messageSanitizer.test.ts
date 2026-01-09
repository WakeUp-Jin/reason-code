/**
 * 消息验证和清理工具测试
 */

import { describe, it, expect } from 'vitest';
import {
  sanitizeMessages,
  validateMessages,
} from '../utils/messageSanitizer.js';
import type { Message } from '../types.js';

describe('messageSanitizer', () => {
  describe('sanitizeMessages', () => {
    it('should return unchanged messages when all are valid', () => {
      const messages: Message[] = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there!' },
      ];

      const result = sanitizeMessages(messages);

      expect(result.sanitized).toBe(false);
      expect(result.messages).toEqual(messages);
      expect(result.removedCount).toBe(0);
    });

    it('should handle empty messages array', () => {
      const result = sanitizeMessages([]);

      expect(result.sanitized).toBe(false);
      expect(result.messages).toEqual([]);
      expect(result.removedCount).toBe(0);
    });

    it('should keep complete assistant + tool message pairs', () => {
      const messages: Message[] = [
        { role: 'user', content: 'List files' },
        {
          role: 'assistant',
          content: '',
          tool_calls: [
            {
              id: 'call_1',
              type: 'function',
              function: { name: 'ListFiles', arguments: '{}' },
            },
          ],
        },
        {
          role: 'tool',
          tool_call_id: 'call_1',
          name: 'ListFiles',
          content: '{"files": ["a.txt"]}',
        },
        { role: 'assistant', content: 'Found one file.' },
      ];

      const result = sanitizeMessages(messages);

      expect(result.sanitized).toBe(false);
      expect(result.messages).toEqual(messages);
      expect(result.removedCount).toBe(0);
    });

    it('should remove incomplete assistant message (missing tool response)', () => {
      const messages: Message[] = [
        { role: 'user', content: 'List files' },
        {
          role: 'assistant',
          content: '',
          tool_calls: [
            {
              id: 'call_1',
              type: 'function',
              function: { name: 'ListFiles', arguments: '{}' },
            },
          ],
        },
        // Missing tool response for call_1
      ];

      const result = sanitizeMessages(messages);

      expect(result.sanitized).toBe(true);
      expect(result.removedCount).toBe(1);
      expect(result.messages).toEqual([{ role: 'user', content: 'List files' }]);
    });

    it('should remove incomplete assistant message and its partial tool responses', () => {
      const messages: Message[] = [
        { role: 'user', content: 'Do two things' },
        {
          role: 'assistant',
          content: '',
          tool_calls: [
            {
              id: 'call_1',
              type: 'function',
              function: { name: 'Tool1', arguments: '{}' },
            },
            {
              id: 'call_2',
              type: 'function',
              function: { name: 'Tool2', arguments: '{}' },
            },
          ],
        },
        {
          role: 'tool',
          tool_call_id: 'call_1',
          name: 'Tool1',
          content: 'Result 1',
        },
        // Missing tool response for call_2
      ];

      const result = sanitizeMessages(messages);

      expect(result.sanitized).toBe(true);
      // Both the assistant message and the partial tool response should be removed
      expect(result.removedCount).toBe(2);
      expect(result.messages).toEqual([
        { role: 'user', content: 'Do two things' },
      ]);
    });

    it('should keep earlier complete pairs when later pair is incomplete', () => {
      const messages: Message[] = [
        { role: 'user', content: 'First request' },
        {
          role: 'assistant',
          content: '',
          tool_calls: [
            {
              id: 'call_1',
              type: 'function',
              function: { name: 'Tool1', arguments: '{}' },
            },
          ],
        },
        {
          role: 'tool',
          tool_call_id: 'call_1',
          name: 'Tool1',
          content: 'Result 1',
        },
        { role: 'assistant', content: 'First done.' },
        { role: 'user', content: 'Second request' },
        {
          role: 'assistant',
          content: '',
          tool_calls: [
            {
              id: 'call_2',
              type: 'function',
              function: { name: 'Tool2', arguments: '{}' },
            },
          ],
        },
        // Missing tool response for call_2
      ];

      const result = sanitizeMessages(messages);

      expect(result.sanitized).toBe(true);
      expect(result.removedCount).toBe(1);
      expect(result.messages).toEqual([
        { role: 'user', content: 'First request' },
        {
          role: 'assistant',
          content: '',
          tool_calls: [
            {
              id: 'call_1',
              type: 'function',
              function: { name: 'Tool1', arguments: '{}' },
            },
          ],
        },
        {
          role: 'tool',
          tool_call_id: 'call_1',
          name: 'Tool1',
          content: 'Result 1',
        },
        { role: 'assistant', content: 'First done.' },
        { role: 'user', content: 'Second request' },
      ]);
    });

    it('should remove orphaned tool messages', () => {
      const messages: Message[] = [
        { role: 'user', content: 'Hello' },
        {
          role: 'tool',
          tool_call_id: 'orphan_call',
          name: 'SomeTool',
          content: 'Orphaned result',
        },
        { role: 'assistant', content: 'Response' },
      ];

      const result = sanitizeMessages(messages);

      expect(result.sanitized).toBe(true);
      expect(result.removedCount).toBe(1);
      expect(result.messages).toEqual([
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Response' },
      ]);
    });
  });

  describe('validateMessages', () => {
    it('should return valid for correct messages', () => {
      const messages: Message[] = [
        { role: 'user', content: 'Hello' },
        {
          role: 'assistant',
          content: '',
          tool_calls: [
            {
              id: 'call_1',
              type: 'function',
              function: { name: 'Tool1', arguments: '{}' },
            },
          ],
        },
        {
          role: 'tool',
          tool_call_id: 'call_1',
          name: 'Tool1',
          content: 'Result',
        },
        { role: 'assistant', content: 'Done!' },
      ];

      const result = validateMessages(messages);

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should return errors for incomplete tool_calls', () => {
      const messages: Message[] = [
        {
          role: 'assistant',
          content: '',
          tool_calls: [
            {
              id: 'call_1',
              type: 'function',
              function: { name: 'Tool1', arguments: '{}' },
            },
          ],
        },
      ];

      const result = validateMessages(messages);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should return errors for orphaned tool messages', () => {
      const messages: Message[] = [
        {
          role: 'tool',
          tool_call_id: 'orphan',
          name: 'Tool',
          content: 'Result',
        },
      ];

      const result = validateMessages(messages);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });
});

