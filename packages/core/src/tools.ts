import { z } from 'zod'

/**
 * 工具参数 Schema
 */
export const ToolParameterSchema = z.object({
  type: z.string(),
  description: z.string(),
  required: z.boolean().optional(),
})

/**
 * 工具接口
 */
export interface Tool {
  /** 工具名称 */
  name: string
  /** 工具描述 */
  description: string
  /** 参数定义 */
  parameters?: z.ZodSchema
  /** 执行函数 */
  execute: (params: unknown) => Promise<unknown>
}

/**
 * 创建工具的辅助函数
 */
export function createTool<T extends z.ZodSchema>(config: {
  name: string
  description: string
  parameters?: T
  execute: (params: z.infer<T>) => Promise<unknown>
}): Tool {
  return {
    name: config.name,
    description: config.description,
    parameters: config.parameters,
    execute: async (params: unknown) => {
      // 验证参数
      if (config.parameters) {
        const validated = config.parameters.parse(params)
        return config.execute(validated)
      }
      return config.execute(params as z.infer<T>)
    },
  }
}

/**
 * 示例工具：计算器
 */
export const calculatorTool = createTool({
  name: 'calculator',
  description: 'Perform basic math calculations',
  parameters: z.object({
    operation: z.enum(['add', 'subtract', 'multiply', 'divide']),
    a: z.number(),
    b: z.number(),
  }),
  execute: async (params) => {
    switch (params.operation) {
      case 'add':
        return params.a + params.b
      case 'subtract':
        return params.a - params.b
      case 'multiply':
        return params.a * params.b
      case 'divide':
        if (params.b === 0) throw new Error('Division by zero')
        return params.a / params.b
    }
  },
})
