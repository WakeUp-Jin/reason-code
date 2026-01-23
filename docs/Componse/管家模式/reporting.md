# 汇报策略设计

## TTS优化汇报机制

管家模式的汇报策略专门针对TTS转换进行优化，确保语音输出自然、简洁、易懂。

## 汇报分类和时长控制

### 1. 超简短汇报 (10-15秒)
**使用场景**：定期状态更新、简单确认
```typescript
interface UltraShortReport {
  maxDuration: 15 // 秒
  wordLimit: 25
  template: "正在${task}，进度${progress}%"
  examples: [
    "正在编写测试，进度60%",
    "代码编译完成，准备测试",
    "发现一个小问题，正在修复"
  ]
}
```

### 2. 简短汇报 (20-30秒)
**使用场景**：任务开始/完成、状态变化
```typescript
interface ShortReport {
  maxDuration: 30 // 秒
  wordLimit: 50
  template: "正在${task}，已完成${progress}%，预计还需${time}。${latest_action}"
  examples: [
    "正在开发用户认证，已完成70%，预计还需5分钟。刚刚完成了登录接口测试",
    "API开发已完成！总共创建了8个接口，测试全部通过。准备开始前端集成",
    "遇到依赖冲突问题，正在解决。可能需要您确认一下包版本选择"
  ]
}
```

### 3. 详细汇报 (45-60秒)
**使用场景**：用户主动询问、重要里程碑
```typescript
interface DetailedReport {
  maxDuration: 60 // 秒
  wordLimit: 100
  structure: {
    current_status: string
    progress_summary: string
    recent_activities: string[]
    next_steps: string
    issues?: string
  }
}
```

## 汇报触发策略

### 自动汇报触发器
```typescript
interface AutoReportTriggers {
  // 时间触发
  periodic: {
    interval: 300000 // 5分钟
    condition: "task_in_progress"
    reportType: "short"
  }
  
  // 进度触发
  progress: {
    thresholds: [25, 50, 75, 100] // 百分比
    reportType: "ultra_short"
  }
  
  // 状态变化触发
  statusChange: {
    events: ["task_start", "task_complete", "error_occurred"]
    reportType: "short"
  }
  
  // 异常触发
  anomaly: {
    conditions: ["error_rate_high", "resource_usage_critical", "build_failed"]
    reportType: "detailed"
    priority: "immediate"
  }
}
```

### 用户询问响应策略
```typescript
interface UserQueryResponse {
  // 查询分类
  queryTypes: {
    "当前状态": "current_status_brief"
    "详细进度": "detailed_progress"
    "有什么问题": "error_summary"
    "还需要多久": "time_estimation"
    "最近在做什么": "recent_activities"
  }
  
  // 响应模板
  responseTemplates: {
    current_status_brief: "目前${current_task}，进度${progress}%，一切正常"
    detailed_progress: "已完成${completed_tasks}个任务，正在处理${current_task}，还剩${remaining_tasks}个任务"
    error_summary: "目前${error_count}个问题，主要是${main_error_type}，正在解决中"
    time_estimation: "预计还需${estimated_time}，基于当前进度${current_progress}%"
    recent_activities: "最近${time_window}内完成了${recent_actions}，现在正在${current_action}"
  }
}
```

## 语言优化策略

### TTS友好的表达方式
```typescript
interface TTSOptimization {
  // 数字表达
  numbers: {
    "75%": "百分之七十五"
    "3.5GB": "三点五GB"
    "15min": "十五分钟"
  }
  
  // 技术术语简化
  technicalTerms: {
    "authentication": "用户认证"
    "API endpoint": "接口"
    "unit test": "测试"
    "compilation": "编译"
    "deployment": "部署"
  }
  
  // 状态描述
  statusDescriptions: {
    "in_progress": "正在进行"
    "completed": "已完成"
    "error": "遇到问题"
    "waiting": "等待中"
    "paused": "已暂停"
  }
}
```

### 语音节奏控制
```typescript
interface SpeechPacing {
  // 停顿标记
  pauseMarkers: {
    short: "，" // 0.3秒停顿
    medium: "。" // 0.6秒停顿
    long: "。\n" // 1秒停顿
  }
  
  // 重点强调
  emphasis: {
    important: "**${content}**"
    urgent: "！${content}！"
    positive: "✓${content}"
    negative: "✗${content}"
  }
  
  // 语速控制
  speedControl: {
    normal: 150 // 字/分钟
    important: 120 // 重要信息慢一点
    routine: 180 // 常规信息快一点
  }
}
```

## 上下文感知汇报

### 智能内容选择
```typescript
interface ContextAwareReporting {
  // 根据用户状态调整
  userStateAdaptation: {
    "first_time_user": "详细解释技术术语"
    "experienced_user": "使用技术术语，简洁汇报"
    "busy_user": "只汇报关键信息"
    "learning_mode": "包含教育性内容"
  }
  
  // 根据任务类型调整
  taskTypeAdaptation: {
    "coding": "重点汇报代码变更和测试结果"
    "debugging": "重点汇报错误信息和解决进度"
    "testing": "重点汇报测试覆盖率和通过率"
    "deployment": "重点汇报部署状态和健康检查"
  }
  
  // 根据时间调整
  timeAdaptation: {
    "morning": "包含今日计划概述"
    "afternoon": "重点汇报当前进度"
    "evening": "包含今日总结"
    "late_night": "简短汇报，避免过多细节"
  }
}
```

### 情感和语调控制
```typescript
interface EmotionalTone {
  // 情况对应语调
  toneMapping: {
    "success": "积极、满意的语调"
    "progress": "稳定、自信的语调"
    "problem": "关切、专业的语调"
    "urgent": "紧急但不慌张的语调"
    "completion": "成就感、满足的语调"
  }
  
  // 语调标记
  toneMarkers: {
    positive: "😊 ${content}"
    neutral: "${content}"
    concerned: "🤔 ${content}"
    urgent: "⚠️ ${content}"
    celebration: "🎉 ${content}"
  }
}
```

## 汇报质量监控

### 反馈收集机制
```typescript
interface FeedbackCollection {
  // 隐式反馈
  implicitFeedback: {
    "user_interruption": "汇报可能太长或不相关"
    "follow_up_questions": "汇报信息不够详细"
    "no_response": "汇报可能合适"
    "positive_acknowledgment": "汇报质量良好"
  }
  
  // 显式反馈
  explicitFeedback: {
    rating: 1 | 2 | 3 | 4 | 5
    categories: ["length", "clarity", "relevance", "timing"]
    suggestions: string[]
  }
}
```

### 自适应优化
```typescript
interface AdaptiveOptimization {
  // 学习用户偏好
  preferenceTracking: {
    preferred_length: number // 秒
    preferred_detail_level: "brief" | "moderate" | "detailed"
    preferred_frequency: number // 分钟
    preferred_topics: string[]
  }
  
  // 动态调整策略
  adaptationRules: {
    "if user often interrupts": "reduce report length"
    "if user asks for more details": "increase detail level"
    "if user ignores reports": "reduce frequency"
    "if user responds positively": "maintain current style"
  }
}
```

## 汇报模板库

### 常用汇报模板
```typescript
const reportTemplates = {
  // 任务开始
  task_start: "开始处理${task_name}，预计需要${estimated_time}",
  
  // 进度更新
  progress_update: "正在${current_action}，已完成${progress}%，进展顺利",
  
  // 任务完成
  task_complete: "${task_name}已完成！${summary}，准备开始下一个任务",
  
  // 遇到问题
  issue_encountered: "在${context}时遇到${issue_type}，正在分析解决方案",
  
  // 需要用户输入
  user_input_needed: "需要您确认${decision_point}，请告诉我您的选择",
  
  // 系统状态
  system_status: "系统运行正常，CPU使用${cpu}%，内存使用${memory}GB",
  
  // 错误恢复
  error_recovery: "问题已解决，${solution_summary}，继续执行任务"
}
```

这套汇报策略确保管家模式能够提供高质量、TTS友好的语音汇报，同时具备学习和自适应能力，不断优化用户体验。
