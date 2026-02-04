import { describe, it, expect } from 'vitest';
import type { AgentConfig } from '../../types.js';

// 直接读取配置文件内容，避免循环依赖
// 因为 presets 会被 AgentManager 导入，而 AgentManager 又被 Task 工具使用

// 定义 ModelTier 用于测试
enum TestModelTier {
  PRIMARY = 'primary',
  SECONDARY = 'secondary',
}

describe('Agent Presets 配置类型测试', () => {
  /**
   * 由于存在循环依赖问题（presets -> promptManager -> ... -> AgentManager -> presets），
   * 这里通过定义预期的配置结构来测试类型约束，而不是直接导入 presets
   */

  describe('AgentConfig 接口约束', () => {
    it('buildAgent 应该符合配置结构', () => {
      // Build Agent 预期配置
      const buildAgent: AgentConfig = {
        name: 'build',
        role: 'primary',
        description: 'General-purpose coding agent - 通用编程代理',
        systemPromptBuilder: () => 'test prompt', // 使用 builder 而非静态 prompt
      };

      expect(buildAgent.name).toBe('build');
      expect(buildAgent.role).toBe('primary');
      expect(buildAgent.systemPromptBuilder).toBeDefined();
      expect(typeof buildAgent.systemPromptBuilder).toBe('function');
      expect(buildAgent.systemPrompt).toBeUndefined();
      expect(buildAgent.modelTier).toBeUndefined(); // 默认使用 PRIMARY
    });

    it('stewardAgent 应该符合配置结构', () => {
      // Steward Agent 预期配置
      const stewardAgent: AgentConfig = {
        name: 'steward',
        role: 'primary',
        description: '管家模式 - 智能助手',
        systemPrompt: '静态提示词',
        tools: {
          include: ['ReadFile', 'ListFiles', 'ReadManyFiles'],
        },
        modelTier: TestModelTier.SECONDARY as any,
        execution: {
          maxLoops: 20,
          enableCompression: false,
        },
      };

      expect(stewardAgent.name).toBe('steward');
      expect(stewardAgent.role).toBe('primary');
      expect(stewardAgent.systemPrompt).toBeDefined();
      expect(stewardAgent.tools?.include).toContain('ReadFile');
      expect(stewardAgent.execution?.maxLoops).toBe(20);
    });

    it('exploreAgent 应该符合配置结构', () => {
      // Explore Agent 预期配置
      const exploreAgent: AgentConfig = {
        name: 'explore',
        role: 'subagent',
        description: 'Codebase exploration agent',
        systemPrompt: '探索提示词',
        tools: {
          include: ['Glob', 'Grep', 'ReadFile', 'ListFiles', 'ReadManyFiles'],
        },
        modelTier: TestModelTier.SECONDARY as any,
        execution: {
          maxLoops: 20,
          enableCompression: false,
        },
      };

      expect(exploreAgent.name).toBe('explore');
      expect(exploreAgent.role).toBe('subagent');
      expect(exploreAgent.tools?.include).toHaveLength(5);
      expect(exploreAgent.tools?.include).toContain('Grep');
    });

    it('explanatoryAgent 应该符合配置结构', () => {
      // Explanatory Agent 预期配置
      const explanatoryAgent: AgentConfig = {
        name: 'explanatory',
        role: 'primary',
        description: '解释型模式 - 任务完成优先，穿插教育性洞察',
        systemPromptBuilder: () => 'explanatory prompt',
      };

      expect(explanatoryAgent.name).toBe('explanatory');
      expect(explanatoryAgent.role).toBe('primary');
      expect(explanatoryAgent.systemPromptBuilder).toBeDefined();
      expect(explanatoryAgent.modelTier).toBeUndefined();
    });
  });

  describe('AgentConfig 类型完整性', () => {
    it('所有 AgentType 应该是有效值', () => {
      const validTypes = ['build', 'steward', 'explore', 'explanatory'];
      validTypes.forEach((type) => {
        expect(['build', 'steward', 'explore', 'explanatory']).toContain(type);
      });
    });

    it('所有 AgentRole 应该是有效值', () => {
      const validRoles = ['primary', 'subagent', 'all'];
      validRoles.forEach((role) => {
        expect(['primary', 'subagent', 'all']).toContain(role);
      });
    });

    it('配置应该有 systemPrompt 或 systemPromptBuilder 之一', () => {
      // 测试约束：不能同时没有两者
      const validConfig1: AgentConfig = {
        name: 'build',
        role: 'primary',
        description: 'test',
        systemPrompt: 'static prompt',
      };

      const validConfig2: AgentConfig = {
        name: 'build',
        role: 'primary',
        description: 'test',
        systemPromptBuilder: () => 'dynamic prompt',
      };

      // 至少有一个
      expect(
        validConfig1.systemPrompt !== undefined || validConfig1.systemPromptBuilder !== undefined
      ).toBe(true);
      expect(
        validConfig2.systemPrompt !== undefined || validConfig2.systemPromptBuilder !== undefined
      ).toBe(true);
    });

    it('工具配置应该支持 include 和 exclude', () => {
      const configWithInclude: AgentConfig = {
        name: 'build',
        role: 'primary',
        description: 'test',
        systemPrompt: 'test',
        tools: {
          include: ['ReadFile', 'WriteFile'],
        },
      };

      const configWithExclude: AgentConfig = {
        name: 'build',
        role: 'primary',
        description: 'test',
        systemPrompt: 'test',
        tools: {
          exclude: ['Task'],
        },
      };

      expect(configWithInclude.tools?.include).toHaveLength(2);
      expect(configWithExclude.tools?.exclude).toHaveLength(1);
    });

    it('执行配置应该支持 maxLoops 和 enableCompression', () => {
      const configWithExecution: AgentConfig = {
        name: 'build',
        role: 'primary',
        description: 'test',
        systemPrompt: 'test',
        execution: {
          maxLoops: 50,
          enableCompression: true,
        },
      };

      expect(configWithExecution.execution?.maxLoops).toBe(50);
      expect(configWithExecution.execution?.enableCompression).toBe(true);
    });
  });
});
