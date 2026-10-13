export type CustomAIProvider = "openai_compatible" | "deepseek" | "openai" | "gemini"

export class CustomAIConfig {
  static readonly enabled: boolean = true
  static readonly provider: CustomAIProvider = "openai_compatible"

  // 自定义 OpenAI 兼容服务商（支持自定义 URL、自建中转、OneAPI、NewAPI、Ollama 等）
  static readonly customBaseURL: string = "https://api.openai.com/v1"
  static readonly customApiKey: string = ""
  static readonly customModel: string = "gpt-4o-mini"

  // DeepSeek 配置
  static readonly deepseekApiKey: string = ""
  static readonly deepseekBaseURL: string = "https://api.deepseek.com/v1"
  static readonly deepseekModel: string = "deepseek-chat"

  // 官方 OpenAI 配置
  static readonly openaiApiKey: string = ""
  static readonly openaiBaseURL: string = "https://api.openai.com/v1"
  static readonly openaiModel: string = "gpt-4o-mini"

  // Gemini 配置
  static readonly geminiApiKey: string = ""
  static readonly geminiBaseURL: string = "https://generativelanguage.googleapis.com/v1beta"
  static readonly geminiModel: string = "gemini-1.5-flash"

  static readonly timeoutMs: number = 30000
}
