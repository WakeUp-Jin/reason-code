import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, unlinkSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import type { Session, Message } from '../context/store.js'

// 存储路径
const STORAGE_DIR = join(homedir(), '.reason-cli')
const SESSIONS_DIR = join(STORAGE_DIR, 'sessions')
const CONFIG_FILE = join(STORAGE_DIR, 'config.json')

/**
 * 确保存储目录存在
 */
function ensureStorageDir(): void {
  if (!existsSync(STORAGE_DIR)) {
    mkdirSync(STORAGE_DIR, { recursive: true })
  }
  if (!existsSync(SESSIONS_DIR)) {
    mkdirSync(SESSIONS_DIR, { recursive: true })
  }
}

/**
 * Session 数据结构（用于存储）
 */
interface SessionData {
  session: Session
  messages: Message[]
}

/**
 * 保存会话
 */
export function saveSession(session: Session, messages: Message[]): void {
  ensureStorageDir()

  const data: SessionData = { session, messages }
  const filePath = join(SESSIONS_DIR, `${session.id}.json`)

  writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8')
}

/**
 * 加载会话
 */
export function loadSession(sessionId: string): SessionData | null {
  ensureStorageDir()

  const filePath = join(SESSIONS_DIR, `${sessionId}.json`)

  if (!existsSync(filePath)) {
    return null
  }

  try {
    const content = readFileSync(filePath, 'utf-8')
    return JSON.parse(content) as SessionData
  } catch (error) {
    console.error(`Failed to load session ${sessionId}:`, error)
    return null
  }
}

/**
 * 删除会话
 */
export function deleteSession(sessionId: string): boolean {
  ensureStorageDir()

  const filePath = join(SESSIONS_DIR, `${sessionId}.json`)

  if (!existsSync(filePath)) {
    return false
  }

  try {
    unlinkSync(filePath)
    return true
  } catch (error) {
    console.error(`Failed to delete session ${sessionId}:`, error)
    return false
  }
}

/**
 * 列出所有会话
 */
export function listSessions(): Session[] {
  ensureStorageDir()

  const files = readdirSync(SESSIONS_DIR).filter((f) => f.endsWith('.json'))
  const sessions: Session[] = []

  for (const file of files) {
    try {
      const content = readFileSync(join(SESSIONS_DIR, file), 'utf-8')
      const data = JSON.parse(content) as SessionData
      sessions.push(data.session)
    } catch (error) {
      console.error(`Failed to read session file ${file}:`, error)
    }
  }

  // 按更新时间排序（最新的在前）
  return sessions.sort((a, b) => b.updatedAt - a.updatedAt)
}

/**
 * 加载所有会话和消息
 */
export function loadAllSessions(): { sessions: Session[]; messages: Record<string, Message[]> } {
  ensureStorageDir()

  const files = readdirSync(SESSIONS_DIR).filter((f) => f.endsWith('.json'))
  const sessions: Session[] = []
  const messages: Record<string, Message[]> = {}

  for (const file of files) {
    try {
      const content = readFileSync(join(SESSIONS_DIR, file), 'utf-8')
      const data = JSON.parse(content) as SessionData
      sessions.push(data.session)
      messages[data.session.id] = data.messages
    } catch (error) {
      console.error(`Failed to read session file ${file}:`, error)
    }
  }

  // 按更新时间排序（最新的在前）
  sessions.sort((a, b) => b.updatedAt - a.updatedAt)

  return { sessions, messages }
}

/**
 * 配置数据结构
 */
export interface ConfigData {
  theme: string
  mode: 'dark' | 'light'
  lastSessionId?: string
}

const DEFAULT_CONFIG: ConfigData = {
  theme: 'kanagawa',
  mode: 'dark',
}

/**
 * 保存配置
 */
export function saveConfig(config: Partial<ConfigData>): void {
  ensureStorageDir()

  const currentConfig = loadConfig()
  const newConfig = { ...currentConfig, ...config }

  writeFileSync(CONFIG_FILE, JSON.stringify(newConfig, null, 2), 'utf-8')
}

/**
 * 加载配置
 */
export function loadConfig(): ConfigData {
  ensureStorageDir()

  if (!existsSync(CONFIG_FILE)) {
    return DEFAULT_CONFIG
  }

  try {
    const content = readFileSync(CONFIG_FILE, 'utf-8')
    return { ...DEFAULT_CONFIG, ...JSON.parse(content) }
  } catch (error) {
    console.error('Failed to load config:', error)
    return DEFAULT_CONFIG
  }
}

/**
 * 获取存储路径
 */
export function getStoragePath(): string {
  return STORAGE_DIR
}

export { STORAGE_DIR, SESSIONS_DIR, CONFIG_FILE }

