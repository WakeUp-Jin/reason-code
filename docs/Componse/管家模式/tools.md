# 管家模式工具集合

## 核心监控工具

### 1. 监控板读取工具
```typescript
interface MonitorReader {
  name: "read_monitor_file"
  description: "读取主Agent的监控板文件(txt)"
  parameters: {
    lines?: number // 读取最新N行，默认20
    timeRange?: "last_5min" | "last_hour" | "all"
    filter?: "errors" | "tasks" | "files" | "all"
  }
}
```

### 2. 监控板解析工具
```typescript
interface MonitorParser {
  name: "parse_monitor_data"
  description: "解析监控板文件内容，提取关键信息"
  parameters: {
    data: string // 监控板原始内容
    extract: "current_task" | "progress" | "errors" | "recent_files" | "summary"
  }
}
```

### 3. 文件监控工具
```typescript
interface FileWatcher {
  name: "watch_monitor_file"
  description: "监控txt文件变化，获取实时更新"
  parameters: {
    callback_interval?: number // 检查间隔(秒)，默认5秒
  }
}
```

### 4. 任务进度跟踪工具
```typescript
interface TaskTracker {
  name: "track_task_progress"
  description: "跟踪当前任务的详细进度"
  parameters: {
    task_id?: string
    include_subtasks?: boolean
  }
}
```

## 系统监控工具

### 5. 资源使用监控工具
```typescript
interface ResourceMonitor {
  name: "monitor_resources"
  description: "监控CPU、内存、网络等资源使用情况"
  parameters: {
    metric_type: "cpu" | "memory" | "network" | "all"
  }
}
```

### 6. 代码质量检查工具
```typescript
interface CodeQualityChecker {
  name: "check_code_quality"
  description: "检查代码质量指标和测试覆盖率"
  parameters: {
    check_type: "coverage" | "lint" | "complexity" | "all"
  }
}
```

### 7. Git状态监控工具
```typescript
interface GitMonitor {
  name: "monitor_git_status"
  description: "监控Git仓库状态和变更"
  parameters: {
    include_history?: boolean
    branch?: string
  }
}
```

### 8. 构建状态检查工具
```typescript
interface BuildMonitor {
  name: "check_build_status"
  description: "检查项目构建状态和结果"
  parameters: {
    build_type?: "compile" | "test" | "lint" | "all"
  }
}
```

## 汇报和通信工具

### 9. TTS优化汇报工具
```typescript
interface TTSReporter {
  name: "generate_tts_report"
  description: "生成适合TTS转换的简洁汇报"
  parameters: {
    report_type: "status" | "progress" | "completion" | "error"
    max_duration: number // 秒
  }
}
```

### 10. 用户交互工具
```typescript
interface UserInteraction {
  name: "respond_to_user"
  description: "响应用户的状态询问"
  parameters: {
    query_type: "status" | "progress" | "files" | "errors" | "general"
    response_format: "brief" | "detailed"
  }
}
```

## 预警和通知工具

### 11. 异常检测工具
```typescript
interface AnomalyDetector {
  name: "detect_anomalies"
  description: "检测异常情况和潜在问题"
  parameters: {
    sensitivity: "low" | "medium" | "high"
    check_categories: string[] // ["performance", "errors", "resources"]
  }
}
```

### 12. 预警通知工具
```typescript
interface AlertNotifier {
  name: "send_alert"
  description: "发送预警通知给用户"
  parameters: {
    alert_type: "error" | "warning" | "info"
    priority: "low" | "medium" | "high" | "urgent"
    message: string
  }
}
```

## 工具使用策略

### 自动触发工具
- `read_dashboard`: 每30秒自动读取一次
- `monitor_resources`: 每分钟检查一次资源使用
- `detect_anomalies`: 持续运行异常检测

### 用户触发工具
- `query_agent_status`: 用户询问状态时使用
- `respond_to_user`: 响应用户具体问题
- `generate_tts_report`: 生成语音汇报内容

### 事件触发工具
- `send_alert`: 检测到异常时立即触发
- `track_task_progress`: 任务状态变化时触发
- `check_build_status`: 构建完成时触发
