import * as v from 'valibot';

// Provider 配置 Schema
export const ProviderConfigSchema = v.object({
  apiKey: v.optional(v.string()), // 支持环境变量引用如 ${ANTHROPIC_API_KEY}
  baseUrl: v.optional(v.pipe(v.string(), v.url())),
  timeout: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1)), 60000),
});

export type ProviderConfig = v.InferOutput<typeof ProviderConfigSchema>;

// Providers 配置 Schema（支持多供应商）
export const ProvidersConfigSchema = v.optional(v.record(v.string(), ProviderConfigSchema), {});

export type ProvidersConfig = v.InferOutput<typeof ProvidersConfigSchema>;

// Model 配置 Schema
export const ModelConfigSchema = v.object({
  current: v.string(), // 当前使用的模型 ID（格式：provider/model）
  fallback: v.optional(v.string()), // 备用模型
});

export type ModelConfig = v.InferOutput<typeof ModelConfigSchema>;

// UI 配置 Schema
export const UIConfigSchema = v.object({
  theme: v.optional(v.string(), 'kanagawa'), // 主题名称
  mode: v.optional(v.picklist(['dark', 'light']), 'dark'), // 亮色/暗色模式
  currency: v.optional(v.picklist(['CNY', 'USD']), 'CNY'), // 货币类型
  exchangeRate: v.optional(v.pipe(v.number(), v.minValue(0.01)), 7.2), // 汇率（CNY to USD）
  approvalMode: v.optional(v.picklist(['default', 'auto_edit', 'yolo']), 'default'), // 工具批准模式
});

export type UIConfig = v.InferOutput<typeof UIConfigSchema>;

// Session 配置 Schema
export const SessionConfigSchema = v.object({
  lastSessionId: v.optional(v.string()), // 上次打开的会话 ID
  autoSave: v.optional(v.boolean(), true), // 是否启用自动保存
  saveDebounce: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1)), 500), // 防抖延迟（毫秒）
});

export type SessionConfig = v.InferOutput<typeof SessionConfigSchema>;

// 完整配置 Schema
export const ReasonCliConfigSchema = v.object({
  model: ModelConfigSchema,
  providers: ProvidersConfigSchema,
  ui: UIConfigSchema,
  session: SessionConfigSchema,
});

export type ReasonCliConfig = v.InferOutput<typeof ReasonCliConfigSchema>;

// 部分配置 Schema（用于配置更新）
export const PartialConfigSchema = v.partial(ReasonCliConfigSchema);

export type PartialConfig = v.InferOutput<typeof PartialConfigSchema>;

// 验证配置
export function validateConfig(config: unknown): ReasonCliConfig {
  return v.parse(ReasonCliConfigSchema, config);
}

// 验证部分配置
export function validatePartialConfig(config: unknown): Partial<ReasonCliConfig> {
  return v.parse(PartialConfigSchema, config);
}

// 安全验证（返回结果而非抛出错误）
export function safeValidateConfig(config: unknown): {
  success: boolean;
  data?: ReasonCliConfig;
  error?: v.ValiError<typeof ReasonCliConfigSchema>;
} {
  const result = v.safeParse(ReasonCliConfigSchema, config);
  if (result.success) {
    return { success: true, data: result.output };
  }
  return { success: false, error: result.issues as any };
}
