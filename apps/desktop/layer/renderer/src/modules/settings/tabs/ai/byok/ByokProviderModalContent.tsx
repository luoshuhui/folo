import { Button } from "@follow/components/ui/button/index.js"
import { Input } from "@follow/components/ui/input/index.js"
import { Label } from "@follow/components/ui/label/index.jsx"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@follow/components/ui/select/index.js"
import type { ByokProviderName, UserByokProviderConfig } from "@follow/shared/settings/interface"
import { cn } from "@follow/utils"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { PROVIDER_OPTIONS } from "./constants"

interface ByokProviderModalContentProps {
  provider: UserByokProviderConfig | null
  configuredProviders?: ByokProviderName[]
  onSave: (provider: UserByokProviderConfig) => void
  onCancel: () => void
}

const EMPTY_CONFIGURED_PROVIDERS: ByokProviderName[] = []

async function fetchRemoteModels({
  provider,
  baseURL,
  apiKey,
}: {
  provider: ByokProviderName
  baseURL?: string | null
  apiKey?: string | null
}): Promise<string[]> {
  if (!apiKey) return []

  if (provider === "google") {
    const cleanBaseURL = (baseURL || "https://generativelanguage.googleapis.com/v1beta").replace(/\/+$/, "")
    const response = await fetch(`${cleanBaseURL}/models?key=${apiKey}`)
    if (!response.ok) return []
    const data = await response.json()
    const list = Array.isArray(data.models) ? data.models : []
    return list
      .map((item: { name?: string }) => item.name?.replace(/^models\//, ""))
      .filter((name: string | undefined): name is string => Boolean(name))
  }

  const cleanBaseURL = (baseURL || "https://api.openai.com/v1")
    .replace(/\/+$/, "")
    .replace(/\/chat\/completions$/, "")
  const response = await fetch(`${cleanBaseURL}/models`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  })
  if (!response.ok) return []
  const data = await response.json()
  const list = Array.isArray(data.data) ? data.data : Array.isArray(data) ? data : []
  return list
    .map((item: { id?: string }) => item.id)
    .filter((id: string | undefined): id is string => Boolean(id))
    .sort()
}

export const ByokProviderModalContent = ({
  provider,
  configuredProviders = EMPTY_CONFIGURED_PROVIDERS,
  onSave,
  onCancel,
}: ByokProviderModalContentProps) => {
  const { t } = useTranslation("ai")

  const availableProviders = PROVIDER_OPTIONS.filter(
    (option) => !configuredProviders.includes(option.value) || option.value === provider?.provider,
  )

  const defaultProvider = availableProviders[0]?.value ?? provider?.provider ?? "openai"

  const [formData, setFormData] = useState<UserByokProviderConfig>({
    provider: provider?.provider ?? defaultProvider,
    baseURL: provider?.baseURL ?? null,
    apiKey: provider?.apiKey ?? null,
    model: provider?.model ?? null,
    headers: provider?.headers ?? {},
  })

  const [isLoadingModels, setIsLoadingModels] = useState(false)
  const [availableModels, setAvailableModels] = useState<string[]>([])

  const handleFetchModels = async () => {
    if (!formData.apiKey) {
      toast.error("Please enter the API Key first")
      return
    }

    setIsLoadingModels(true)
    const models = await fetchRemoteModels({
      provider: formData.provider,
      baseURL: formData.baseURL,
      apiKey: formData.apiKey,
    })
    setIsLoadingModels(false)

    if (models.length === 0) {
      toast.error("Failed to load models. You can enter the model name manually.")
      return
    }

    setAvailableModels(models)
    if (!formData.model && models.length > 0) {
      setFormData((prev) => ({ ...prev, model: models[0] }))
    }
    toast.success(`Successfully loaded ${models.length} models`)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.provider) {
      return
    }
    onSave(formData)
  }

  return (
    <form onSubmit={handleSubmit} className="min-w-[42ch] space-y-4">
      <div className="space-y-2">
        <Label htmlFor="provider">{t("byok.providers.form.provider")}</Label>
        <Select
          value={formData.provider}
          disabled={availableProviders.length === 0}
          onValueChange={(value) =>
            setFormData({ ...formData, provider: value as ByokProviderName })
          }
        >
          <SelectTrigger id="provider">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {availableProviders.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="baseURL">{t("byok.providers.form.base_url")}</Label>
        <Input
          id="baseURL"
          type="url"
          placeholder={t("byok.providers.form.base_url_placeholder")}
          value={formData.baseURL ?? ""}
          onChange={(e) =>
            setFormData({
              ...formData,
              baseURL: e.target.value || null,
            })
          }
        />
        <p className="text-xs text-text-secondary">{t("byok.providers.form.base_url_help")}</p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="apiKey">{t("byok.providers.form.api_key")}</Label>
        <Input
          id="apiKey"
          type="password"
          placeholder={t("byok.providers.form.api_key_placeholder")}
          value={formData.apiKey ?? ""}
          onChange={(e) =>
            setFormData({
              ...formData,
              apiKey: e.target.value || null,
            })
          }
        />
        <p className="text-xs text-text-secondary">{t("byok.providers.form.api_key_help")}</p>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="model">Model Name</Label>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs"
            disabled={isLoadingModels || !formData.apiKey}
            onClick={handleFetchModels}
          >
            <i
              className={cn(
                "mr-1 size-3.5",
                isLoadingModels ? "i-mgc-loading-3-cute-li animate-spin" : "i-mgc-refresh-2-cute-re",
              )}
            />
            {isLoadingModels ? "Fetching..." : "Fetch Models"}
          </Button>
        </div>

        {availableModels.length > 0 ? (
          <div className="flex gap-2">
            <Select
              value={formData.model ?? availableModels[0] ?? ""}
              onValueChange={(value) => setFormData({ ...formData, model: value || null })}
            >
              <SelectTrigger id="model" className="flex-1">
                <SelectValue placeholder="Select a model..." />
              </SelectTrigger>
              <SelectContent className="max-h-60">
                {availableModels.map((modelName) => (
                  <SelectItem key={modelName} value={modelName}>
                    {modelName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant="outline"
              size="sm"
              title="Switch to manual input"
              onClick={() => setAvailableModels([])}
            >
              <i className="i-mgc-edit-cute-re size-3.5" />
            </Button>
          </div>
        ) : (
          <Input
            id="model"
            type="text"
            placeholder="e.g. gpt-4o-mini, deepseek-chat, gemini-1.5-flash"
            value={formData.model ?? ""}
            onChange={(e) =>
              setFormData({
                ...formData,
                model: e.target.value || null,
              })
            }
          />
        )}
        <p className="text-xs text-text-secondary">
          {availableModels.length > 0
            ? "Selected model from remote server"
            : "Click 'Fetch Models' to load remote models or enter manually"}
        </p>
      </div>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          {t("words.cancel", { ns: "common" })}
        </Button>
        <Button type="submit">{t("words.save", { ns: "common" })}</Button>
      </div>
    </form>
  )
}
