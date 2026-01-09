import { ContextType, Message } from '../types.js';
import { logger } from '../../../utils/logger.js';

/**
 * 基础上下文抽象类
 * 提供所有上下文模块的通用功能
 * 简化版：移除复杂的 ContextItem 包装，直接存储内容
 */
export abstract class BaseContext<T = Message> {
  /** 上下文类型 */
  public readonly type: ContextType;

  /** 存储内容的数组 */
  protected items: T[] = [];

  constructor(type: ContextType) {
    this.type = type;
    logger.debug(`初始化上下文模块: ${type}`);
  }

  /**
   * 添加内容
   */
  add(content: T): void {
    this.items.push(content);
    logger.debug(`添加内容到 ${this.type}: ${this.items.length} 项`);
  }

  /**
   * 获取所有内容
   */
  getAll(): T[] {
    return [...this.items];
  }

  /**
   * 获取指定索引的内容
   */
  get(index: number): T | undefined {
    if (index < 0 || index >= this.items.length) {
      return undefined;
    }
    return this.items[index];
  }

  /**
   * 清空所有内容
   */
  clear(): void {
    const count = this.items.length;
    this.items = [];
    logger.debug(`清空 ${this.type} 上下文: 移除了 ${count} 项`);
  }

  /**
   * 获取内容数量
   */
  getCount(): number {
    return this.items.length;
  }

  /**
   * 检查是否为空
   */
  isEmpty(): boolean {
    return this.items.length === 0;
  }

  /**
   * 移除最后一项并返回
   */
  removeLast(): T | undefined {
    if (this.items.length > 0) {
      const item = this.items.pop();
      logger.debug(`从 ${this.type} 移除最后一项`);
      return item;
    }
    return undefined;
  }

  /**
   * 替换所有内容
   */
  replace(items: T[]): void {
    this.items = [...items];
    logger.debug(`替换 ${this.type} 上下文: ${this.items.length} 项`);
  }

  /**
   * 切片获取部分内容
   */
  slice(start?: number, end?: number): T[] {
    return this.items.slice(start, end);
  }

  /**
   * 格式化为 Message 数组（由子类实现）
   */
  abstract format(): Message[];
}
