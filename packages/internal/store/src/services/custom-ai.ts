import { CustomAIConfig } from "@follow/shared"

interface ChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string
    }
  }>
}

interface GeminiGenerateResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string
      }>
    }
  }>
}

interface LocalByokProvider {
  provider: string
  baseURL?: string | null
  apiKey?: string | null
  model?: string | null
}

interface LocalAISettings {
  byok?: {
    enabled: boolean
    providers: LocalByokProvider[]
  }
}

function getUIByokProvider(): LocalByokProvider | null {
  if (typeof window === "undefined" || !window.localStorage) {
    return null
  }
  const raw = window.localStorage.getItem("follow:ai")
  if (!raw) return null
  const parsed = JSON.parse(raw) as LocalAISettings
  if (!parsed.byok?.enabled || !Array.isArray(parsed.byok.providers)) {
    return null
  }
  return parsed.byok.providers.find((p) => Boolean(p.apiKey)) || null
}

export class CustomAIService {
  static get isConfigured(): boolean {
    if (getUIByokProvider()?.apiKey) {
      return true
    }
    if (!CustomAIConfig.enabled) return false
    switch (CustomAIConfig.provider) {
      case "openai_compatible":
        return Boolean(CustomAIConfig.customApiKey)
      case "openai":
        return Boolean(CustomAIConfig.openaiApiKey)
      case "gemini":
        return Boolean(CustomAIConfig.geminiApiKey)
      case "deepseek":
      default:
        return Boolean(CustomAIConfig.deepseekApiKey)
    }
  }

  private static async requestOpenAICompatible(
    baseURL: string,
    apiKey: string,
    model: string,
    prompt: string,
    content: string,
  ): Promise<string> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), CustomAIConfig.timeoutMs)

    const cleanBaseURL = baseURL.replace(/\/+$/, "").replace(/\/chat\/completions$/, "")
    const response = await fetch(`${cleanBaseURL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: prompt },
          { role: "user", content },
        ],
        temperature: 0.3,
      }),
      signal: controller.signal,
    })

    clearTimeout(timer)

    if (!response.ok) return ""

    const data = (await response.json()) as ChatCompletionResponse
    return data.choices?.[0]?.message?.content?.trim() || ""
  }

  private static async requestGemini(
    baseURL: string,
    apiKey: string,
    model: string,
    prompt: string,
    content: string,
  ): Promise<string> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), CustomAIConfig.timeoutMs)

    const cleanBaseURL = baseURL.replace(/\/+$/, "")
    const url = `${cleanBaseURL}/models/${model}:generateContent?key=${apiKey}`

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: `${prompt}\n\n${content}` }],
          },
        ],
        generationConfig: {
          temperature: 0.3,
        },
      }),
      signal: controller.signal,
    })

    clearTimeout(timer)

    if (!response.ok) return ""

    const data = (await response.json()) as GeminiGenerateResponse
    return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || ""
  }

  private static async requestChat(prompt: string, content: string): Promise<string> {
    const uiProvider = getUIByokProvider()
    if (uiProvider?.apiKey) {
      if (uiProvider.provider === "google") {
        const baseURL = uiProvider.baseURL || CustomAIConfig.geminiBaseURL
        const model = uiProvider.model?.trim() || CustomAIConfig.geminiModel
        return this.requestGemini(baseURL, uiProvider.apiKey, model, prompt, content)
      }
      const baseURL = uiProvider.baseURL || CustomAIConfig.customBaseURL
      const model = uiProvider.model?.trim() || CustomAIConfig.customModel
      return this.requestOpenAICompatible(baseURL, uiProvider.apiKey, model, prompt, content)
    }

    if (!this.isConfigured) return ""

    switch (CustomAIConfig.provider) {
      case "openai_compatible":
        return this.requestOpenAICompatible(
          CustomAIConfig.customBaseURL,
          CustomAIConfig.customApiKey,
          CustomAIConfig.customModel,
          prompt,
          content,
        )
      case "openai":
        return this.requestOpenAICompatible(
          CustomAIConfig.openaiBaseURL,
          CustomAIConfig.openaiApiKey,
          CustomAIConfig.openaiModel,
          prompt,
          content,
        )
      case "gemini":
        return this.requestGemini(
          CustomAIConfig.geminiBaseURL,
          CustomAIConfig.geminiApiKey,
          CustomAIConfig.geminiModel,
          prompt,
          content,
        )
      case "deepseek":
      default:
        return this.requestOpenAICompatible(
          CustomAIConfig.deepseekBaseURL,
          CustomAIConfig.deepseekApiKey,
          CustomAIConfig.deepseekModel,
          prompt,
          content,
        )
    }
  }

  static async generateSummary(text: string, targetLanguage: string): Promise<string> {
    const prompt = `You are a concise summarizer. Summarize the following content in ${targetLanguage}. Output only the summary without conversational prefixes.`
    return this.requestChat(prompt, text)
  }

  static async translateText(text: string, targetLanguage: string): Promise<string> {
    if (!text.trim()) return text
    const prompt = `You are a professional translator. Translate the text into ${targetLanguage}. Preserve formatting, HTML tags, and markdown elements accurately. Output only the translated text.`
    return this.requestChat(prompt, text)
  }
}
