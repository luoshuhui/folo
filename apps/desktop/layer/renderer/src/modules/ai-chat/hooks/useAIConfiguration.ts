import { useQuery } from "@tanstack/react-query"

import { useAISettingValue } from "~/atoms/settings/ai"
import { followApi } from "~/lib/api-client"

export const useAIConfiguration = () => {
  const aiSettings = useAISettingValue()
  const byok = aiSettings?.byok
  const validProviders = byok?.providers?.filter((p) => Boolean(p.apiKey?.trim())) || []
  const hasByok = validProviders.length > 0

  return useQuery({
    queryKey: ["aiConfiguration", hasByok, validProviders],
    queryFn: async () => {
      if (hasByok) {
        const availableModels: string[] = []
        const availableModelsMenu: Array<{ label: string; value: string; paidLevel?: string }> = []

        validProviders.forEach((p) => {
          const defaultFallback = p.provider === "google" ? "gemini-1.5-flash" : "gpt-4o-mini"
          const primaryModel = p.model?.trim() || defaultFallback
          const modelList = Array.isArray(p.availableModels) && p.availableModels.length > 0
            ? [primaryModel, ...p.availableModels.filter((m) => m !== primaryModel)]
            : [primaryModel]

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
        }
      }

      return followApi.ai.config()
    },
    staleTime: 5 * 60 * 1000,
    retry: false,
  })
}
