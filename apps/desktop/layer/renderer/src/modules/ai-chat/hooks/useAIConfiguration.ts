import { useQuery } from "@tanstack/react-query"

import { useAISettingValue } from "~/atoms/settings/ai"
import { followApi } from "~/lib/api-client"

interface RawByokProvider {
  provider: string
  baseURL?: string | null
  apiKey?: string | null
  model?: string | null
  availableModels?: string[]
}

const DEFAULT_MODELS_BY_PROVIDER: Record<string, string[]> = {
  openai: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "o1-mini"],
  google: ["gemini-1.5-flash", "gemini-1.5-pro", "gemini-2.0-flash-exp"],
  deepseek: ["deepseek-chat", "deepseek-coder", "deepseek-reasoner"],
  anthropic: ["claude-3-5-sonnet-20241022", "claude-3-5-haiku-20241022"],
}

function getLocalByokProviders(): RawByokProvider[] {
  if (typeof window === "undefined" || !window.localStorage) {
    return []
  }
  const raw = window.localStorage.getItem("follow:ai")
  if (!raw) return []
  const parsed = JSON.parse(raw) as { byok?: { providers?: RawByokProvider[] } }
  if (!parsed.byok?.providers || !Array.isArray(parsed.byok.providers)) {
    return []
  }
  return parsed.byok.providers.filter((p) => Boolean(p.apiKey?.trim()))
}

export const useAIConfiguration = () => {
  const aiSettings = useAISettingValue()
  const storeProviders = aiSettings?.byok?.providers?.filter((p) => Boolean(p.apiKey?.trim())) || []
  const localProviders = getLocalByokProviders()
  const validProviders = storeProviders.length > 0 ? storeProviders : localProviders
  const hasByok = validProviders.length > 0

  return useQuery({
    queryKey: [
      "aiConfiguration",
      hasByok,
      validProviders.map((p) => `${p.provider}:${p.model}:${p.availableModels?.join(",")}`),
    ],
    queryFn: async () => {
      if (hasByok) {
        const availableModels: string[] = []
        const availableModelsMenu: Array<{ label: string; value: string; paidLevel?: string }> = []

        validProviders.forEach((p) => {
          const defaultFallback = p.provider === "google" ? "gemini-1.5-flash" : "gpt-4o-mini"
          const primaryModel = p.model?.trim() || defaultFallback
          const presetModels = DEFAULT_MODELS_BY_PROVIDER[p.provider] || []
          const rawModelList =
            Array.isArray(p.availableModels) && p.availableModels.length > 0
              ? p.availableModels
              : [primaryModel, ...presetModels]

          const modelList = [
            primaryModel,
            ...rawModelList.filter((m) => m && m !== primaryModel),
          ]

          modelList.forEach((modelName) => {
            if (!availableModels.includes(modelName)) {
              availableModels.push(modelName)
              availableModelsMenu.push({
                label: `${modelName} (${p.provider})`,
                value: modelName,
              })
            }
          })
        })

        return {
          defaultModel: availableModels[0] || "gpt-4o-mini",
          availableModels,
          availableModelsMenu,
          usage: {
            total: 0,
            used: 0,
          },
          rateLimit: {
            warningLevel: "safe",
            usageRate: 0,
          },
        }
      }

      return followApi.ai.config()
    },
    staleTime: hasByok ? 0 : 5 * 60 * 1000,
    retry: false,
  })
}
