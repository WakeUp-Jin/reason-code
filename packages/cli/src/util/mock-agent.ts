import { bus, BusEvents, type AgentChunkEvent, type AgentEndEvent, type AgentErrorEvent } from './bus.js'
import { useAppStore } from '../context/store.js'

/**
 * Mock Agent 响应
 */
const MOCK_RESPONSES = [
  `这是一个模拟的 AI 响应。我是 Reason CLI 的 Mock Agent。

\`\`\`typescript
console.log('Hello World!')
\`\`\`

我可以帮助你：
- 回答问题
- 编写代码
- 解释概念`,

  `好的，让我来解释一下这个概念。

在计算机科学中，**事件驱动架构**是一种软件架构模式，它通过事件的产生、检测和消费来实现组件间的通信。

主要特点：
1. 松耦合
2. 异步通信
3. 可扩展性强`,

  `以下是一个简单的 TypeScript 示例：

\`\`\`typescript
interface User {
  id: string
  name: string
  email: string
}

function greet(user: User): string {
  return \`Hello, \${user.name}!\`
}

const user: User = {
  id: '1',
  name: 'Alice',
  email: 'alice@example.com'
}

console.log(greet(user))
\`\`\`

这段代码展示了 TypeScript 的基本类型系统。`,
]

/**
 * 模拟流式输出
 * 将文本分块逐步输出
 */
async function streamResponse(
  sessionId: string,
  messageId: string,
  content: string,
  chunkDelay: number = 30
): Promise<void> {
  const store = useAppStore.getState()

  // 按字符分块
  const chars = content.split('')

  for (let i = 0; i < chars.length; i++) {
    const chunk = chars[i]

    // 发送 chunk 事件
    bus.emit<AgentChunkEvent>(BusEvents.AGENT_CHUNK, {
      sessionId,
      messageId,
      chunk,
    })

    // 更新 Store 中的消息
    store.appendMessageContent(sessionId, messageId, chunk)

    // 模拟延迟
    await new Promise((resolve) => setTimeout(resolve, chunkDelay))
  }

  // 标记消息完成
  store.updateMessage(sessionId, messageId, { isStreaming: false })

  // 发送完成事件
  bus.emit<AgentEndEvent>(BusEvents.AGENT_END, {
    sessionId,
    messageId,
    content,
  })
}

/**
 * Mock Agent
 * 模拟 AI 响应，用于测试 UI
 */
export async function runMockAgent(
  sessionId: string,
  userMessage: string
): Promise<void> {
  const store = useAppStore.getState()

  try {
    // 发送开始事件
    bus.emit(BusEvents.AGENT_START, { sessionId })

    // 创建 AI 消息（初始为空，流式填充）
    const aiMessage = store.addMessage(sessionId, {
      role: 'assistant',
      content: '',
      isStreaming: true,
    })

    // 随机选择一个响应
    const responseIndex = Math.floor(Math.random() * MOCK_RESPONSES.length)
    const response = MOCK_RESPONSES[responseIndex]

    // 模拟思考延迟
    await new Promise((resolve) => setTimeout(resolve, 500))

    // 流式输出响应
    await streamResponse(sessionId, aiMessage.id, response)
  } catch (error) {
    // 发送错误事件
    bus.emit<AgentErrorEvent>(BusEvents.AGENT_ERROR, {
      sessionId,
      error: error as Error,
    })
  }
}

/**
 * 处理用户消息
 * 添加用户消息并触发 Mock Agent
 */
export async function handleUserMessage(
  sessionId: string,
  content: string
): Promise<void> {
  const store = useAppStore.getState()

  // 添加用户消息
  store.addMessage(sessionId, {
    role: 'user',
    content,
  })

  // 触发 Mock Agent
  await runMockAgent(sessionId, content)
}

