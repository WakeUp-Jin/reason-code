# 监控板设计 (monitor.txt)

## 监控板核心功能

监控板是一个简单的txt文件，记录主Agent的所有关键操作和状态信息。管家Agent通过读取这个文件来了解主Agent的实时状态。

## 监控板文件格式

### 文件路径
```
/tmp/agent_monitor.txt
```

### 文件结构
```
[时间戳] [状态] [操作类型] [详情]
```

### 示例内容
```
2026-01-23 16:35:42 TASK_START 开始处理用户认证模块
2026-01-23 16:35:45 FILE_READ /src/auth/login.ts
2026-01-23 16:35:50 FILE_WRITE /src/auth/login.ts (修改45行)
2026-01-23 16:36:10 TOOL_CALL execute_bash "npm test auth"
2026-01-23 16:36:15 TEST_RESULT 测试通过 (12/12)
2026-01-23 16:36:20 PROGRESS 用户认证模块 60%
2026-01-23 16:36:25 ERROR 编译错误: 类型不匹配
2026-01-23 16:36:30 ERROR_RESOLVED 修复类型定义
2026-01-23 16:36:35 TASK_COMPLETE 用户认证模块已完成
```

## 监控板数据类型

### 基础状态记录
- **TASK_START** - 任务开始
- **TASK_COMPLETE** - 任务完成  
- **TASK_PAUSE** - 任务暂停
- **PROGRESS** - 进度更新

### 文件操作记录
- **FILE_READ** - 读取文件 `路径`
- **FILE_WRITE** - 修改文件 `路径 (变更描述)`
- **FILE_CREATE** - 创建文件 `路径`
- **FILE_DELETE** - 删除文件 `路径`

### 工具使用记录
- **TOOL_CALL** - 工具调用 `工具名 参数`
- **TOOL_RESULT** - 工具结果 `成功/失败 结果描述`

### 系统状态记录
- **ERROR** - 错误信息
- **ERROR_RESOLVED** - 错误解决
- **WARNING** - 警告信息
- **INFO** - 一般信息

### 测试和构建记录
- **TEST_START** - 开始测试
- **TEST_RESULT** - 测试结果 `通过数/总数`
- **BUILD_START** - 开始构建
- **BUILD_RESULT** - 构建结果 `成功/失败`

## 管家Agent读取策略

### 读取方式
```typescript
// 读取最新N行
function readLatestLines(n: number): string[]

// 读取指定时间范围
function readTimeRange(start: Date, end: Date): string[]

// 实时监控文件变化
function watchFile(callback: (newLines: string[]) => void)
```

### 状态解析
```typescript
interface MonitorEntry {
  timestamp: Date
  status: string
  operation: string
  details: string
}

function parseMonitorLine(line: string): MonitorEntry
```

## 主Agent写入策略

### 写入时机
- 每个重要操作完成后立即写入
- 状态变化时写入
- 错误发生时立即写入
- 定期写入进度信息(每5分钟)

### 写入格式
```typescript
function writeToMonitor(status: string, operation: string, details: string) {
  const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19)
  const line = `${timestamp} ${status} ${operation} ${details}\n`
  fs.appendFileSync('/tmp/agent_monitor.txt', line)
}
```

### 文件管理
- 文件大小超过1MB时自动轮转
- 保留最近的监控记录
- 定期清理过期数据

## 管家汇报生成

管家Agent读取monitor.txt文件，解析最新状态，生成简洁汇报：

```typescript
function generateReport(): string {
  const recentLines = readLatestLines(10)
  const currentTask = findCurrentTask(recentLines)
  const progress = findLatestProgress(recentLines)
  const errors = findUnresolvedErrors(recentLines)
  
  return `正在${currentTask}，进度${progress}%${errors ? '，遇到' + errors : '，进展顺利'}`
}
```

这样的设计简单高效，主Agent只需要往txt文件写入关键信息，管家Agent读取文件就能了解所有状态。
