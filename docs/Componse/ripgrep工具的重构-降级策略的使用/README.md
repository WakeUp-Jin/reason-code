# Ripgrep 工具重构 - 降级策略的使用

## 背景

在开发 CLI 工具时，我们发现 Bun 在子进程 spawn 性能方面显著优于 Node.js，但需要考虑用户环境的兼容性。本文档描述了如何实现运行时检测和降级策略。

## 性能对比数据

### 子进程 Spawn 性能
| 运行时 | 请求/秒 | 性能提升 |
|--------|---------|----------|
| Node.js | 651 | 基准 |
| Bun | 2,208 | 3.4x |
| Deno | 2,290 | 3.5x |

### 启动时间对比
| 运行时 | 启动时间 | 性能提升 |
|--------|----------|----------|
| Node.js | ~42ms | 基准 |
| Bun | ~8ms | 5x |
| Deno | ~35ms | 1.2x |

### 内存效率
- **Bun**: 显著更低的内存占用
- **启动开销**: Bun 子进程创建开销更小

## 实现策略

### 1. 运行时检测

```javascript
// 检测当前运行环境
const isBun = typeof Bun !== 'undefined';
const isDeno = typeof Deno !== 'undefined';

// 根据环境选择最优实现
const createProcess = isBun 
  ? createBunProcess
  : isDeno 
    ? createDenoProcess 
    : createNodeProcess;
```

### 2. Bun 优化实现

```javascript
function createBunProcess(cmd, args, opts) {
  return Bun.spawn([cmd, ...args], {
    cwd: opts.cwd,
    stdout: 'pipe',
    stderr: opts.stdio[2] === 'pipe' ? 'pipe' : 'ignore'
  });
}
```

### 3. Node.js 兼容实现

```javascript
function createNodeProcess(cmd, args, opts) {
  return spawn(cmd, args, {
    cwd: opts.cwd,
    stdio: ['ignore', 'pipe', 'ignore'],
    windowsHide: true
  });
}
```

### 4. 统一接口

```javascript
class ProcessManager {
  constructor() {
    this.runtime = this.detectRuntime();
  }

  detectRuntime() {
    if (typeof Bun !== 'undefined') return 'bun';
    if (typeof Deno !== 'undefined') return 'deno';
    return 'node';
  }

  spawn(command, args, options) {
    switch (this.runtime) {
      case 'bun':
        return this.spawnBun(command, args, options);
      case 'deno':
        return this.spawnDeno(command, args, options);
      default:
        return this.spawnNode(command, args, options);
    }
  }
}
```

## 发布策略

### 方案一：双版本发布
```json
{
  "name": "your-package",
  "version": "1.0.0",
  "engines": {
    "node": ">=18.0.0"
  }
}
```

```json
{
  "name": "your-package-bun",
  "version": "1.0.0",
  "engines": {
    "bun": ">=1.0.0"
  },
  "preferredRuntime": "bun"
}
```

### 方案二：智能检测（推荐）
```json
{
  "name": "your-package",
  "version": "1.0.0",
  "engines": {
    "bun": ">=1.0.0",
    "node": ">=18.0.0"
  },
  "preferredRuntime": "bun",
  "scripts": {
    "start": "bun run index.js || node index.js"
  }
}
```

## 使用建议

### 推荐使用 Bun 的场景
- ✅ 新的 CLI 工具项目
- ✅ 需要频繁 spawn 子进程
- ✅ 对启动速度敏感的应用
- ✅ 内存资源受限的环境

### 保持 Node.js 的场景
- ❌ 现有复杂项目（迁移成本高）
- ❌ 依赖大量 Node.js 特定包
- ❌ 团队对 Bun 不熟悉
- ❌ 生产环境稳定性要求极高

## 实施步骤

1. **评估项目需求**
   - 分析子进程使用频率
   - 评估启动时间重要性
   - 检查依赖兼容性

2. **实现运行时检测**
   - 添加环境检测逻辑
   - 实现多运行时适配器
   - 保持 API 一致性

3. **测试验证**
   - 在 Bun 环境测试
   - 在 Node.js 环境测试
   - 性能基准测试

4. **文档更新**
   - 更新安装说明
   - 添加性能对比
   - 提供迁移指南

## 注意事项

- **兼容性**: 确保核心功能在所有运行时都能正常工作
- **错误处理**: 优雅处理运行时特定的错误
- **测试覆盖**: 在多个运行时环境下测试
- **文档维护**: 保持文档与实现同步

## 结论

通过实现运行时检测和降级策略，我们可以：
- 为 Bun 用户提供 3-5x 的性能提升
- 保持对 Node.js 用户的完全兼容
- 实现渐进式的现代化升级路径
- 降低迁移风险和成本

这种策略特别适合 CLI 工具和需要频繁子进程操作的应用场景。
