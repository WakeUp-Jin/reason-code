import { describe, it, expect } from 'vitest';
import {
  buildSystemPrompt,
  buildExplanatorySystemPrompt,
  stewardPrompt,
  explorePrompt,
  type SystemPromptContext,
} from '../index.js';

describe('SystemPromptBuilder 测试', () => {
  const mockContext: SystemPromptContext = {
    workingDirectory: '/home/user/project',
    modelName: 'deepseek-chat',
    osInfo: 'macOS 14.0',
    currentDate: '2024-01-15',
  };

  describe('buildSystemPrompt', () => {
    it('应该返回非空字符串', () => {
      const result = buildSystemPrompt(mockContext);
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it('应该包含环境信息', () => {
      const result = buildSystemPrompt(mockContext);
      expect(result).toContain('环境信息');
      expect(result).toContain('/home/user/project');
      expect(result).toContain('deepseek-chat');
    });

    it('应该包含操作系统信息（如果提供）', () => {
      const result = buildSystemPrompt(mockContext);
      expect(result).toContain('macOS 14.0');
    });

    it('应该包含当前日期（如果提供）', () => {
      const result = buildSystemPrompt(mockContext);
      expect(result).toContain('2024-01-15');
    });

    it('应该处理缺少可选字段的情况', () => {
      const minimalContext: SystemPromptContext = {
        workingDirectory: '/project',
        modelName: 'test-model',
      };
      const result = buildSystemPrompt(minimalContext);
      expect(result).toContain('/project');
      expect(result).toContain('test-model');
      expect(result).not.toContain('操作系统');
    });
  });

  describe('buildExplanatorySystemPrompt', () => {
    it('应该返回非空字符串', () => {
      const result = buildExplanatorySystemPrompt(mockContext);
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it('应该比基础 prompt 更长（包含解释性指南）', () => {
      const basic = buildSystemPrompt(mockContext);
      const explanatory = buildExplanatorySystemPrompt(mockContext);
      // 解释性模式应该包含额外的指南
      expect(explanatory.length).toBeGreaterThanOrEqual(basic.length);
    });

    it('应该包含环境信息', () => {
      const result = buildExplanatorySystemPrompt(mockContext);
      expect(result).toContain('环境信息');
      expect(result).toContain(mockContext.workingDirectory);
    });
  });

  describe('buildExplanatorySystemPrompt 对比 buildSystemPrompt', () => {
    it('解释性 prompt 应该包含额外内容', () => {
      const basic = buildSystemPrompt(mockContext);
      const explanatory = buildExplanatorySystemPrompt(mockContext);
      // 解释性模式应该比基础模式长或相等
      expect(explanatory.length).toBeGreaterThanOrEqual(basic.length);
    });

    it('两者都应该包含环境信息', () => {
      const basic = buildSystemPrompt(mockContext);
      const explanatory = buildExplanatorySystemPrompt(mockContext);
      expect(basic).toContain('环境信息');
      expect(explanatory).toContain('环境信息');
    });
  });

  describe('stewardPrompt', () => {
    it('应该是非空字符串', () => {
      expect(typeof stewardPrompt).toBe('string');
      expect(stewardPrompt.length).toBeGreaterThan(0);
    });

    it('应该包含角色定位', () => {
      expect(stewardPrompt).toContain('瑞兹');
      expect(stewardPrompt).toContain('管家');
    });

    it('应该包含贾维斯风格指南', () => {
      expect(stewardPrompt).toContain('贾维斯');
      expect(stewardPrompt).toContain('先生');
    });

    it('应该包含工具使用约束', () => {
      expect(stewardPrompt).toContain('工具调用');
      expect(stewardPrompt).toContain('ListFiles');
      expect(stewardPrompt).toContain('ReadFile');
    });

    it('应该包含监控文件说明', () => {
      expect(stewardPrompt).toContain('monitors');
      expect(stewardPrompt).toContain('_active.md');
      expect(stewardPrompt).toContain('_idle.md');
    });
  });

  describe('explorePrompt', () => {
    it('应该是非空字符串', () => {
      expect(typeof explorePrompt).toBe('string');
      expect(explorePrompt.length).toBeGreaterThan(0);
    });

    it('应该包含角色定位', () => {
      expect(explorePrompt).toContain('代码库调查员');
      expect(explorePrompt).toContain('Codebase Investigator');
    });

    it('应该包含核心规则', () => {
      expect(explorePrompt).toContain('RULES');
      expect(explorePrompt).toContain('深度分析');
    });

    it('应该包含工作记忆管理说明', () => {
      expect(explorePrompt).toContain('Scratchpad');
      expect(explorePrompt).toContain('调查清单');
      expect(explorePrompt).toContain('待解决问题');
    });

    it('应该包含工具使用策略', () => {
      expect(explorePrompt).toContain('Glob');
      expect(explorePrompt).toContain('Grep');
      expect(explorePrompt).toContain('ListFiles');
      expect(explorePrompt).toContain('ReadFile');
      expect(explorePrompt).toContain('ReadManyFiles');
    });

    it('应该包含输出格式要求', () => {
      expect(explorePrompt).toContain('调查总结');
      expect(explorePrompt).toContain('探索轨迹');
      expect(explorePrompt).toContain('相关位置');
      expect(explorePrompt).toContain('可操作建议');
    });

    it('应该包含约束条件', () => {
      expect(explorePrompt).toContain('必须做');
      expect(explorePrompt).toContain('禁止做');
      expect(explorePrompt).toContain('只读权限');
    });
  });

  describe('Prompt 一致性测试', () => {
    it('所有构建器应该处理相同的 context 格式', () => {
      const context: SystemPromptContext = {
        workingDirectory: '/test',
        modelName: 'test',
      };

      // 所有构建器都应该不抛出错误
      expect(() => buildSystemPrompt(context)).not.toThrow();
      expect(() => buildExplanatorySystemPrompt(context)).not.toThrow();
    });

    it('静态 prompt 应该是稳定的（多次访问返回相同值）', () => {
      const steward1 = stewardPrompt;
      const steward2 = stewardPrompt;
      expect(steward1).toBe(steward2);

      const explore1 = explorePrompt;
      const explore2 = explorePrompt;
      expect(explore1).toBe(explore2);
    });
  });
});
