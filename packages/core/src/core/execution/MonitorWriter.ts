/**
 * MonitorWriter - 监控文件写入器
 * 
 * 负责：
 * - 将 ExecutionEvent 转换为 Markdown 格式写入监控文件
 * - 管理监控文件的创建、更新
 * - 维护会话状态和统计信息
 */

import * as fs from 'fs';
import * as path from 'path';
import type { ExecutionEvent } from './events.js';
import { MonitorFileOps, type MonitorStatus } from './MonitorFileOps.js';

/** 监控写入器选项 */
export interface MonitorWriterOptions {
  /** 会话 ID */
  sessionId: string;
  /** 项目路径（用于显示） */
  projectPath?: string;
  /** 模型名称 */
  model?: string;
  /** Agent 模式 */
  agentMode?: string;
  /** 事件过滤器 */
  filter?: MonitorEventFilter;
}

/** 事件过滤器配置 */
export interface MonitorEventFilter {
  /** 包含的事件类型（白名单） */
  include?: ExecutionEvent['type'][];
  /** 排除的事件类型（黑名单） */
  exclude?: ExecutionEvent['type'][];
  /** 是否记录 content:delta（高频，默认 false） */
  includeContentDelta?: boolean;
  /** 是否记录 thinking:delta（高频，默认 false） */
  includeThinkingDelta?: boolean;
}

/** 监控统计信息 */
interface MonitorStatistics {
  totalExecutions: number;
  totalToolCalls: number;
  filesRead: number;
  filesModified: number;
  errorsCount: number;
  totalElapsedTime: number;
  totalInputTokens: number;
  totalOutputTokens: number;
}

/** 最近的用户指令 */
interface RecentCommand {
  timestamp: Date;
  command: string;
  status: 'completed' | 'in_progress' | 'error';
}

/** 最近的文件操作 */
interface RecentFile {
  path: string;
  action: 'read' | 'write' | 'create' | 'delete';
  timestamp: Date;
}

/** 默认排除的事件类型（太频繁，无实际价值） */
const DEFAULT_EXCLUDED_EVENTS: ExecutionEvent['type'][] = [
  'state:change',
  'thinking:delta',
  'content:delta',
  'stats:update',
  'tool:executing', // 和 validating 重复
  'tool:output', // 太频繁
];

/**
 * 监控文件写入器
 */
export class MonitorWriter {
  private sessionId: string;
  private filePath: string = '';
  private projectPath: string;
  private model: string;
  private agentMode: string;
  private filter: MonitorEventFilter;
  private startTime: Date;
  private initialized = false;

  // 统计信息
  private statistics: MonitorStatistics = {
    totalExecutions: 0,
    totalToolCalls: 0,
    filesRead: 0,
    filesModified: 0,
    errorsCount: 0,
    totalElapsedTime: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
  };

  // 最近的指令和文件操作
  private recentCommands: RecentCommand[] = [];
  private recentFiles: RecentFile[] = [];
  private currentCommand: string = '';
  private executionStartTime: number = 0;

  constructor(options: MonitorWriterOptions) {
    this.sessionId = options.sessionId;
    this.projectPath = options.projectPath || process.cwd();
    this.model = options.model || 'unknown';
    this.agentMode = options.agentMode || 'build';
    this.filter = options.filter || {};
    this.startTime = new Date();
  }

  /**
   * 初始化监控文件
   * - 如果文件不存在：创建 *_active.md
   * - 如果存在 *_idle.md：重命名为 *_active.md（恢复会话）
   * - 如果存在 *_active.md：继续使用
   */
  init(): void {
    // 确保目录存在
    MonitorFileOps.ensureMonitorsDir();

    // 查找该 sessionId 是否已有监控文件
    const existingFile = MonitorFileOps.findSessionFile(this.sessionId);

    if (existingFile) {
      const parsed = MonitorFileOps.parseFileName(path.basename(existingFile));

      if (parsed?.status === 'idle') {
        // 发现 idle 文件 → 重命名为 active（恢复会话）
        MonitorFileOps.setStatus(this.sessionId, 'active');
        this.filePath = MonitorFileOps.buildFilePath(this.sessionId, 'active');

        // 追加一条"会话恢复"的记录
        this.appendLine(`\n## ${this.formatTime()} 🔄 会话恢复\n`);
      } else {
        // 已经是 active，直接使用
        this.filePath = existingFile;
      }
    } else {
      // 没有现有文件 → 创建新的 active 文件
      this.filePath = MonitorFileOps.buildFilePath(this.sessionId, 'active');
      this.createNewFile();
    }

    // 清理昨天的文件
    MonitorFileOps.cleanupStaleFiles();

    this.initialized = true;
  }

  /**
   * 创建新的监控文件
   */
  private createNewFile(): void {
    const header = this.generateHeader();
    fs.writeFileSync(this.filePath, header, 'utf-8');
  }

  /**
   * 生成文件头部
   */
  private generateHeader(): string {
    const now = new Date();
    return `# Agent Monitor - session_${this.sessionId}

## 📊 当前状态
- **状态**: 🟢 运行中
- **当前任务**: -
- **最后活动**: ${this.formatTime(now)}

## 📋 会话信息
- **会话 ID**: ${this.sessionId}
- **开始时间**: ${this.formatDateTime(now)}
- **项目路径**: ${this.projectPath}
- **模型**: ${this.model}
- **模式**: ${this.agentMode}

## 📜 最近指令
（暂无）

## 📁 最近文件操作
（暂无）

---

## 执行日志

`;
  }

  /**
   * 处理执行事件
   */
  handleEvent(event: ExecutionEvent): void {
    if (!this.initialized) {
      return;
    }

    // 检查是否应该过滤此事件
    if (this.shouldFilterEvent(event)) {
      return;
    }

    // 格式化并写入事件
    const formatted = this.formatEvent(event);
    if (formatted) {
      this.appendLine(formatted);
    }

    // 更新统计信息
    this.updateStatistics(event);
  }

  /**
   * 检查是否应该过滤此事件
   */
  private shouldFilterEvent(event: ExecutionEvent): boolean {
    const eventType = event.type;

    // 检查白名单
    if (this.filter.include && this.filter.include.length > 0) {
      return !this.filter.include.includes(eventType);
    }

    // 检查黑名单
    const excludeList = this.filter.exclude || DEFAULT_EXCLUDED_EVENTS;
    if (excludeList.includes(eventType)) {
      return true;
    }

    // 特殊处理高频事件
    if (eventType === 'content:delta' && !this.filter.includeContentDelta) {
      return true;
    }
    if (eventType === 'thinking:delta' && !this.filter.includeThinkingDelta) {
      return true;
    }

    return false;
  }

  /**
   * 格式化事件为 Markdown
   */
  private formatEvent(event: ExecutionEvent): string | null {
    const timestamp = this.formatTime();

    switch (event.type) {
      case 'execution:start':
        this.executionStartTime = event.timestamp;
        this.statistics.totalExecutions++;
        return `\n## ${timestamp} 🚀 执行开始\n`;

      case 'execution:complete': {
        const elapsed = event.stats.elapsedTime;
        this.statistics.totalElapsedTime += elapsed;
        if (event.stats.inputTokens) {
          this.statistics.totalInputTokens += event.stats.inputTokens;
        }
        if (event.stats.outputTokens) {
          this.statistics.totalOutputTokens += event.stats.outputTokens;
        }

        // 更新当前指令状态
        this.updateCurrentCommandStatus('completed');

        return `\n## ${timestamp} 🏁 执行完成\n` +
          `- 总耗时: ${elapsed}s\n` +
          `- 工具调用: ${event.stats.toolCallCount} 次\n` +
          `- Token: 输入 ${event.stats.inputTokens?.toLocaleString() || 0} / 输出 ${event.stats.outputTokens?.toLocaleString() || 0}\n`;
      }

      case 'execution:error':
        this.statistics.errorsCount++;
        this.updateCurrentCommandStatus('error');
        return `\n## ${timestamp} ❌ 执行错误\n- 错误: ${event.error}\n`;

      case 'execution:cancel':
        return `\n## ${timestamp} ⏹️ 执行取消\n${event.reason ? `- 原因: ${event.reason}\n` : ''}`;

      case 'thinking:start':
        return `\n### ${timestamp} 💭 开始思考\n`;

      case 'thinking:complete': {
        // 截取思考内容的摘要
        const summary = event.thinkingContent.slice(0, 150);
        return `### ${timestamp} 💭 思考完成\n` +
          `> ${summary}${event.thinkingContent.length > 150 ? '...' : ''}\n`;
      }

      case 'tool:validating':
        this.statistics.totalToolCalls++;
        this.trackFileOperation(event.toolCall.toolName, event.toolCall.paramsSummary);
        return `\n### ${timestamp} 🔧 ${event.toolCall.toolName}\n` +
          `- 参数: ${event.toolCall.paramsSummary}\n`;

      case 'tool:complete': {
        const duration = event.toolCall.duration || 0;
        return `### ${timestamp} ✅ ${event.toolCall.toolName} 完成\n` +
          `- 耗时: ${duration}ms\n` +
          `- 结果: ${event.toolCall.resultSummary || '成功'}\n`;
      }

      case 'tool:error':
        this.statistics.errorsCount++;
        return `\n### ${timestamp} ❌ 工具错误\n- 错误: ${event.error}\n`;

      case 'tool:cancelled':
        return `\n### ${timestamp} ⏹️ ${event.toolName} 已取消\n` +
          `- 原因: ${event.reason}\n`;

      case 'tool:awaiting_approval':
        return `\n### ${timestamp} ⏸️ 等待确认\n` +
          `- 工具: ${event.toolName}\n`;

      case 'content:complete': {
        // 截取输出内容的摘要
        const summary = event.content.slice(0, 200);
        return `\n### ${timestamp} 💬 Agent 回复\n` +
          `> ${summary}${event.content.length > 200 ? '...' : ''}\n`;
      }

      case 'compression:start':
        return `\n### ${timestamp} 🗜️ 开始压缩\n- Token 使用: ${event.tokenUsage}\n`;

      case 'compression:complete':
        return `### ${timestamp} 🗜️ 压缩完成\n` +
          `- 原始 Token: ${event.result.originalTokens}\n` +
          `- 压缩后: ${event.result.compressedTokens}\n` +
          `- 节省: ${event.result.savedPercentage}%\n`;

      default:
        return null;
    }
  }

  /**
   * 跟踪文件操作
   */
  private trackFileOperation(toolName: string, params: string): void {
    let action: 'read' | 'write' | 'create' | 'delete' = 'read';

    if (toolName === 'ReadFile' || toolName === 'ReadManyFiles' || toolName === 'ListFiles') {
      action = 'read';
      this.statistics.filesRead++;
    } else if (toolName === 'WriteFile') {
      action = 'write';
      this.statistics.filesModified++;
    }

    // 提取文件路径（简单的正则匹配）
    const pathMatch = params.match(/(?:\/|\.\/)[^\s,]+/);
    if (pathMatch) {
      this.addRecentFile(pathMatch[0], action);
    }
  }

  /**
   * 添加最近文件操作记录
   */
  private addRecentFile(filePath: string, action: 'read' | 'write' | 'create' | 'delete'): void {
    this.recentFiles.unshift({
      path: filePath,
      action,
      timestamp: new Date(),
    });

    // 保留最多 10 条
    if (this.recentFiles.length > 10) {
      this.recentFiles.pop();
    }
  }

  /**
   * 设置当前用户指令
   */
  setCurrentCommand(command: string): void {
    this.currentCommand = command;

    // 添加到最近指令列表
    this.recentCommands.unshift({
      timestamp: new Date(),
      command: command.slice(0, 50) + (command.length > 50 ? '...' : ''),
      status: 'in_progress',
    });

    // 保留最多 5 条
    if (this.recentCommands.length > 5) {
      this.recentCommands.pop();
    }

    // 更新文件头部
    this.updateHeader();
  }

  /**
   * 更新当前指令状态
   */
  private updateCurrentCommandStatus(status: 'completed' | 'error'): void {
    if (this.recentCommands.length > 0) {
      this.recentCommands[0].status = status;
    }
  }

  /**
   * 更新统计信息
   */
  private updateStatistics(event: ExecutionEvent): void {
    // 统计信息在 formatEvent 中更新
  }

  /**
   * 更新文件头部（状态、最近指令等）
   */
  private updateHeader(): void {
    if (!this.initialized || !fs.existsSync(this.filePath)) {
      return;
    }

    try {
      const content = fs.readFileSync(this.filePath, 'utf-8');
      
      // 找到 "---" 分隔符的位置
      const separatorIndex = content.indexOf('\n---\n');
      if (separatorIndex === -1) {
        return;
      }

      // 生成新的头部
      const newHeader = this.generateUpdatedHeader();
      
      // 保留分隔符之后的内容
      const logContent = content.slice(separatorIndex);
      
      fs.writeFileSync(this.filePath, newHeader + logContent, 'utf-8');
    } catch {
      // 忽略更新失败
    }
  }

  /**
   * 生成更新后的头部
   */
  private generateUpdatedHeader(): string {
    const now = new Date();
    const statusEmoji = this.statistics.errorsCount > 0 ? '🟡' : '🟢';
    const status = this.statistics.errorsCount > 0 ? '有错误' : '运行中';

    // 格式化最近指令
    const commandsStr = this.recentCommands.length > 0
      ? this.recentCommands.map((cmd, i) => {
          const statusIcon = cmd.status === 'completed' ? '✅' :
            cmd.status === 'error' ? '❌' : '⏳';
          return `${i + 1}. [${this.formatTime(cmd.timestamp)}] ${cmd.command} ${statusIcon}`;
        }).join('\n')
      : '（暂无）';

    // 格式化最近文件操作
    const filesStr = this.recentFiles.length > 0
      ? this.recentFiles.map(f => {
          const actionIcon = f.action === 'read' ? '📖' : '📝';
          return `- [${this.formatTime(f.timestamp)}] ${actionIcon} ${f.path}`;
        }).join('\n')
      : '（暂无）';

    return `# Agent Monitor - session_${this.sessionId}

## 📊 当前状态
- **状态**: ${statusEmoji} ${status}
- **当前任务**: ${this.currentCommand || '-'}
- **最后活动**: ${this.formatTime(now)}

## 📋 会话信息
- **会话 ID**: ${this.sessionId}
- **开始时间**: ${this.formatDateTime(this.startTime)}
- **项目路径**: ${this.projectPath}
- **模型**: ${this.model}
- **模式**: ${this.agentMode}

## 📜 最近指令
${commandsStr}

## 📁 最近文件操作
${filesStr}

`;
  }

  /**
   * 追加一行到文件
   */
  private appendLine(line: string): void {
    if (!this.initialized || !this.filePath) {
      return;
    }

    try {
      fs.appendFileSync(this.filePath, line, 'utf-8');
    } catch {
      // 忽略写入失败
    }
  }

  /**
   * 格式化时间（HH:mm:ss）
   */
  private formatTime(date?: Date): string {
    const d = date || new Date();
    return d.toTimeString().slice(0, 8);
  }

  /**
   * 格式化日期时间（YYYY-MM-DD HH:mm:ss）
   */
  private formatDateTime(date: Date): string {
    return date.toISOString().replace('T', ' ').slice(0, 19);
  }

  /**
   * 将文件标记为 idle 状态
   */
  markAsIdle(): void {
    if (this.initialized) {
      MonitorFileOps.setStatus(this.sessionId, 'idle');
    }
  }

  /**
   * 获取当前文件路径
   */
  getFilePath(): string {
    return this.filePath;
  }

  /**
   * 获取统计信息
   */
  getStatistics(): MonitorStatistics {
    return { ...this.statistics };
  }

  /**
   * 检查是否已初始化
   */
  isInitialized(): boolean {
    return this.initialized;
  }
}
