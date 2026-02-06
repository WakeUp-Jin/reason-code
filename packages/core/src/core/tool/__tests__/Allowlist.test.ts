import { describe, it, expect, beforeEach } from 'vitest';
import { Allowlist } from '../Allowlist.js';

describe('Allowlist 测试', () => {
  let allowlist: Allowlist;

  beforeEach(() => {
    allowlist = new Allowlist();
  });

  describe('基础功能', () => {
    it('应该成功创建 Allowlist 实例', () => {
      expect(allowlist).toBeDefined();
      expect(allowlist).toBeInstanceOf(Allowlist);
    });

    it('初始状态应该为空', () => {
      expect(allowlist.size).toBe(0);
      expect(allowlist.getAll()).toEqual([]);
    });
  });

  describe('has 方法', () => {
    it('应该对不存在的 key 返回 false', () => {
      expect(allowlist.has('git')).toBe(false);
      expect(allowlist.has('npm')).toBe(false);
    });

    it('应该对已添加的 key 返回 true', () => {
      allowlist.add('git');
      expect(allowlist.has('git')).toBe(true);
    });
  });

  describe('add 方法', () => {
    it('应该能添加单个 key', () => {
      allowlist.add('git');
      expect(allowlist.has('git')).toBe(true);
      expect(allowlist.size).toBe(1);
    });

    it('应该能添加多个 key', () => {
      allowlist.add('git');
      allowlist.add('npm');
      allowlist.add('yarn');
      expect(allowlist.size).toBe(3);
      expect(allowlist.has('git')).toBe(true);
      expect(allowlist.has('npm')).toBe(true);
      expect(allowlist.has('yarn')).toBe(true);
    });

    it('重复添加相同 key 不应该增加数量', () => {
      allowlist.add('git');
      allowlist.add('git');
      allowlist.add('git');
      expect(allowlist.size).toBe(1);
    });
  });

  describe('remove 方法', () => {
    it('应该能移除已存在的 key', () => {
      allowlist.add('git');
      const result = allowlist.remove('git');
      expect(result).toBe(true);
      expect(allowlist.has('git')).toBe(false);
      expect(allowlist.size).toBe(0);
    });

    it('移除不存在的 key 应该返回 false', () => {
      const result = allowlist.remove('nonexistent');
      expect(result).toBe(false);
    });

    it('移除后应该不影响其他 key', () => {
      allowlist.add('git');
      allowlist.add('npm');
      allowlist.remove('git');
      expect(allowlist.has('git')).toBe(false);
      expect(allowlist.has('npm')).toBe(true);
      expect(allowlist.size).toBe(1);
    });
  });

  describe('clear 方法', () => {
    it('应该能清空所有条目', () => {
      allowlist.add('git');
      allowlist.add('npm');
      allowlist.add('yarn');
      expect(allowlist.size).toBe(3);

      allowlist.clear();
      expect(allowlist.size).toBe(0);
      expect(allowlist.has('git')).toBe(false);
      expect(allowlist.has('npm')).toBe(false);
    });

    it('清空空的 allowlist 不应该报错', () => {
      expect(() => allowlist.clear()).not.toThrow();
      expect(allowlist.size).toBe(0);
    });
  });

  describe('size 属性', () => {
    it('应该正确反映条目数量', () => {
      expect(allowlist.size).toBe(0);

      allowlist.add('a');
      expect(allowlist.size).toBe(1);

      allowlist.add('b');
      expect(allowlist.size).toBe(2);

      allowlist.remove('a');
      expect(allowlist.size).toBe(1);

      allowlist.clear();
      expect(allowlist.size).toBe(0);
    });
  });

  describe('getAll 方法', () => {
    it('应该返回所有条目的数组', () => {
      allowlist.add('git');
      allowlist.add('npm');
      const all = allowlist.getAll();
      expect(all).toHaveLength(2);
      expect(all).toContain('git');
      expect(all).toContain('npm');
    });

    it('应该返回空数组当没有条目时', () => {
      expect(allowlist.getAll()).toEqual([]);
    });

    it('返回的数组应该是副本（修改不影响原数据）', () => {
      allowlist.add('git');
      const all = allowlist.getAll();
      all.push('npm');
      expect(allowlist.size).toBe(1);
      expect(allowlist.has('npm')).toBe(false);
    });
  });

  describe('使用场景测试', () => {
    it('Shell 工具场景：存储已批准的命令', () => {
      // 用户批准了 git 命令
      allowlist.add('git');

      // 后续 git 命令不需要再次确认
      expect(allowlist.has('git')).toBe(true);

      // npm 命令仍需确认
      expect(allowlist.has('npm')).toBe(false);

      // 用户批准 npm
      allowlist.add('npm');
      expect(allowlist.has('npm')).toBe(true);
    });

    it('MCP 工具场景：存储已批准的服务器', () => {
      // 批准 filesystem 服务器
      allowlist.add('mcp:filesystem');

      // 批准 github 服务器
      allowlist.add('mcp:github');

      expect(allowlist.has('mcp:filesystem')).toBe(true);
      expect(allowlist.has('mcp:github')).toBe(true);
      expect(allowlist.has('mcp:slack')).toBe(false);
    });
  });
});
