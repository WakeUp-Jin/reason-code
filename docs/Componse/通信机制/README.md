# 通信机制设计文档

本文档描述了项目的通信架构设计，包括当前实现和未来扩展方案。

## 📋 设计原则

1. **低耦合**：通信层与业务逻辑分离
2. **可扩展**：支持多种通信方式（CLI、HTTP、WebSocket）
3. **易迁移**：切换通信方式只需修改少量文件
4. **统一接口**：所有通信方式使用相同的抽象层

## 📂 文档结构

```
通信机制/
├── README.md                           # 本文档
├── 01-当前方案-CLI直接调用.md          # 当前简单实现
├── 02-未来扩展-HTTP+SSE方案.md         # Web端扩展方案
├── 03-未来扩展-WebSocket方案.md        # 实时通信方案
├── 04-架构设计-通信层抽象.md           # 低耦合设计核心
└── 05-迁移指南.md                      # 切换通信方式指南
```

## 🎯 技术选型对比

| 方案 | 适用场景 | 复杂度 | 性能 | 实现成本 |
|------|---------|--------|------|---------|
| **CLI 直接调用** | 本地命令行 | 低 | 最高 | 最低 ✅ 当前 |
| **HTTP + SSE** | Web 端、多客户端 | 中 | 高 | 中 🔮 未来 |
| **WebSocket** | 实时协作、双向交互 | 高 | 高 | 高 🔮 未来 |

## 🚀 当前状态

- ✅ **已实现**：CLI 直接调用方案
- 🔮 **规划中**：HTTP + SSE 方案（Web 端支持）
- 🔮 **规划中**：WebSocket 方案（实时协作）

## 🔧 快速导航

### 了解当前实现
👉 [当前方案：CLI 直接调用](./01-当前方案-CLI直接调用.md)

### 规划未来扩展
👉 [HTTP + SSE 方案](./02-未来扩展-HTTP+SSE方案.md)
👉 [WebSocket 方案](./03-未来扩展-WebSocket方案.md)

### 架构设计
👉 [通信层抽象设计](./04-架构设计-通信层抽象.md) ⭐ 核心

### 实施迁移
👉 [迁移指南](./05-迁移指南.md)

## 💡 设计亮点

### 1. 统一接口抽象
```typescript
// 所有通信方式都实现相同接口
interface ITransport {
  send(message: Message): Promise<void>
  receive(): AsyncIterable<Event>
  close(): Promise<void>
}
```

### 2. 策略模式切换
```typescript
// 运行时选择通信方式
const transport = TransportFactory.create(config.mode)
const session = new Session(transport)
```

### 3. 最小改动切换
```
切换通信方式只需修改：
├── src/transport/index.ts (1 行配置)
└── config.json (1 行配置)

无需修改：
├── src/session/
├── src/agent/
└── src/tool/
```

## 📊 架构演进路线

```
Phase 1: CLI 直接调用 (当前)
    ↓
Phase 2: 添加 HTTP + SSE (Web 端)
    ↓
Phase 3: 添加 WebSocket (实时协作)
    ↓
Phase 4: 多协议共存 (混合模式)
```

## 🎓 阅读建议

1. **快速上手**：先读 [01-当前方案](./01-当前方案-CLI直接调用.md)
2. **理解架构**：必读 [04-架构设计](./04-架构设计-通信层抽象.md)
3. **规划扩展**：参考 [02-HTTP方案](./02-未来扩展-HTTP+SSE方案.md) 和 [03-WebSocket方案](./03-未来扩展-WebSocket方案.md)
4. **实施切换**：按照 [05-迁移指南](./05-迁移指南.md) 操作

## 📞 联系与反馈

如有疑问或建议，请提交 Issue 或 PR。

---

**最后更新**：2025-12-23
**维护者**：开发团队
