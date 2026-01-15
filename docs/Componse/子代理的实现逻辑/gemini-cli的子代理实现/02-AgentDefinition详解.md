# AgentDefinition 详解

## 概述

`AgentDefinition` 是子代理的核心配置接口，它采用声明式的方式定义子代理的所有行为特征。通过这个接口，开发者无需编写复杂的执行逻辑，只需配置即可创建功能完整的子代理。

## 完整接口定义

```typescript
interface AgentDefinition<TOutput extends z.ZodTypeAny = z.ZodUnknown> {
  // 基本信息
  name: string;                    // 唯一标识符，用于工具注册
  displayName?: string;            // 显示名称，用于 UI 展示
  description: string;             // 功能描述，帮助主代理选择合适的工具
  
  // 提示配置
  promptConfig: PromptConfig;
  
  // 模型配置
  modelConfig: ModelConfig;
  
  // 运行配置
  runConfig: RunConfig;
  
  // 工具配置（可选）
  toolConfig?: ToolConfig;
  
  // 输入配置
  inputConfig: InputConfig;
  
  // 输出配置（可选）
  outputConfig?: OutputConfig<TOutput>;
  
  // 输出处理函数（可选）
  processOutput?: (output: z.infer<TOutput>) => string;
}
```

## 各部分详解

### 1. 基本信息

#### name（必需）
```typescript
name: string;
```

- **作用**：子代理的唯一标识符
- **用途**：
  - 工具注册时的名称
  - 日志和遥测中的标识
  - 主代理调用时的工具名
- **命名规范**：
  - 使用小写字母和下划线
  - 描述性强，如 `codebase_investigator`
  - 避免与现有工具冲突

**示例**：
```typescript
name: 'codebase_investigator'
```

#### displayName（可选）
```typescript
displayName?: string;
```

- **作用**：用户友好的显示名称
- **用途**：UI 展示、日志输出
- **默认值**：如果未提供，使用 `name`

**示例**：
```typescript
displayName: 'Codebase Investigator Agent'
```

#### description（必需）
```typescript
description: string;
```

- **作用**：描述子代理的功能和用途
- **重要性**：主代理根据此描述决定是否调用该工具
- **编写建议**：
  - 清晰说明能做什么
  - 说明适用场景
  - 说明返回什么结果

**示例**：
```typescript
description: `
  Your primary tool for multifile search tasks and codebase exploration.
  Invoke this tool to delegate search tasks to an autonomous subagent.
  Use this to find features, understand context, or locate specific files.
  Returns a structured JSON report with key file paths, symbols, and insights.
`
```

### 2. PromptConfig（提示配置）

```typescript
interface PromptConfig {
  systemPrompt?: string;
  initialMessages?: Content[];
  query?: string;
}
```

#### systemPrompt（系统提示）

- **作用**：定义子代理的身份、规则和行为准则
- **支持模板**：可使用 `${variable}` 语法引用输入参数
- **编写要点**：
  - 明确角色定位
  - 详细的操作规则
  - 清晰的终止条件
  - 输出格式要求

**示例**：
```typescript
systemPrompt: `
You are **Codebase Investigator**, a specialized AI agent.

## Your Role
You are a sub-agent within a larger development system.
Your SOLE PURPOSE is to build a complete mental model of relevant code.

## Core Directives
1. DEEP ANALYSIS: Understand the 'why' behind the code
2. SYSTEMATIC EXPLORATION: Start with high-value clues
3. HOLISTIC & PRECISE: Find the complete and minimal set

## Scratchpad Management
- Initialize scratchpad on first turn
- Update after every observation
- Track questions to resolve

## Termination
Call 'complete_task' with a JSON report when:
- All questions are resolved
- All relevant files are identified
`
```

#### initialMessages（初始消息）

- **作用**：提供少样本学习（few-shot learning）示例
- **格式**：用户-模型对话对数组
- **用途**：
  - 展示期望的对话模式
  - 提供输出格式示例
  - 建立上下文

**示例**：
```typescript
initialMessages: [
  {
    role: 'user',
    parts: [{ text: 'Find all authentication-related files' }]
  },
  {
    role: 'model',
    parts: [{ text: `
<scratchpad>
Checklist:
[ ] Search for 'auth' in file names
[ ] Look for login/logout functions
...
</scratchpad>

I'll start by using glob to find auth-related files.
    ` }]
  }
]
```

#### query（任务查询）

- **作用**：触发子代理执行的具体任务描述
- **支持模板**：可使用 `${variable}` 引用输入
- **与 systemPrompt 的区别**：
  - `systemPrompt`：身份和规则（who you are）
  - `query`：具体任务（what to do）

**示例**：
```typescript
query: `
Your task is to investigate the codebase for:
<objective>
\${objective}
</objective>

Provide a comprehensive analysis with file paths and key symbols.
`
```

### 3. ModelConfig（模型配置）

```typescript
interface ModelConfig {
  model: string;
  temp: number;
  top_p: number;
  thinkingBudget?: number;
}
```

#### model
- **作用**：指定使用的 Gemini 模型
- **常用值**：
  - `gemini-2.5-pro`：高性能，适合复杂任务
  - `gemini-2.5-flash`：快速，适合简单任务

**示例**：
```typescript
model: 'gemini-2.5-pro'
```

#### temp（温度）
- **范围**：0.0 - 2.0
- **作用**：控制输出的随机性
- **建议**：
  - `0.0 - 0.3`：精确任务（代码分析、数据提取）
  - `0.4 - 0.7`：平衡任务（一般对话）
  - `0.8 - 1.0`：创意任务（内容生成）

**示例**：
```typescript
temp: 0.1  // 代码分析需要高精确度
```

#### top_p（核采样）
- **范围**：0.0 - 1.0
- **作用**：控制输出的多样性
- **建议**：通常设置为 0.95

**示例**：
```typescript
top_p: 0.95
```

#### thinkingBudget（思考预算）
- **作用**：控制模型的思考深度
- **值**：
  - `-1`：无限制（推荐）
  - `> 0`：限制思考 token 数量

**示例**：
```typescript
thinkingBudget: -1
```

### 4. RunConfig（运行配置）

```typescript
interface RunConfig {
  max_time_minutes: number;
  max_turns?: number;
}
```

#### max_time_minutes（必需）
- **作用**：最大执行时间（分钟）
- **用途**：防止无限循环
- **建议**：
  - 简单任务：1-3 分钟
  - 复杂任务：5-10 分钟
  - 深度分析：10-15 分钟

**示例**：
```typescript
max_time_minutes: 5
```

#### max_turns（可选）
- **作用**：最大对话轮次
- **定义**：一轮 = 用户消息 + 模型响应
- **用途**：额外的循环保护
- **建议**：10-20 轮

**示例**：
```typescript
max_turns: 15
```

### 5. ToolConfig（工具配置）

```typescript
interface ToolConfig {
  tools: Array<string | FunctionDeclaration | AnyDeclarativeTool>;
}
```

#### tools 数组

支持三种类型：

**1. 字符串（工具名称）**
```typescript
tools: [
  'read_file',
  'grep',
  'ls',
  'glob'
]
```

**2. FunctionDeclaration（函数声明）**
```typescript
tools: [
  {
    name: 'custom_tool',
    description: 'A custom tool',
    parameters: {
      type: Type.OBJECT,
      properties: {
        input: { type: Type.STRING }
      }
    }
  }
]
```

**3. AnyDeclarativeTool（工具实例）**
```typescript
tools: [
  ReadFileTool,
  GrepTool,
  LSTool
]
```

**安全限制**：
- 只能使用非交互式工具
- 不能使用需要用户确认的工具
- 启动时会自动验证

**示例**：
```typescript
toolConfig: {
  tools: [
    LSTool.Name,           // 字符串引用
    ReadFileTool.Name,
    GLOB_TOOL_NAME,
    GrepTool.Name
  ]
}
```

### 6. InputConfig（输入配置）

```typescript
interface InputConfig {
  inputs: Record<string, {
    description: string;
    type: 'string' | 'number' | 'boolean' | 'integer' | 'string[]' | 'number[]';
    required: boolean;
  }>;
}
```

#### 作用
- 定义子代理接受的参数
- 用于生成工具的参数 Schema
- 用于模板变量替换

#### 示例

**单个字符串参数**：
```typescript
inputConfig: {
  inputs: {
    objective: {
      description: 'A comprehensive description of the user\'s goal',
      type: 'string',
      required: true
    }
  }
}
```

**多个参数**：
```typescript
inputConfig: {
  inputs: {
    file_path: {
      description: 'Path to the file to analyze',
      type: 'string',
      required: true
    },
    max_depth: {
      description: 'Maximum analysis depth',
      type: 'integer',
      required: false
    },
    include_tests: {
      description: 'Whether to include test files',
      type: 'boolean',
      required: false
    }
  }
}
```

**数组参数**：
```typescript
inputConfig: {
  inputs: {
    file_patterns: {
      description: 'List of file patterns to search',
      type: 'string[]',
      required: true
    }
  }
}
```

### 7. OutputConfig（输出配置）

```typescript
interface OutputConfig<T extends z.ZodTypeAny> {
  outputName: string;
  description: string;
  schema: T;
}
```

#### outputName
- **作用**：`complete_task` 工具的参数名
- **示例**：`'report'`, `'result'`, `'analysis'`

#### description
- **作用**：描述期望的输出内容
- **用途**：帮助子代理理解输出要求

#### schema（Zod Schema）
- **作用**：定义输出的结构和验证规则
- **类型安全**：与 `TOutput` 泛型参数关联

**示例 1：简单字符串输出**
```typescript
outputConfig: {
  outputName: 'summary',
  description: 'A brief summary of findings',
  schema: z.string()
}
```

**示例 2：结构化对象输出**
```typescript
const ReportSchema = z.object({
  SummaryOfFindings: z.string().describe('Overall summary'),
  ExplorationTrace: z.array(z.string()).describe('Step-by-step actions'),
  RelevantLocations: z.array(
    z.object({
      FilePath: z.string(),
      Reasoning: z.string(),
      KeySymbols: z.array(z.string())
    })
  )
});

outputConfig: {
  outputName: 'report',
  description: 'The final investigation report as a JSON object',
  schema: ReportSchema
}
```

**示例 3：复杂嵌套结构**
```typescript
const AnalysisSchema = z.object({
  metadata: z.object({
    timestamp: z.string(),
    duration_ms: z.number(),
    files_analyzed: z.number()
  }),
  findings: z.array(
    z.object({
      category: z.enum(['bug', 'improvement', 'security']),
      severity: z.enum(['low', 'medium', 'high']),
      description: z.string(),
      locations: z.array(
        z.object({
          file: z.string(),
          line: z.number().optional(),
          snippet: z.string().optional()
        })
      ),
      recommendations: z.array(z.string())
    })
  ),
  statistics: z.object({
    total_issues: z.number(),
    by_severity: z.record(z.number())
  })
});

outputConfig: {
  outputName: 'analysis',
  description: 'Comprehensive code analysis report',
  schema: AnalysisSchema
}
```

### 8. processOutput（输出处理函数）

```typescript
processOutput?: (output: z.infer<TOutput>) => string;
```

#### 作用
- 将验证后的输出转换为字符串格式
- 用于格式化返回给主代理的内容

#### 参数
- `output`：已通过 Zod Schema 验证的输出对象
- 类型安全：`z.infer<TOutput>` 确保类型匹配

#### 返回值
- 字符串：最终返回给主代理的内容

#### 示例

**简单 JSON 序列化**：
```typescript
processOutput: (output) => JSON.stringify(output, null, 2)
```

**自定义格式化**：
```typescript
processOutput: (output) => {
  const lines = [
    '# Investigation Report',
    '',
    '## Summary',
    output.SummaryOfFindings,
    '',
    '## Relevant Files',
    ...output.RelevantLocations.map(loc => 
      `- ${loc.FilePath}: ${loc.Reasoning}`
    ),
    '',
    '## Exploration Steps',
    ...output.ExplorationTrace.map((step, i) => 
      `${i + 1}. ${step}`
    )
  ];
  return lines.join('\n');
}
```

**Markdown 表格**：
```typescript
processOutput: (output) => {
  const table = [
    '| File | Symbols | Reasoning |',
    '|------|---------|-----------|',
    ...output.RelevantLocations.map(loc =>
      `| ${loc.FilePath} | ${loc.KeySymbols.join(', ')} | ${loc.Reasoning} |`
    )
  ];
  return table.join('\n');
}
```

## 完整示例

### 示例 1：代码库调查器

```typescript
const CodebaseInvestigatorAgent: AgentDefinition<
  typeof CodebaseInvestigationReportSchema
> = {
  name: 'codebase_investigator',
  displayName: 'Codebase Investigator Agent',
  
  description: `
    Your primary tool for multifile search tasks and codebase exploration.
    Returns a structured JSON report with key file paths, symbols, and insights.
  `,
  
  inputConfig: {
    inputs: {
      objective: {
        description: 'A comprehensive description of the investigation goal',
        type: 'string',
        required: true
      }
    }
  },
  
  outputConfig: {
    outputName: 'report',
    description: 'The final investigation report as a JSON object',
    schema: z.object({
      SummaryOfFindings: z.string(),
      ExplorationTrace: z.array(z.string()),
      RelevantLocations: z.array(
        z.object({
          FilePath: z.string(),
          Reasoning: z.string(),
          KeySymbols: z.array(z.string())
        })
      )
    })
  },
  
  processOutput: (output) => JSON.stringify(output, null, 2),
  
  modelConfig: {
    model: 'gemini-2.5-pro',
    temp: 0.1,
    top_p: 0.95,
    thinkingBudget: -1
  },
  
  runConfig: {
    max_time_minutes: 5,
    max_turns: 15
  },
  
  toolConfig: {
    tools: ['ls', 'read_file', 'glob', 'grep']
  },
  
  promptConfig: {
    query: `
      Investigate the codebase for:
      <objective>\${objective}</objective>
    `,
    systemPrompt: `
      You are Codebase Investigator, a specialized AI agent.
      
      Your goal: Build a complete mental model of relevant code.
      
      Rules:
      1. Deep analysis, not just file finding
      2. Systematic exploration
      3. Track questions in scratchpad
      4. Call complete_task when done
    `
  }
};
```

### 示例 2：测试生成器

```typescript
const TestGeneratorAgent: AgentDefinition<typeof TestSuiteSchema> = {
  name: 'test_generator',
  displayName: 'Test Generator Agent',
  
  description: `
    Generates comprehensive test suites for given code files.
    Analyzes code structure and creates unit tests with edge cases.
  `,
  
  inputConfig: {
    inputs: {
      file_path: {
        description: 'Path to the source file to test',
        type: 'string',
        required: true
      },
      test_framework: {
        description: 'Testing framework to use (jest, vitest, mocha)',
        type: 'string',
        required: false
      },
      coverage_target: {
        description: 'Target code coverage percentage',
        type: 'integer',
        required: false
      }
    }
  },
  
  outputConfig: {
    outputName: 'test_suite',
    description: 'Generated test suite with test cases',
    schema: z.object({
      test_file_path: z.string(),
      test_code: z.string(),
      test_cases: z.array(
        z.object({
          name: z.string(),
          description: z.string(),
          type: z.enum(['unit', 'integration', 'edge_case'])
        })
      ),
      coverage_estimate: z.number()
    })
  },
  
  processOutput: (output) => `
# Test Suite Generated

File: ${output.test_file_path}
Estimated Coverage: ${output.coverage_estimate}%

## Test Cases (${output.test_cases.length})
${output.test_cases.map(tc => `- ${tc.name} (${tc.type})`).join('\n')}

## Code
\`\`\`typescript
${output.test_code}
\`\`\`
  `,
  
  modelConfig: {
    model: 'gemini-2.5-pro',
    temp: 0.3,
    top_p: 0.95,
    thinkingBudget: -1
  },
  
  runConfig: {
    max_time_minutes: 3,
    max_turns: 10
  },
  
  toolConfig: {
    tools: ['read_file', 'grep', 'glob']
  },
  
  promptConfig: {
    query: `
      Generate comprehensive tests for: \${file_path}
      Framework: \${test_framework || 'auto-detect'}
      Target coverage: \${coverage_target || 80}%
    `,
    systemPrompt: `
      You are Test Generator, an expert in writing comprehensive test suites.
      
      Your process:
      1. Read and analyze the source file
      2. Identify all functions, classes, and edge cases
      3. Generate test cases covering:
         - Happy paths
         - Error conditions
         - Edge cases
         - Boundary values
      4. Write clean, maintainable test code
      5. Call complete_task with the test suite
    `
  }
};
```

## 最佳实践

### 1. 命名规范
- 使用描述性的 `name`
- 提供友好的 `displayName`
- 编写清晰的 `description`

### 2. 提示工程
- `systemPrompt` 要详细但不冗长
- 使用结构化格式（标题、列表）
- 明确终止条件
- 提供示例（通过 `initialMessages`）

### 3. 模型选择
- 复杂任务用 `gemini-2.5-pro`
- 简单任务用 `gemini-2.5-flash`
- 精确任务用低温度（0.1-0.3）
- 创意任务用高温度（0.7-1.0）

### 4. 超时设置
- 根据任务复杂度设置 `max_time_minutes`
- 添加 `max_turns` 作为额外保护
- 考虑工具调用的平均耗时

### 5. 工具选择
- 只授予必要的工具
- 优先使用只读工具
- 避免交互式工具
- 考虑工具的组合效果

### 6. 输出设计
- 使用 Zod Schema 确保类型安全
- 设计清晰的输出结构
- 提供有意义的字段描述
- 实现有用的 `processOutput`

### 7. 模板使用
- 在 `systemPrompt` 和 `query` 中使用 `${variable}`
- 确保所有引用的变量都在 `inputConfig` 中定义
- 使用清晰的变量名

## 常见错误

### 1. 缺少必需字段
```typescript
// ❌ 错误：缺少 inputConfig
const BadAgent: AgentDefinition = {
  name: 'bad_agent',
  description: '...',
  // 缺少 inputConfig!
};

// ✅ 正确
const GoodAgent: AgentDefinition = {
  name: 'good_agent',
  description: '...',
  inputConfig: { inputs: {} },  // 即使没有输入也要提供
  // ...
};
```

### 2. 模板变量未定义
```typescript
// ❌ 错误：query 中使用了未定义的变量
promptConfig: {
  query: 'Analyze ${file_path}'  // file_path 未在 inputConfig 中定义
}

// ✅ 正确
inputConfig: {
  inputs: {
    file_path: { type: 'string', required: true, description: '...' }
  }
},
promptConfig: {
  query: 'Analyze ${file_path}'
}
```

### 3. 输出 Schema 不匹配
```typescript
// ❌ 错误：processOutput 期望的类型与 schema 不匹配
outputConfig: {
  schema: z.string()
},
processOutput: (output) => output.field  // output 是 string，没有 field

// ✅ 正确
outputConfig: {
  schema: z.object({ field: z.string() })
},
processOutput: (output) => output.field
```

### 4. 使用交互式工具
```typescript
// ❌ 错误：delete_file 需要用户确认
toolConfig: {
  tools: ['read_file', 'delete_file']  // 会在启动时失败
}

// ✅ 正确：只使用非交互式工具
toolConfig: {
  tools: ['read_file', 'grep', 'ls']
}
```

## 总结

`AgentDefinition` 是子代理系统的核心，它通过声明式配置实现了：

- **清晰的接口**：所有配置集中在一个对象中
- **类型安全**：TypeScript 和 Zod 提供编译时和运行时保证
- **灵活性**：支持多种工具类型和输出格式
- **可维护性**：配置与执行逻辑分离
- **可测试性**：独立的定义便于单元测试

掌握 `AgentDefinition` 的各个部分，就能创建功能强大、行为可控的子代理。
