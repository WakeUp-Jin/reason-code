# 管家模式上下文结构

## 核心上下文数据

### 1. 会话基础信息
```typescript
interface SessionContext {
  sessionId: string
  startTime: Date
  lastActivity: Date
  totalDuration: number // 毫秒
  userId: string
  projectPath: string
}
```

### 2. 任务状态上下文
```typescript
interface TaskContext {
  currentTask: {
    id: string
    title: string
    description: string
    startTime: Date
    estimatedDuration?: number
    progress: number // 0-100
    status: 'pending' | 'in-progress' | 'completed' | 'error' | 'paused'
  }
  
  taskHistory: Array<{
    id: string
    title: string
    startTime: Date
    endTime?: Date
    status: string
    result?: 'success' | 'error' | 'cancelled'
  }>
  
  taskQueue: Array<{
    id: string
    title: string
    priority: number
    dependencies?: string[]
  }>
}
```

### 3. 文件操作上下文
```typescript
interface FileContext {
  filesRead: Array<{
    path: string
    timestamp: Date
    size: number
    type: string
  }>
  
  filesModified: Array<{
    path: string
    timestamp: Date
    changeType: 'create' | 'update' | 'delete'
    linesChanged?: number
  }>
  
  activeFiles: string[] // 当前正在处理的文件
  
  statistics: {
    totalFilesRead: number
    totalFilesModified: number
    totalLinesChanged: number
    mostActiveDirectory: string
  }
}
```

### 4. 工具使用上下文
```typescript
interface ToolContext {
  toolsUsed: Map<string, {
    count: number
    lastUsed: Date
    averageDuration: number
    successRate: number
  }>
  
  currentToolCall?: {
    toolName: string
    startTime: Date
    parameters: any
  }
  
  toolErrors: Array<{
    toolName: string
    timestamp: Date
    error: string
    resolved: boolean
  }>
}
```

## 系统监控上下文

### 5. 资源使用上下文
```typescript
interface ResourceContext {
  cpu: {
    current: number // 百分比
    average: number
    peak: number
    history: Array<{ timestamp: Date, usage: number }>
  }
  
  memory: {
    current: number // MB
    peak: number
    available: number
    history: Array<{ timestamp: Date, usage: number }>
  }
  
  network: {
    apiCalls: number
    dataTransferred: number // bytes
    activeConnections: number
    errors: number
  }
}
```

### 6. 代码质量上下文
```typescript
interface CodeQualityContext {
  testCoverage: {
    percentage: number
    linesTotal: number
    linesCovered: number
    lastUpdated: Date
  }
  
  codeMetrics: {
    totalLines: number
    linesAdded: number
    linesRemoved: number
    complexity: number
    duplicateLines: number
  }
  
  lintResults: {
    errors: number
    warnings: number
    lastCheck: Date
    issues: Array<{
      file: string
      line: number
      severity: 'error' | 'warning'
      message: string
    }>
  }
}
```

### 7. 依赖管理上下文
```typescript
interface DependencyContext {
  packageChanges: Array<{
    timestamp: Date
    action: 'add' | 'remove' | 'update'
    packageName: string
    version?: string
    oldVersion?: string
  }>
  
  currentDependencies: {
    production: number
    development: number
    outdated: number
    vulnerable: number
  }
  
  buildStatus: {
    lastBuild: Date
    status: 'success' | 'failed' | 'in-progress'
    duration: number
    errors: string[]
    warnings: string[]
  }
}
```

### 8. Git状态上下文
```typescript
interface GitContext {
  currentBranch: string
  commits: Array<{
    hash: string
    message: string
    timestamp: Date
    author: string
    filesChanged: number
  }>
  
  status: {
    staged: number
    unstaged: number
    untracked: number
    conflicts: number
  }
  
  remoteStatus: {
    ahead: number
    behind: number
    lastSync: Date
  }
}
```

## 状态和错误上下文

### 9. 系统状态上下文
```typescript
interface SystemContext {
  agentStatus: 'idle' | 'working' | 'waiting' | 'error' | 'paused'
  
  healthCheck: {
    overall: 'healthy' | 'warning' | 'critical'
    components: {
      fileSystem: 'ok' | 'warning' | 'error'
      network: 'ok' | 'warning' | 'error'
      tools: 'ok' | 'warning' | 'error'
      resources: 'ok' | 'warning' | 'error'
    }
    lastCheck: Date
  }
  
  performance: {
    responseTime: number // 毫秒
    throughput: number // 操作/分钟
    errorRate: number // 百分比
  }
}
```

### 10. 错误和异常上下文
```typescript
interface ErrorContext {
  errors: Array<{
    id: string
    timestamp: Date
    severity: 'low' | 'medium' | 'high' | 'critical'
    category: 'system' | 'tool' | 'file' | 'network' | 'user'
    message: string
    stackTrace?: string
    resolved: boolean
    resolution?: string
  }>
  
  warnings: Array<{
    timestamp: Date
    category: string
    message: string
    acknowledged: boolean
  }>
  
  statistics: {
    totalErrors: number
    errorRate: number // 错误/小时
    mostCommonError: string
    averageResolutionTime: number // 分钟
  }
}
```

## 用户交互上下文

### 11. 交互历史上下文
```typescript
interface InteractionContext {
  userQueries: Array<{
    timestamp: Date
    query: string
    category: 'status' | 'progress' | 'files' | 'errors' | 'general'
    response: string
    responseTime: number
  }>
  
  reportHistory: Array<{
    timestamp: Date
    type: 'automatic' | 'requested'
    content: string
    duration: number // TTS时长（秒）
  }>
  
  userPreferences: {
    reportFrequency: number // 分钟
    detailLevel: 'brief' | 'detailed'
    alertThreshold: 'low' | 'medium' | 'high'
    preferredReportTime: number[] // 小时数组
  }
}
```

## 上下文管理策略

### 数据保留策略
- **实时数据**：保留最近1小时的详细数据
- **历史数据**：保留最近24小时的汇总数据
- **统计数据**：保留最近7天的统计信息
- **错误日志**：保留最近30天的错误记录

### 上下文优先级
1. **高优先级**：当前任务、系统状态、错误信息
2. **中优先级**：文件操作、工具使用、资源监控
3. **低优先级**：历史统计、用户偏好、性能指标

### 内存优化
- 使用滑动窗口保留最相关的数据
- 定期清理过期的上下文信息
- 压缩历史数据以节省内存
- 按需加载详细上下文信息
