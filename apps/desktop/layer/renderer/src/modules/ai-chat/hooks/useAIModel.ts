import { useEffect, useMemo } from "react"

import { setAIModelState, useAIModelState } from "../atoms/session"
import { useAIConfiguration } from "./useAIConfiguration"

export const useAIModel = () => {
  const { data: configuration, isLoading } = useAIConfiguration()
  const modelState = useAIModelState()

  // Validate and sync persistent model with available models
  useEffect(() => {
    if (!configuration || isLoading) return

    const { selectedModel } = modelState
    const { defaultModel, availableModels = [] } = configuration

    const isAvailable = (name: string | null) => {
      if (!name) return false
      if (availableModels.includes(name)) return true
      const pure = name.includes("/") ? name.split("/").slice(1).join("/") : name
      return availableModels.some(
        (m) => m === pure || (m.includes("/") && m.split("/").slice(1).join("/") === pure),
      )
    }

    if (!selectedModel || !isAvailable(selectedModel)) {
      setAIModelState({
        selectedModel: defaultModel || null,
      })
    }
  }, [configuration, isLoading, modelState])

  // Get current effective model
  const currentModel = useMemo(() => {
    if (!configuration) return null

    const { selectedModel } = modelState
    const { defaultModel, availableModels = [] } = configuration

    if (selectedModel) {
      if (availableModels.includes(selectedModel)) return selectedModel
      const pure = selectedModel.includes("/")
        ? selectedModel.split("/").slice(1).join("/")
        : selectedModel
      const matched = availableModels.find(
        (m) => m === pure || (m.includes("/") && m.split("/").slice(1).join("/") === pure),
      )
      if (matched) return matched
    }

    return defaultModel || null
  }, [configuration, modelState])

  const changeModel = (model: string) => {
    const available = configuration?.availableModels || []
    const pure = model.includes("/") ? model.split("/").slice(1).join("/") : model
    const matched = available.find(
      (m) => m === model || m === pure || (m.includes("/") && m.split("/").slice(1).join("/") === pure),
    )

    if (!matched) {
      console.warn(`Model ${model} is not available in current configuration`)
      return
    }

    setAIModelState({
      selectedModel: matched,
    })
  }

  return {
    data: {
      defaultModel: configuration?.defaultModel,
      availableModels: configuration?.availableModels,
      availableModelsMenu: configuration?.availableModelsMenu,
      currentModel,
    },
    isLoading,
    changeModel,
  }
}
