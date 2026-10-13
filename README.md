# Folo (Customized Edition)

> 本分支为基于官方开源 Folo 客户端的定制增强版本。重点移除了官方商业化权益限制，全面接管并增强了 BYOK（自带密钥）机制，支持任意自定义 OpenAI 兼容接口与模型拉取，确保所有 AI 能力完全由本地自主配置驱动。
> 
> [English README / 原版英文文档请参阅: readmd_en.md (README_EN.md)](./readmd_en.md)

---

## 目录
1. [原版 Folo 存在的问题](#1-原版-folo-存在的问题)
2. [为什么 Fork 进行定制修改](#2-为什么-fork-进行定制修改)
3. [解锁的原版付费（Pro）功能清单](#3-解锁的原版付费pro功能清单)
4. [具体修改内容与实现概览](#4-具体修改内容与实现概览)
5. [快速上手与配置指南](#5-快速上手与配置指南)
6. [编译与打包说明](#6-编译与打包说明)
7. [上游代码合并指南](#7-上游代码合并指南)

---

## 1. 原版 Folo 存在的问题

在深入体验与逆向分析官方原版 Folo 客户端后，发现存在以下主要痛点与体验缺陷：

### 1.1 严格的商业化付费墙拦截
原版客户端将大量生产力功能（AI 全文摘要、文章翻译、多模型对话、时间线总结等）绑定在官方 Pro 订阅计划上。对于免费（Free）用户，即使仅仅是想使用客户端的基础功能，也会在各处触发 402 升级提示弹窗（如提示“开启免费试用以继续使用 AI 摘要，升级到 Pro 计划”）。

### 1.2 BYOK (自带密钥) 功能不完整且缺乏自定义支持
- **无法自定义 Base URL**：原版仅预置了部分官方服务商，无法直接填入任意 OpenAI 兼容的第三方中转接口或本地私有化部署网关（如 OneAPI、NewAPI、Ollama、LocalAI 等）。
- **无法拉取与选择模型**：配置 BYOK 时无法配置或从远端服务端读取可用模型列表，用户无法自由选择实际调用的模型名称。
- **配置时崩溃异常**：进入部分包含 BYOK 设置或用量统计的界面时，因缺少防御性空值校验，容易抛出 `reading 'total' of undefined` 导致页面白屏崩溃。

### 1.3 官方云端依赖残留与静默降级暗坑
- 在原版代码中，部分 AI 请求（如 AI 摘要、标题生成）一旦遇到请求网络波动或参数不符，会在内部静默回退调用官方云端计费接口 `api().ai.*`；
- 一旦用户使用的是免费账号，降级调用立刻被官方服务器拒绝并返回 402 状态码，强行弹窗要求用户充值付费，导致本地配置形同虚设。

### 1.4 AI 对话模型选择器交互缺陷与 401 报错
- **死锁逻辑**：原版在可用模型数量只有 1 个时，直接跳过下拉菜单包装器（`hasMultipleModels` 判定为 false），导致用户点击模型标签毫无反应，无法切换或查看模型配置；
- **小窗口样式隐藏**：模型名称在小于断点（`@md`）的窗口或默认浮窗下被 CSS 强制隐藏（`hidden @md:inline`），仅残留极小图标，造成视觉上模型选择器缺失的困扰；
- **前缀比对失效致 401**：在模型匹配时未检索 `availableModels`，且带前缀的模型名（如 `openai/gpt-4o`）匹配失败后直接回退到数组首个 Provider 的密钥，导致请求向目标服务发送错误密钥，报出 `401 Invalid API key`。

---

## 2. 为什么 Fork 进行定制修改

本项目的核心理念是：**让开源 RSS 阅读器回归数据自主与智能自由**。

1. **摆脱中心化依赖**：用户应当有权使用自己的 API 密钥与自建算力，无需将阅读数据与提问上下文提交给官方托管服务。
2. **算力多元化接入**：支持主流大语言模型服务商（包括 DeepSeek、Claude、OpenAI、Google Gemini 等），支持国内外各类高性价比、开源自建或聚合接口。
3. **消除付费打扰**：在客户端彻底解除所有对 Free 用户的本地权限锁定，提供纯净、无弹窗打扰的高效阅读体验。

---

## 3. 解锁的原版付费（Pro）功能清单

经过本次定制，原版仅供 Pro/付费订阅用户使用的功能已在客户端本地完整解锁开放：

| 功能模块 | 原版 Free 用户表现 | 本版本 (Custom 版) 表现 |
| :--- | :--- | :--- |
| **文章全文 AI 摘要** | 限制调用次数，频繁弹出 402 升级订阅提示 | 无限制调用，直接走本地配置模型，永不弹窗 |
| **全文与划词 AI 翻译** | 限制调用，仅支持少量试用字数 | 无限制逐项翻译，完美保留 HTML 排版与 Markdown 结构 |
| **AI 对话助手** | 限制高级模型访问，依赖官方云端通信 | 完整支持流式 SSE 通信，可直接对话与追问 |
| **多模型切换** | 仅限 Pro 用户选择官方高阶模型 | 支持下拉选择任意通过 BYOK 拉取或配置的大模型 |
| **时间线智能总结** | 限制调用 | 自动聚合时间线未读内容并调用本地模型完成速报摘要 |
| **快捷指令与动作** | 部分指令受限 | 完整支持自定义 Prompt 快捷动作与文章交互 |

---

## 4. 具体修改内容与实现概览

所有改动严格遵守 KISS 架构风格，杜绝多余抽象与冗余代码。改动明细汇总如下：

### 4.1 客户端角色单点覆写
- **路径**：`packages/internal/store/src/modules/user/store.ts`
- **实现**：在用户数据同步入口，将本地用户的 `UserRole.Free` 单点识别为 `UserRole.Pro`，零侵入解锁所有付费判定逻辑。

### 4.2 自定义 AI 服务核心类 (CustomAIService)
- **路径**：`packages/internal/store/src/services/custom-ai.ts`
- **实现**：
  - 同步解析本地存储中配置的 BYOK Provider；
  - 自动剥离模型名称中的前端冗余前缀（如 `openai/`、`custom/`），确保请求格式规范；
  - 支持 OpenAI 兼容规范与 Google Gemini 原生格式；
  - 基于 `ReadableStream` 与 SSE 协议实现流式对话通信（`streamChat`）；
  - 封装统一的摘要生成（`generateSummary`）与文本翻译（`translateText`）接口。

### 4.3 全链路接管与断开官方降级
- **AI 摘要**：`packages/internal/store/src/modules/summary/store.ts` 优先走 `CustomAIService`，出错时直接提示错误，严格禁止 fallback 到官方 `api().ai.summary`；
- **AI 翻译**：`packages/internal/store/src/modules/translation/store.ts` 全程使用本地配置的模型翻译；
- **AI 对话**：`apps/desktop/layer/renderer/src/modules/ai-chat/store/transport.ts` 拦截官方请求，改用本地流式 SSE 通信，会话标题直接由首句截取本地生成。

### 4.4 BYOK 设置界面增强
- **路径**：`apps/desktop/layer/renderer/src/modules/settings/tabs/ai/byok/ByokProviderModalContent.tsx`
- **实现**：
  - 允许填入自定义 Base URL 与 API Key；
  - 增加“拉取模型列表”功能，自动请求端点的 `/models` 接口并解析呈现；
  - 支持直接下拉选择已拉取的模型，或自由手动输入模型名；
  - 扩展 `UserByokProviderConfig` 类型定义，持久化存储 `availableModels`。

### 4.5 模型选择器交互与时序修复
- **路径**：`AIModelIndicator.tsx`、`useAIConfiguration.ts`、`useAIModel.ts`
- **实现**：
  - 移除单个模型时禁用下拉的逻辑死锁，支持始终展开菜单；
  - 下拉菜单底部增加“配置 AI 模型...”快捷跳转项；
  - 修复浮窗或窄屏下文字隐藏问题，确保模型名称与下拉箭头始终可见；
  - 同步优先从本地读取 BYOK 配置，杜绝初始渲染时拉取官方配置污染缓存。

---

## 5. 快速上手与配置指南

1. 打开应用，进入 **设置 (Settings) -> AI 选项卡**；
2. 找到 **BYOK (Bring Your Own Key)** 配置区域；
3. 点击 **添加服务商**：
   - **服务商**：选择 OpenAI、Google、DeepSeek 或 Custom（自定义兼容接口）；
   - **API Key**：填写你的服务商 API 密钥；
   - **API 地址 (Base URL)**：若为第三方中转或自建网关，填入完整地址（如 `https://api.deepseek.com/v1` 或自定义域名）；
   - 点击 **拉取模型列表**，在下拉菜单中直接选择所需模型（如 `deepseek-chat`、`gpt-4o` 等）；
4. 保存配置，即可在文章详情、划词工具栏以及右下角 AI 对话窗口中完整使用全部 AI 能力。

---

## 6. 编译与打包说明

本项目推荐通过 pnpm 结合 Turbo 进行依赖管理与编译：

```bash
# 1. 安装项目依赖
pnpm install

# 2. 编译桌面端渲染层与 Electron 主进程（开发验证推荐）
pnpm run build:electron-vite

# 3. 启动桌面端网页预览模式
cd apps/desktop && pnpm run dev:web

# 4. 启动 Electron 桌面调试窗口
cd apps/desktop && pnpm run dev:electron

# 5. 打包桌面端完整分发包
pnpm run build:electron
```

---

## 7. 上游代码合并指南

本仓库已建立完善的自定义变更隔离机制，详细的文件改动清单与版本同步指南请参阅：
- [自定义修改与上游合并指南: CUSTOM_MODIFICATIONS.md](./CUSTOM_MODIFICATIONS.md)
