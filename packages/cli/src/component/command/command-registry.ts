import type { ReactNode } from 'react';
import fuzzysort from 'fuzzysort';
import { logger } from '../../util/logger.js';

/**
 * 命令定义接口
 */
export interface CommandDef {
  id: string;
  name: string; // 命令名（不含 /）
  label: string;
  description: string;
  category: string;

  // 命令类型
  type: 'instant' | 'panel';

  // Instant 命令的处理函数
  action?: () => void;

  // Panel 命令的面板组件工厂（推荐使用）
  panelFactory?: (onClose: () => void) => ReactNode;

  // Panel 命令的面板组件（向后兼容，将被废弃）
  panel?: ReactNode;
}

/**
 * 命令注册表类
 * 负责管理所有命令的注册、查询和执行
 */
class CommandRegistry {
  private commands: Map<string, CommandDef> = new Map();

  /**
   * 注册命令
   */
  register(command: CommandDef): void {
    if (this.commands.has(command.name)) {
      logger.warn(`Command "${command.name}" already registered, overwriting...`);
    }
    this.commands.set(command.name, command);
  }

  /**
   * 批量注册命令
   */
  registerMany(commands: CommandDef[]): void {
    commands.forEach((cmd) => this.register(cmd));
  }

  /**
   * 获取命令
   */
  get(name: string): CommandDef | undefined {
    return this.commands.get(name);
  }

  /**
   * 获取所有命令
   */
  getAll(): CommandDef[] {
    return Array.from(this.commands.values());
  }

  /**
   * 模糊搜索命令
   * @param query 搜索关键词
   * @returns 匹配的命令列表（按相关度排序）
   */
  search(query: string): CommandDef[] {
    const allCommands = this.getAll();

    // 如果查询为空，返回所有命令
    if (!query.trim()) {
      return allCommands;
    }

    // 使用 fuzzysort 进行模糊搜索
    const results = fuzzysort.go(query, allCommands, {
      keys: ['name', 'label', 'description', 'category'],
      threshold: -10000,
    });

    return results.map((r) => r.obj);
  }

  /**
   * 按分类获取命令
   */
  getByCategory(category: string): CommandDef[] {
    return this.getAll().filter((cmd) => cmd.category === category);
  }

  /**
   * 获取所有分类
   */
  getCategories(): string[] {
    const categories = new Set<string>();
    this.getAll().forEach((cmd) => categories.add(cmd.category));
    return Array.from(categories).sort();
  }

  /**
   * 执行命令（仅用于 instant 类型）
   * 注意：panel 类型的命令需要在外部处理
   */
  execute(name: string): boolean {
    const command = this.get(name);
    if (!command) {
      logger.warn(`Command "${name}" not found`);
      return false;
    }

    if (command.type === 'instant' && command.action) {
      command.action();
      return true;
    }

    return false;
  }

  /**
   * 清空所有命令
   */
  clear(): void {
    this.commands.clear();
  }

  /**
   * 获取命令数量
   */
  get size(): number {
    return this.commands.size;
  }
}

/**
 * 全局命令注册表实例
 */
export const commandRegistry = new CommandRegistry();
