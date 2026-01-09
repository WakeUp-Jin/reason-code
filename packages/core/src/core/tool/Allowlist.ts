/**
 * Allowlist 类 - 管理会话级的权限白名单
 * 用于存储用户已批准的操作，避免重复确认
 *
 * 使用场景：
 * - Shell 工具：存储已批准的命令根名称（如 git, npm）
 * - MCP 工具：存储已批准的服务器名称或工具标识符
 * - 其他需要权限确认的工具
 */
export class Allowlist {
  private entries: Set<string> = new Set();

  /**
   * 检查 key 是否在白名单中
   * @param key - 要检查的标识符
   */
  has(key: string): boolean {
    return this.entries.has(key);
  }

  /**
   * 添加 key 到白名单
   * @param key - 要添加的标识符
   */
  add(key: string): void {
    this.entries.add(key);
  }

  /**
   * 移除 key
   * @param key - 要移除的标识符
   * @returns 是否成功移除
   */
  remove(key: string): boolean {
    return this.entries.delete(key);
  }

  /**
   * 清空白名单
   */
  clear(): void {
    this.entries.clear();
  }

  /**
   * 获取条目数量
   */
  get size(): number {
    return this.entries.size;
  }

  /**
   * 获取所有条目（调试用）
   */
  getAll(): string[] {
    return Array.from(this.entries);
  }
}

