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
    enabled?: boolean
    providers?: LocalByokProvider[]
  }
}

export interface ChatMessage {
  role: "system" | "user" | "assistant"
  content: string
}

export interface ResolvedAIProvider {
  provider: string
  baseURL: string
  apiKey: string
  model: string
}

function getUIByokProviders(): LocalByokProvider[] {
  if (typeof window === "undefined" || !window.localStorage) {
    return []
  }
  const raw = window.localStorage.getItem("follow:ai")
  if (!raw) return []
  const parsed = JSON.parse(raw) as LocalAISettings
  if (!parsed.byok?.providers || !Array.isArray(parsed.byok.providers)) {
    return []
  }
  return parsed.byok.providers.filter((p) => Boolean(p.apiKey?.trim()))
}

function getUIByokProvider(preferredModel?: string | null): LocalByokProvider | null {
  const providers = getUIByokProviders()
  if (providers.length === 0) return null
  let targetModel = preferredModel?.trim()
  if (!targetModel && typeof window !== "undefined") {
    const rawModel = window.localStorage.getItem("follow:ai-chat-model")
    if (rawModel) {
      targetModel = (JSON.parse(rawModel) as { selectedModel?: string })?.selectedModel?.trim()
    }
  }
  if (targetModel) {
    const matched = providers.find((p) => p.model?.trim() === targetModel)
    if (matched) return matched
  }
  return providers[0]
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

  static getProvider(selectedModel?: string | null): ResolvedAIProvider | null {
    const uiProvider = getUIByokProvider(selectedModel)
    if (uiProvider?.apiKey) {
      const isGoogle = uiProvider.provider === "google"
      const defaultModel = isGoogle ? CustomAIConfig.geminiModel || "gemini-1.5-flash" : CustomAIConfig.customModel || "gpt-4o-mini"
      const model = selectedModel?.trim() || uiProvider.model?.trim() || defaultModel
      const defaultBaseURL = isGoogle ? CustomAIConfig.geminiBaseURL : CustomAIConfig.customBaseURL
      const baseURL = uiProvider.baseURL || defaultBaseURL
      return {
        provider: uiProvider.provider,
        baseURL,
        apiKey: uiProvider.apiKey,
        model,
      }
    }

    if (!this.isConfigured) return null

    switch (CustomAIConfig.provider) {
      case "openai_compatible":
        return {
          provider: "openai_compatible",
          baseURL: CustomAIConfig.customBaseURL,
          apiKey: CustomAIConfig.customApiKey,
          model: selectedModel || CustomAIConfig.customModel,
        }
      case "openai":
        return {
          provider: "openai",
          baseURL: CustomAIConfig.openaiBaseURL,
          apiKey: CustomAIConfig.openaiApiKey,
          model: selectedModel || CustomAIConfig.openaiModel,
        }
      case "gemini":
        return {
          provider: "google",
          baseURL: CustomAIConfig.geminiBaseURL,
          apiKey: CustomAIConfig.geminiApiKey,
          model: selectedModel || CustomAIConfig.geminiModel,
        }
      case "deepseek":
      default:
        return {
          provider: "deepseek",
          baseURL: CustomAIConfig.deepseekBaseURL,
          apiKey: CustomAIConfig.deepseekApiKey,
          model: selectedModel || CustomAIConfig.deepseekModel,
        }
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

    let cleanBaseURL = baseURL.trim().replace(/\/+$/, "")
    if (cleanBaseURL.endsWith("/chat/completions")) {
      cleanBaseURL = cleanBaseURL.replace(/\/chat\/completions$/, "")
    }
    if (cleanBaseURL === "https://api.openai.com") {
      cleanBaseURL = "https://api.openai.com/v1"
    }

    const response = await fetch(`${cleanBaseURL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey.trim()}`,
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

    if (!response.ok) {
      const errText = await response.text()
      return `AI 接口调用失败 [${response.status}]: ${errText.slice(0, 300) || response.statusText}`
    }

    const data = (await response.json()) as ChatCompletionResponse
    return data.choices?.[0]?.message?.content?.trim() || "AI 返回内容为空"
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

    const cleanBaseURL = baseURL.trim().replace(/\/+$/, "")
    const url = `${cleanBaseURL}/models/${model}:generateContent?key=${apiKey.trim()}`

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

    if (!response.ok) {
      const errText = await response.text()
      return `Gemini 接口调用失败 [${response.status}]: ${errText.slice(0, 300) || response.statusText}`
    }

    const data = (await response.json()) as GeminiGenerateResponse
    return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "AI 返回内容为空"
  }

  private static async requestChat(
    prompt: string,
    content: string,
    selectedModel?: string | null,
  ): Promise<string> {
    const provider = this.getProvider(selectedModel)
    if (!provider) return ""

    if (provider.provider === "google") {
      return this.requestGemini(provider.baseURL, provider.apiKey, provider.model, prompt, content)
    }
    return this.requestOpenAICompatible(
      provider.baseURL,
      provider.apiKey,
      provider.model,
      prompt,
      content,
    )
  }

  static async generateSummary(
    text: string,
    targetLanguage: string,
    selectedModel?: string | null,
  ): Promise<string> {
    const prompt = `You are a concise summarizer. Summarize the following content in ${targetLanguage}. Output only the summary without conversational prefixes.`
    return this.requestChat(prompt, text, selectedModel)
  }

  static async translateText(
    text: string,
    targetLanguage: string,
    selectedModel?: string | null,
  ): Promise<string> {
    if (!text.trim()) return text
    const prompt = `You are a professional translator. Translate the text into ${targetLanguage}. Preserve formatting, HTML tags, and markdown elements accurately. Output only the translated text.`
    return this.requestChat(prompt, text, selectedModel)
  }

  static async streamChat(
    messages: ChatMessage[],
    selectedModel?: string | null,
    signal?: AbortSignal,
  ): Promise<ReadableStream<string>> {
    const provider = this.getProvider(selectedModel)
    if (!provider) {
      throw new Error("未配置可用的 AI 模型供应商")
    }

    if (provider.provider === "google") {
      const cleanBaseURL = provider.baseURL.trim().replace(/\/+$/, "")
      const url = `${cleanBaseURL}/models/${provider.model}:streamGenerateContent?alt=sse&key=${provider.apiKey.trim()}`
      const contents = messages.map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      }))

      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents }),
        signal,
      })

      if (!response.ok) {
        const err = await response.text()
        throw new Error(`Gemini 调用失败 [${response.status}]: ${err.slice(0, 300)}`)
      }

      if (!response.body) throw new Error("响应体为空")

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ""

      return new ReadableStream<string>({
        async pull(controller) {
          const { done, value } = await reader.read()
          if (done) {
            controller.close()
            return
          }
          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split("\n")
          buffer = lines.pop() || ""

          for (const line of lines) {
            const trimmed = line.trim()
            if (!trimmed.startsWith("data:")) continue
            const dataStr = trimmed.slice(5).trim()
            if (!dataStr) continue
            const json = JSON.parse(dataStr) as GeminiGenerateResponse
            const text = json.candidates?.[0]?.content?.parts?.[0]?.text
            if (text) controller.enqueue(text)
          }
        },
        cancel() {
          reader.cancel()
        },
      })
    }

    let cleanBaseURL = provider.baseURL.trim().replace(/\/+$/, "")
    if (cleanBaseURL.endsWith("/chat/completions")) {
      cleanBaseURL = cleanBaseURL.replace(/\/chat\/completions$/, "")
    }
    if (cleanBaseURL === "https://api.openai.com") {
      cleanBaseURL = "https://api.openai.com/v1"
    }

    const response = await fetch(`${cleanBaseURL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${provider.apiKey.trim()}`,
      },
      body: JSON.stringify({
        model: provider.model,
        messages,
        stream: true,
        temperature: 0.7,
      }),
      signal,
    })

    if (!response.ok) {
      const err = await response.text()
      throw new Error(`AI 服务调用失败 [${response.status}]: ${err.slice(0, 300)}`)
    }

    if (!response.body) throw new Error("响应体为空")

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ""

    return new ReadableStream<string>({
      async pull(controller) {
        const { done, value } = await reader.read()
        if (done) {
          controller.close()
          return
        }
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split("\n")
        buffer = lines.pop() || ""

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed.startsWith("data:")) continue
          const dataStr = trimmed.slice(5).trim()
          if (dataStr === "[DONE]") {
            controller.close()
            return
          }
          if (!dataStr) continue
          const json = JSON.parse(dataStr) as { choices?: Array<{ delta?: { content?: string } }> }
          const deltaContent = json.choices?.[0]?.delta?.content
          if (deltaContent) controller.enqueue(deltaContent)
        }
      },
      cancel() {
        reader.cancel()
      },
    })
  }
}
