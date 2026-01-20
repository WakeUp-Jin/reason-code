# 性能测试脚本

本目录包含用于测试不同运行时环境下 ripgrep 工具性能的基准测试脚本。

## 测试脚本

### benchmark.js
主要的性能测试脚本，测试以下场景：
- 子进程创建速度
- 搜索执行时间
- 内存使用情况
- 启动时间对比

### 运行测试

```bash
# Node.js 环境
node benchmark.js

# Bun 环境
bun run benchmark.js

# Deno 环境
deno run --allow-all benchmark.js
```

## 测试结果示例

```
=== 运行时性能对比 ===
运行时: bun
子进程创建: 2,208 ops/sec (3.4x faster)
启动时间: 8ms (5x faster)
内存使用: 45MB (30% lower)

运行时: node
子进程创建: 651 ops/sec (baseline)
启动时间: 42ms (baseline)
内存使用: 65MB (baseline)
```

## 测试环境要求

- Node.js >= 18.0.0
- Bun >= 1.0.0 (可选)
- Deno >= 1.40.0 (可选)
- ripgrep 工具已安装
