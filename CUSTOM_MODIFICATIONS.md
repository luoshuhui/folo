# Folo 自定义功能修改与上游合并指南

本文档汇总了在 `custom` 分支上针对 Folo 客户端所做的所有定制化修改，包含功能设计、涉及文件、关键代码改动及未来上游代码更新时的合并策略。

---

## 目录
1. [修改概述](#修改概述)
2. [改动清单与文件对照](#改动清单与文件对照)
3. [核心模块实现细节](#核心模块实现细节)
   - [3.1 客户端 Free 用户权限解锁](#31-客户端-free-用户权限解锁)
   - [3.2 BYOK 模型拉取与配置增强](#32-byok-模型拉取与配置增强)
   - [3.3 自定义 AI 核心服务 (CustomAIService)](#33-自定义-ai-核心服务-customaiservice)
   - [3.4 AI 全链路接管 (摘要/翻译/流式对话)](#34-ai-全链路接管-摘要翻译流式对话)
   - [3.5 AI 对话框模型选择器与状态同步优化](#35-ai-对话框模型选择器与状态同步优化)
   - [3.6 设置面板与构建导出修复](#36-设置面板与构建导出修复)
4. [上游代码更新后的合并指南](#上游代码更新后的合并指南)

---

## 1. 修改概述

在官方开源客户端基础上，主要完成了以下定制：
1. **客户端 Pro 权益解锁**：无需官方订阅即可在客户端本地启用全部 AI 相关功能。
2. **BYOK (自带密钥) 体验增强**：支持自定义 OpenAI 兼容 Base URL、一键从服务端拉取模型列表并下拉选择，存储模型候选列表。
3. **全链路严格使用 BYOK 模型**：包括 AI 侧边栏对话（流式通信）、文章全文摘要、划词/全文翻译、时间线总结。
4. **断开官方依赖与防降级保护**：当配置了 BYOK 时，所有 AI 请求完全走本地直连第三方服务，不向官方发送请求，请求异常时提示明确错误，杜绝降级到官方接口触发收费弹窗。
5. **对话框模型交互修复**：移除单模型禁止下拉菜单的限制，小窗口下模型名称不截断隐藏，修复模型匹配导致的 401 报错。

---

## 2. 改动清单与文件对照

共修改/新增 16 个文件（共计约 +926 行，-51 行）：

| 模块 | 文件路径 | 类型 | 说明 |
| :--- | :--- | :--- | :--- |
| **权限** | `packages/internal/store/src/modules/user/store.ts` | 修改 | 将客户端本地角色覆写为 Pro，解锁全部功能 |
| **配置** | `packages/internal/shared/src/config/custom-ai.config.ts` | 新增 | 提供 Config 类管理环境变量与兜底默认配置 |
| **类型** | `packages/internal/shared/src/settings/interface.ts` | 修改 | `UserByokProviderConfig` 扩展 `availableModels` 字段 |
| **导出** | `packages/internal/shared/src/index.ts` | 修改 | 导出 `CustomAIConfig` |
| **导出** | `packages/internal/store/package.json` | 修改 | 添加 `"./services/*": "./src/services/*"` 导出解决构建报错 |
| **AI 核心**| `packages/internal/store/src/services/custom-ai.ts` | 新增 | 自定义 AI 核心服务（Provider 解析、模型名清洗、OpenAI/Gemini 请求与流式处理） |
| **摘要** | `packages/internal/store/src/modules/summary/store.ts` | 修改 | 接入 `CustomAIService.generateSummary`，断开官方降级 |
| **翻译** | `packages/internal/store/src/modules/translation/store.ts` | 修改 | 接入 `CustomAIService.translateText`，本地逐项翻译 |
| **对话通信**| `apps/desktop/layer/renderer/src/modules/ai-chat/store/transport.ts` | 修改 | 拦截官方请求，改用本地流式 SSE 通信，本地生成对话标题 |
| **模型配置**| `apps/desktop/layer/renderer/src/modules/ai-chat/hooks/useAIConfiguration.ts` | 修改 | 同步优先读取本地 BYOK，动态补充常用模型候选，断开官方接口 |
| **模型状态**| `apps/desktop/layer/renderer/src/modules/ai-chat/hooks/useAIModel.ts` | 修改 | 增强模型有效性校验，兼容带前缀与纯模型名称 |
| **模型组件**| `apps/desktop/layer/renderer/src/modules/ai-chat/components/layouts/AIModelIndicator.tsx` | 修改 | 移除下拉死锁，小窗口下保持可见，增加配置入口与图标推断 |
| **BYOK 弹窗**| `apps/desktop/layer/renderer/src/modules/settings/tabs/ai/byok/ByokProviderModalContent.tsx` | 修改 | 支持自定义模型输入、从服务端拉取模型列表与下拉选择 |
| **BYOK 列表**| `apps/desktop/layer/renderer/src/modules/settings/tabs/ai/byok/ByokSection.tsx` | 修改 | 保存拉取到的可用模型列表 |
| **使用量** | `apps/desktop/layer/renderer/src/modules/settings/tabs/ai/usage/UsageAnalysisSection.tsx` | 修改 | 防御性空值保护，避免读取 `usage.total` 报错 |
| **分析弹窗**| `apps/desktop/layer/renderer/src/modules/settings/tabs/ai/usage/components/DetailedUsageModal.tsx` | 修改 | 防御性空值保护 |

---

## 3. 核心模块实现细节

### 3.1 客户端 Free 用户权限解锁
- **文件**：`packages/internal/store/src/modules/user/store.ts`
- **逻辑**：在 `userSyncService.setUserData` 中，将用户返回的角色单点修改为 `UserRole.Pro`：
  ```typescript
  // 覆写 Free 角色为 Pro，本地解锁所有高级功能
  role: user.role === UserRole.Free ? UserRole.Pro : user.role,
  ```

### 3.2 BYOK 模型拉取与配置增强
- **文件**：`packages/internal/shared/src/settings/interface.ts`
  ```typescript
  export interface UserByokProviderConfig {
    provider: ByokProvider
    apiKey?: string
    baseURL?: string
    model?: string
    availableModels?: string[] // 新增：保存拉取到的模型列表
  }
  ```
- **文件**：`apps/desktop/layer/renderer/src/modules/settings/tabs/ai/byok/ByokProviderModalContent.tsx`
  - 增加“拉取模型列表”按钮，调用远端 `/models` 接口（自动处理 Base URL 路径修正）；
  - 成功拉取后，将模型呈现在下拉菜单中供用户直接点选，同时支持自由手动输入；
  - 保存时将 `availableModels` 一同持久化。

### 3.3 自定义 AI 核心服务 (CustomAIService)
- **文件**：`packages/internal/store/src/services/custom-ai.ts`
- **关键设计**：
  1. **Provider 精确匹配**：优先从 `localStorage.getItem("follow:ai")` 解析已配置的 Provider。如果指定了 `preferredModel`，同时比对主模型 `p.model` 与备选列表 `p.availableModels`，支持大小写不敏感匹配；
  2. **模型名称清洗 (`cleanModelName`)**：剥离如 `openai/`、`custom/` 等前端前缀，确保发给底层 API 的是标准模型名称（如 `gpt-4o`、`deepseek-chat`），彻底解决 401 和 400 报错；
  3. **标准流式通信 (`streamChat`)**：实现基于 `ReadableStream` 和 `TextDecoder` 的 SSE 解析，将响应分块封装为流直接返回给 UI 渲染；
  4. **全端点适配**：同时支持 OpenAI 兼容格式与 Google Gemini 格式。

### 3.4 AI 全链路接管 (摘要/翻译/流式对话)
- **AI 对话 (`transport.ts`)**：
  - 在 `ExtendChatTransport.sendMessages` 中判断 `CustomAIService.isConfigured`；
  - 拦截官方接口，转调 `CustomAIService.streamChat(chatMessages, selectedModel, abortSignal)`；
  - 会话标题由首条消息文本截取生成，断开官方云端标题生成接口。
- **AI 摘要 (`summary/store.ts`)**：
  - 优先调用 `CustomAIService.generateSummary`；
  - 若调用失败，直接返回错误信息，禁止 fallback 到官方 `api().ai.summary`，避免触发 402 收费限制弹窗。
- **AI 翻译 (`translation/store.ts`)**：
  - 优先调用 `CustomAIService.translateText` 本地翻译；
  - 避免触发官方批量翻译接口。

### 3.5 AI 对话框模型选择器与状态同步优化
- **配置同步获取 (`useAIConfiguration.ts`)**：
  - 优先同步检查本地持久化存储中的 BYOK Provider；
  - 只要存在配置，立即构建本地模型菜单，跳过请求 `followApi.ai.config()` 并设置 `staleTime: 0`；
  - 若 Provider 暂未拉取模型，自动填充其常用模型预设（如 OpenAI 补充 gpt-4o/gpt-4o-mini 等），确保始终有候选模型。
- **交互与显示 (`AIModelIndicator.tsx`)**：
  - 移除 `if (!hasMultipleModels) return modelContent`，即使只有 1 个模型也渲染 `DropdownMenu`；
  - 下拉菜单底部增加“配置 AI 模型...”操作项，点击一键唤起设置面板；
  - 文本标签移除 `@md:inline`，浮窗或窄屏下始终展示模型名称与下拉箭头；
  - 根据模型名称特征（如包含 gemini/claude/deepseek/gpt 等）自动匹配正确图标。
- **模型状态同步 (`useAIModel.ts`)**：
  - 增强 `isAvailable` 校验，支持带前缀和纯名称的等价识别，防止持久化的模型被重置。

### 3.6 设置面板与构建导出修复
- **设置面板**：`UsageAnalysisSection.tsx` 和 `DetailedUsageModal.tsx` 对 `usage.total` 等字段添加可选链防御性保护。
- **打包导出**：`packages/internal/store/package.json` 添加 `"./services/*": "./src/services/*"` 导出，解决 `pnpm run build:electron-vite` 编译错误。

---

## 4. 上游代码更新后的合并指南

当上游仓库（如 `upstream/dev`）有新版本更新需要合并时，请按照以下步骤操作：

### 步骤 1：获取上游最新分支
```bash
git fetch upstream
```

### 步骤 2：创建合并测试分支（推荐）或直接 rebase/merge
```bash
# 推荐基于当前 custom 分支创建临时分支尝试变基或合并
git checkout custom
git checkout -b sync-upstream-test
git merge upstream/dev
# 或者：git rebase upstream/dev
```

### 步骤 3：重点冲突排查指南
合并过程中如果产生冲突，重点核查以下文件：
1. **`packages/internal/store/src/modules/user/store.ts`**：
   - 保持 `userSyncService.setUserData` 中 `role === UserRole.Free ? UserRole.Pro : user.role` 的判断。
2. **`packages/internal/store/src/modules/summary/store.ts` & `translation/store.ts`**：
   - 保持开头的 `if (CustomAIService.isConfigured)` 优先分支；
   - 严禁删除此分支或允许其静默降级到官方 `api().ai.*`。
3. **`apps/desktop/.../ai-chat/store/transport.ts`**：
   - 检查 `sendMessages` 是否保持拦截走 `sendByokMessages`。
4. **`packages/internal/store/package.json`**：
   - 确保 `exports` 节点保留了 `"./services/*": "./src/services/*"`。
5. **新增文件不需要冲突解决**：
   - `packages/internal/store/src/services/custom-ai.ts`
   - `packages/internal/shared/src/config/custom-ai.config.ts`
   这两份文件为新增文件，上游无冲突，直接保留。

### 步骤 4：验证编译与构建
合并解决冲突后，必须运行全量构建测试：
```bash
# 桌面端 Vite 与 Electron 编译
pnpm run build:electron-vite
```

### 步骤 5：完成合并并更新分支
```bash
git checkout custom
git merge sync-upstream-test
git branch -d sync-upstream-test
```
