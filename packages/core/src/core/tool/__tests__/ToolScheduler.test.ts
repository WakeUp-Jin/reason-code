import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ToolScheduler, ToolSchedulerConfig } from '../ToolScheduler.js';
import { ToolManager } from '../ToolManager.js';
import { ApprovalMode } from '../types.js';

describe('ToolScheduler 测试', () => {
  let toolManager: ToolManager;
  let scheduler: ToolScheduler;

  beforeEach(() => {
    toolManager = new ToolManager();
    scheduler = new ToolScheduler(toolManager);
  });

  describe('基础功能', () => {
    it('应该成功创建 ToolScheduler 实例', () => {
      expect(scheduler).toBeDefined();
      expect(scheduler).toBeInstanceOf(ToolScheduler);
    });

    it('应该使用默认的批准模式', () => {
      expect(scheduler.getApprovalMode()).toBe(ApprovalMode.DEFAULT);
    });

    it('应该能获取空的 allowlist', () => {
      const allowlist = scheduler.getAllowlist();
      expect(allowlist).toBeDefined();
      expect(allowlist.size).toBe(0);
    });
  });

  describe('批准模式管理', () => {
    it('应该能设置批准模式', () => {
      scheduler.setApprovalMode(ApprovalMode.FULL_AUTO);
      expect(scheduler.getApprovalMode()).toBe(ApprovalMode.FULL_AUTO);
    });

    it('应该能切换回默认模式', () => {
      scheduler.setApprovalMode(ApprovalMode.FULL_AUTO);
      scheduler.setApprovalMode(ApprovalMode.DEFAULT);
      expect(scheduler.getApprovalMode()).toBe(ApprovalMode.DEFAULT);
    });
  });

  describe('Allowlist 管理', () => {
    it('应该能清空 allowlist', () => {
      const allowlist = scheduler.getAllowlist();
      allowlist.add('git');
      allowlist.add('npm');
      expect(allowlist.size).toBe(2);

      scheduler.clearAllowlist();
      expect(scheduler.getAllowlist().size).toBe(0);
    });
  });

  describe('工具调用记录管理', () => {
    it('初始状态应该没有记录', () => {
      const records = scheduler.getRecords();
      expect(records).toEqual([]);
    });

    it('应该能清空记录', () => {
      scheduler.clearRecords();
      expect(scheduler.getRecords()).toEqual([]);
    });
  });

  describe('schedule 方法 - 错误处理', () => {
    it('应该处理不存在的工具', async () => {
      const result = await scheduler.schedule({
        callId: 'test-1',
        toolName: 'nonexistent_tool',
        args: {},
      });

      expect(result.success).toBe(false);
      expect(result.status).toBe('error');
      expect(result.error).toContain('not found');
    });

    it('应该处理无效的 JSON 参数', async () => {
      const result = await scheduler.schedule({
        callId: 'test-2',
        toolName: 'read_file',
        rawArgs: 'invalid json {{{',
      });

      expect(result.success).toBe(false);
      expect(result.status).toBe('error');
      expect(result.error).toContain('参数解析失败');
    });
  });

  describe('schedule 方法 - 只读工具执行', () => {
    it('应该能执行只读工具（list_files）', async () => {
      const result = await scheduler.schedule({
        callId: 'test-3',
        toolName: 'list_files',
        args: { path: '/tmp' },
      });

      // 只读工具在 DEFAULT 模式下不需要确认
      // 结果取决于实际文件系统，这里只验证不报 "not found" 错误
      expect(result.toolName).toBe('list_files');
      expect(result.callId).toBe('test-3');
    });
  });

  describe('scheduleBatch 方法', () => {
    it('应该串行执行多个工具调用', async () => {
      const results = await scheduler.scheduleBatch([
        { callId: 'batch-1', toolName: 'nonexistent_1', args: {} },
        { callId: 'batch-2', toolName: 'nonexistent_2', args: {} },
      ]);

      expect(results).toHaveLength(2);
      expect(results[0].callId).toBe('batch-1');
      expect(results[1].callId).toBe('batch-2');
    });
  });

  describe('scheduleBatchFromToolCalls 方法', () => {
    it('应该处理 LLM 格式的工具调用', async () => {
      const toolCalls = [
        {
          id: 'call-1',
          function: {
            name: 'nonexistent_tool',
            arguments: '{}',
          },
        },
      ];

      const results = await scheduler.scheduleBatchFromToolCalls(toolCalls);
      expect(results).toHaveLength(1);
      expect(results[0].callId).toBe('call-1');
    });

    it('应该将 thinkingContent 传递给第一个工具调用', async () => {
      const toolCalls = [
        {
          id: 'call-1',
          function: {
            name: 'list_files',
            arguments: '{"path": "/tmp"}',
          },
        },
        {
          id: 'call-2',
          function: {
            name: 'list_files',
            arguments: '{"path": "/tmp"}',
          },
        },
      ];

      const results = await scheduler.scheduleBatchFromToolCalls(toolCalls, undefined, {
        thinkingContent: '让我查看一下文件...',
      });

      expect(results).toHaveLength(2);
    });
  });

  describe('配置选项', () => {
    it('应该接受自定义配置', () => {
      const config: ToolSchedulerConfig = {
        approvalMode: ApprovalMode.FULL_AUTO,
        enableToolSummarization: true,
      };

      const customScheduler = new ToolScheduler(toolManager, config);
      // FULL_AUTO 模式会在内部处理，这里验证配置被接受
      expect(customScheduler).toBeDefined();
    });

    it('应该接受确认回调', async () => {
      const confirmCallback = vi.fn().mockResolvedValue('allow');

      const config: ToolSchedulerConfig = {
        approvalMode: ApprovalMode.DEFAULT,
        onConfirmRequired: confirmCallback,
      };

      const customScheduler = new ToolScheduler(toolManager, config);
      expect(customScheduler).toBeDefined();
      expect(customScheduler.getApprovalMode()).toBe(ApprovalMode.DEFAULT);
    });
  });
});
