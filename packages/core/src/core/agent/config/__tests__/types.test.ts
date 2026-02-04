import { describe, it, expect } from 'vitest';
import type { AgentConfig, AgentRole, AgentType, SystemPromptBuilder } from '../types.js';
import { ModelTier } from '../../../../config/types.js';

describe('Agent Config Types 类型约束测试', () => {
  describe('AgentRole 类型', () => {
    it('应该支持 primary 角色', () => {
      const role: AgentRole = 'primary';
      expect(role).toBe('primary');
    });

    it('应该支持 subagent 角色', () => {
      const role: AgentRole = 'subagent';
      expect(role).toBe('subagent');
    });

    it('应该支持 all 角色', () => {
      const role: AgentRole = 'all';
      expect(role).toBe('all');
    });
  });

  describe('AgentType 类型', () => {
    it('应该支持所有预定义的代理类型', () => {
      const types: AgentType[] = ['build', 'steward', 'explore', 'explanatory'];
      expect(types).toHaveLength(4);
      expect(types).toContain('build');
      expect(types).toContain('steward');
      expect(types).toContain('explore');
      expect(types).toContain('explanatory');
    });
  });

  describe('SystemPromptBuilder 函数类型', () => {
    it('应该接受 SystemPromptContext 并返回 string', () => {
      const builder: SystemPromptBuilder = (context) => {
        return `System prompt with tools: ${context.tools?.join(', ') || 'none'}`;
      };

      const result = builder({ tools: ['ReadFile', 'WriteFile'] });
      expect(typeof result).toBe('string');
      expect(result).toContain('ReadFile');
    });

    it('应该处理空 context', () => {
      const builder: SystemPromptBuilder = (_context) => {
        return 'Default system prompt';
      };

      const result = builder({});
      expect(result).toBe('Default system prompt');
    });
  });

  describe('AgentConfig 接口', () => {
    it('应该允许创建最小配置（必需字段）', () => {
      const config: AgentConfig = {
        name: 'build',
        role: 'primary',
        description: 'Test agent',
        systemPrompt: 'You are a helpful assistant',
      };

      expect(config.name).toBe('build');
      expect(config.role).toBe('primary');
      expect(config.description).toBe('Test agent');
    });

    it('应该允许使用 systemPromptBuilder 替代 systemPrompt', () => {
      const config: AgentConfig = {
        name: 'build',
        role: 'primary',
        description: 'Test agent',
        systemPromptBuilder: () => 'Dynamic prompt',
      };

      expect(config.systemPromptBuilder).toBeDefined();
      expect(config.systemPrompt).toBeUndefined();
    });

    it('应该允许配置工具白名单', () => {
      const config: AgentConfig = {
        name: 'explore',
        role: 'subagent',
        description: 'Explorer',
        systemPrompt: 'Explore the codebase',
        tools: {
          include: ['ReadFile', 'Grep', 'Glob'],
        },
      };

      expect(config.tools?.include).toEqual(['ReadFile', 'Grep', 'Glob']);
    });

    it('应该允许配置工具黑名单', () => {
      const config: AgentConfig = {
        name: 'build',
        role: 'primary',
        description: 'Builder',
        systemPrompt: 'Build the project',
        tools: {
          exclude: ['WriteFile', 'Task'],
        },
      };

      expect(config.tools?.exclude).toEqual(['WriteFile', 'Task']);
    });

    it('应该允许配置模型层级', () => {
      const config: AgentConfig = {
        name: 'steward',
        role: 'primary',
        description: 'Steward',
        systemPrompt: 'Help the user',
        modelTier: ModelTier.SECONDARY,
      };

      expect(config.modelTier).toBe(ModelTier.SECONDARY);
    });

    it('应该允许配置执行参数', () => {
      const config: AgentConfig = {
        name: 'explore',
        role: 'subagent',
        description: 'Explorer',
        systemPrompt: 'Explore',
        execution: {
          maxLoops: 10,
          enableCompression: true,
        },
      };

      expect(config.execution?.maxLoops).toBe(10);
      expect(config.execution?.enableCompression).toBe(true);
    });

    it('应该允许配置 hidden 属性', () => {
      const config: AgentConfig = {
        name: 'build',
        role: 'primary',
        description: 'Hidden agent',
        systemPrompt: 'Secret',
        hidden: true,
      };

      expect(config.hidden).toBe(true);
    });

    it('应该允许完整配置', () => {
      const config: AgentConfig = {
        name: 'build',
        role: 'primary',
        description: 'Full config test',
        systemPromptBuilder: (ctx) => `Tools: ${ctx.tools?.length || 0}`,
        tools: {
          include: ['ReadFile'],
          exclude: ['WriteFile'],
        },
        modelTier: ModelTier.PRIMARY,
        execution: {
          maxLoops: 50,
          enableCompression: false,
        },
        hidden: false,
      };

      expect(config.name).toBe('build');
      expect(config.systemPromptBuilder).toBeDefined();
      expect(config.tools?.include).toContain('ReadFile');
      expect(config.modelTier).toBe(ModelTier.PRIMARY);
      expect(config.execution?.maxLoops).toBe(50);
    });
  });

  describe('ModelTier 枚举', () => {
    it('应该有 PRIMARY 层级', () => {
      expect(ModelTier.PRIMARY).toBeDefined();
    });

    it('应该有 SECONDARY 层级', () => {
      expect(ModelTier.SECONDARY).toBeDefined();
    });
  });
});
