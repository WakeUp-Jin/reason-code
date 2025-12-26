import { Box, Text, useInput, useApp } from 'ink'
import { useTheme } from '../context/theme.js'
import { useRoute } from '../context/route.js'
import { useAppStore } from '../context/store.js'

// Logo 组件
function Logo() {
  const { colors } = useTheme()

  const logo = `
  ██████╗ ███████╗ █████╗ ███████╗ ██████╗ ███╗   ██╗
  ██╔══██╗██╔════╝██╔══██╗██╔════╝██╔═══██╗████╗  ██║
  ██████╔╝█████╗  ███████║███████╗██║   ██║██╔██╗ ██║
  ██╔══██╗██╔══╝  ██╔══██║╚════██║██║   ██║██║╚██╗██║
  ██║  ██║███████╗██║  ██║███████║╚██████╔╝██║ ╚████║
  ╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝╚══════╝ ╚═════╝ ╚═╝  ╚═══╝
  `

  return (
    <Box flexDirection="column" alignItems="center" marginY={1}>
      <Text color={colors.primary}>{logo}</Text>
      <Text color={colors.textMuted}>AI Agent CLI powered by Reason</Text>
    </Box>
  )
}

// 快捷键提示
function Shortcuts() {
  const { colors } = useTheme()

  return (
    <Box flexDirection="column" alignItems="center" marginTop={2}>
      <Box gap={4}>
        <Text>
          <Text color={colors.primary} bold>Enter</Text>
          <Text color={colors.textMuted}> New Session</Text>
        </Text>
        <Text>
          <Text color={colors.primary} bold>Ctrl+C</Text>
          <Text color={colors.textMuted}> Exit</Text>
        </Text>
      </Box>
      <Box marginTop={1}>
        <Text color={colors.textMuted} dimColor>
          Type / for commands
        </Text>
      </Box>
    </Box>
  )
}

// 输入提示
function InputHint() {
  const { colors } = useTheme()

  return (
    <Box marginTop={2} paddingX={4}>
      <Box
        borderStyle="round"
        borderColor={colors.border}
        paddingX={2}
        paddingY={1}
        width="100%"
      >
        <Text color={colors.textMuted}>
          Press <Text color={colors.primary} bold>Enter</Text> to start a new session, or type a message...
        </Text>
      </Box>
    </Box>
  )
}

export function Home() {
  const { goToSession } = useRoute()
  const { exit } = useApp()
  const createSession = useAppStore((state) => state.createSession)

  // 键盘输入处理
  useInput((input, key) => {
    // Ctrl+C 退出
    if (key.ctrl && input === 'c') {
      exit()
      return
    }

    // Enter 创建新会话
    if (key.return) {
      const session = createSession()
      goToSession(session.id)
      return
    }
  })

  return (
    <Box
      flexDirection="column"
      alignItems="center"
      justifyContent="center"
      height="100%"
    >
      <Logo />
      <InputHint />
      <Shortcuts />
    </Box>
  )
}

