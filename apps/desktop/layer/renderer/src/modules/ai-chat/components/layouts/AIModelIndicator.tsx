import type { UserRole } from "@follow/constants"
import { UserRolePriority } from "@follow/constants"
import { useUserRole } from "@follow/store/user/hooks"
import { cn } from "@follow/utils"
import { Fragment, memo, useMemo } from "react"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu/dropdown-menu"
import { useSettingModal } from "~/modules/settings/modal/use-setting-modal-hack"

import { useAIModel } from "../../hooks/useAIModel"

interface AIModelIndicatorProps {
  className?: string
  onModelChange?: (model: string) => void
}

type ProviderType = "openai" | "google" | "auto" | "deepseek" | "anthropic" | "moonshotai"

const providerIcons: Record<ProviderType, string> = {
  auto: "i-mgc-folo-bot-original size-4 -ml-0.5",
  openai: "i-mgc-openai-original",
  google: "i-simple-icons-googlegemini",
  anthropic: "i-simple-icons-claude",
  deepseek: "i-mgc-deepseek-original",
  moonshotai: "i-mgc-moonshotai-original",
}

const MODEL_PAID_LEVELS = ["basic", "plus", "pro"] as const
type ModelPaidLevel = (typeof MODEL_PAID_LEVELS)[number]

const paidLevelPriority: Record<ModelPaidLevel, number> = {
  basic: 1,
  plus: 2,
  pro: 3,
}

const paidLevelBadgeStyles: Record<ModelPaidLevel, string> = {
  basic: "border-green/30 bg-green/10 text-green",
  plus: "border-blue/30 bg-blue/10 text-blue",
  pro: "border-purple/40 bg-purple/10 text-purple",
}

const paidLevelLabels: Record<ModelPaidLevel, string> = {
  basic: "Basic",
  plus: "Plus",
  pro: "Pro",
}

const isModelPaidLevel = (value: unknown): value is ModelPaidLevel => {
  return typeof value === "string" && MODEL_PAID_LEVELS.includes(value as ModelPaidLevel)
}

const hasAccessToPaidLevel = (role: UserRole | null | undefined, level?: ModelPaidLevel) => {
  if (!level) return true
  const roleScore = role ? (UserRolePriority[role] ?? 0) : 0
  return roleScore >= paidLevelPriority[level]
}

const parseModelString = (modelString: string) => {
  if (!modelString) {
    return { provider: "auto" as ProviderType, modelName: "AI 模型" }
  }

  const clean = modelString.trim()
  let provider: ProviderType = "auto"
  let modelName = clean

  if (clean.includes("/")) {
    const parts = clean.split("/")
    const prefix = parts[0].toLowerCase()
    modelName = parts.slice(1).join("/")
    if (prefix in providerIcons) {
      provider = prefix as ProviderType
    }
  }

  if (provider === "auto") {
    const lower = modelName.toLowerCase()
    if (lower.includes("gemini") || lower.includes("google")) provider = "google"
    else if (lower.includes("claude") || lower.includes("anthropic")) provider = "anthropic"
    else if (lower.includes("deepseek")) provider = "deepseek"
    else if (lower.includes("moonshot") || lower.includes("kimi")) provider = "moonshotai"
    else if (lower.includes("gpt") || lower.includes("openai") || lower.includes("o1")) provider = "openai"
  }

  return {
    provider,
    modelName,
  }
}

export const AIModelIndicator = memo(({ className, onModelChange }: AIModelIndicatorProps) => {
  const { data, changeModel } = useAIModel()
  const { defaultModel, currentModel, availableModelsMenu = [] } = data || {}
  const role = useUserRole()
  const settingModalPresent = useSettingModal()

  const { provider, modelName } = useMemo(() => {
    return parseModelString(currentModel || defaultModel || "")
  }, [currentModel, defaultModel])

  const selectedMenuItem = useMemo(() => {
    return availableModelsMenu.find(
      (item) =>
        item.value === currentModel ||
        item.value?.toLowerCase() === currentModel?.toLowerCase(),
    )
  }, [availableModelsMenu, currentModel])

  const iconClass = providerIcons[provider] || providerIcons.auto

  const modelContent = (
    <div
      className={cn(
        "inline-flex shrink-0 items-center rounded-xl border font-medium backdrop-blur-sm transition-colors",
        "cursor-button hover:bg-material-medium duration-200",
        "gap-1.5 p-1 px-2 text-xs",
        "border-border/50 bg-material-ultra-thin",
        "text-text-secondary",
        className,
      )}
    >
      <i className={cn("size-3 shrink-0", iconClass)} />
      <span className="inline-block max-w-28 truncate">
        {selectedMenuItem?.label || modelName}
      </span>
      <i className="i-mingcute-down-line size-3 shrink-0 opacity-60" />
    </div>
  )

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{modelContent}</DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-48">
        {availableModelsMenu.map(({ label, value, paidLevel }, index) => {
          if (value) {
            const { provider: itemProvider, modelName: itemModelName } = parseModelString(value)
            const itemIconClass = providerIcons[itemProvider] || providerIcons.auto
            const isSelected =
              value === (currentModel || defaultModel) ||
              itemModelName === modelName
            const normalizedPaidLevel = isModelPaidLevel(paidLevel) ? paidLevel : undefined
            const requiresUpgrade = !hasAccessToPaidLevel(role, normalizedPaidLevel)

            const handleModelSelect = () => {
              if (requiresUpgrade) {
                settingModalPresent("plan")
                return
              }
              changeModel(value)
              onModelChange?.(value)
            }

            return (
              <DropdownMenuItem
                key={value}
                className={cn("gap-2", requiresUpgrade && "text-text-secondary")}
                onClick={handleModelSelect}
                checked={isSelected}
              >
                <i className={cn("size-3", itemIconClass)} />
                <span className="truncate">{label || itemModelName}</span>
                {normalizedPaidLevel && (
                  <span
                    className={cn(
                      "ml-auto inline-flex rounded-full border px-1.5 text-[9px] font-semibold uppercase tracking-wide",
                      paidLevelBadgeStyles[normalizedPaidLevel],
                    )}
                  >
                    {paidLevelLabels[normalizedPaidLevel]}
                  </span>
                )}
              </DropdownMenuItem>
            )
          } else {
            return (
              <Fragment key={label}>
                {index > 0 && <DropdownMenuSeparator />}
                <DropdownMenuLabel>{label}</DropdownMenuLabel>
              </Fragment>
            )
          }
        })}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="cursor-button gap-2 text-text-secondary"
          onClick={() => settingModalPresent("ai")}
        >
          <i className="i-mgc-settings-6-line size-3.5" />
          <span>配置 AI 模型...</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
})

AIModelIndicator.displayName = "AIModelIndicator"
