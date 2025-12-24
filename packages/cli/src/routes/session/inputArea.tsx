import { Box } from 'ink';
import { Prompt } from '../../component/prompt';
import { useStore } from '../../context/store';
import { useCurrentSession } from '../../context/store';

// 输入区域 - 使用 Prompt 组件
export function InputArea() {
  const addMessage = useStore((state) => state.addMessage);
  const session = useCurrentSession();

  const handleSubmit = (value: string) => {
    if (!session) return;

    // 添加用户消息
    addMessage(session.id, {
      role: 'user',
      content: value,
    });

    // TODO: 这里可以触发 AI 响应
    // 暂时添加一个模拟的 AI 响应
    setTimeout(() => {
      addMessage(session.id, {
        role: 'assistant',
        content: `You said: "${value}"\n\nThis is a mock response. AI integration coming soon!`,
      });
    }, 500);
  };

  return (
    <Box flexShrink={0}>
      <Prompt onSubmit={handleSubmit} placeholder="Type your message..." />
    </Box>
  );
}
