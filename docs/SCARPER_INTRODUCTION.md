# Scarper 软件介绍

> **版本说明**：本文档基于当前代码库整理，面向产品使用者、技术评估者与潜在部署者。  
> **定位**：Web 智能采集 · 知识管理 · AI 文档协作一体化平台

---

## 目录

1. [产品概述](#1-产品概述)
2. [解决什么问题](#2-解决什么问题)
3. [核心工作流](#3-核心工作流)
4. [功能模块详解](#4-功能模块详解)
5. [系统架构](#5-系统架构)
6. [抓取引擎：AI Web Intelligence](#6-抓取引擎ai-web-intelligence)
7. [AI 能力层](#7-ai-能力层)
8. [数据存储与多租户](#8-数据存储与多租户)
9. [安全与鉴权](#9-安全与鉴权)
10. [成本分析](#10-成本分析)
11. [核心优势](#11-核心优势)
12. [典型应用场景](#12-典型应用场景)
13. [部署与运行](#13-部署与运行)
14. [环境配置参考](#14-环境配置参考)
15. [适用人群与竞品差异](#15-适用人群与竞品差异)

---

## 1. 产品概述

**Scarper**（Secure Extractor）是一款面向知识工作者与内容团队的 **Web 智能采集与文档协作平台**。

它把互联网上的网页信息，通过智能抓取和 AI 结构化处理，转化为可管理、可编辑、可复用的知识资产，并进一步支持模板化成稿与库内问答（RAG）。

与传统「复制网页文字」或「单一 AI 聊天」工具不同，Scarper 提供的是一条完整闭环：

```
网页 URL → 智能抓取 → 正文解析 → AI 摘要 → 项目入库 → 编辑改稿 → 模板成文 → 库内问答
```

**一句话总结**：Scarper 让你从「看到好内容」到「产出可用文档」，在一个产品内完成，且每一步都有 AI 辅助、成本可见、失败可诊断。

---

## 2. 解决什么问题

### 2.1 信息采集痛点

| 痛点 | Scarper 的应对 |
|------|----------------|
| 网页结构复杂，复制粘贴丢格式、丢正文 | 智能抓取 + 正文解析（trafilatura / BeautifulSoup） |
| React/Vue 等 SPA 页面抓不到内容 | Playwright 浏览器渲染，按需触发 |
| 反爬、Cloudflare、登录墙 | 多策略路由 + Stealth 模式 + 结构化失败诊断 |
| 批量 URL 处理效率低 | 多任务并行、进度可视化、结果 Merge 整合 |

### 2.2 知识管理痛点

| 痛点 | Scarper 的应对 |
|------|----------------|
| 资料散落在浏览器标签页 | Project 项目分组 + Neon 云端存储 |
| 抓取结果难以二次加工 | Dashboard 富文本编辑 + AI 改稿抽屉 |
| 多源资料难以合成报告 | FinDoc 模板驱动 + AI 按结构排版 |
| AI 容易「胡说八道」 | RAG Chat 严格基于已入库正文作答 |

### 2.3 成本与可控性痛点

| 痛点 | Scarper 的应对 |
|------|----------------|
| 不知道 AI 花了多少钱 | 每次任务展示 Token 用量与预估 USD 成本 |
| 浏览器抓取太慢太贵 | HTTP 优先策略，Playwright 预算上限 25% |
| 重复抓取浪费 API | 内存缓存（默认 5 分钟 TTL），命中后 AI 成本为 0 |

---

## 3. 核心工作流

Scarper 官方 Tutorial 定义的标准闭环如下：

```
① Homepage 登录（Clerk）
       ↓
② Tools → Scrape：输入 URL，智能抓取 + AI 摘要
       ↓
③ 结果编辑 / Merge 整合 → 上传至 Project（Neon 云库）
       ↓
④ Project 页管理记录 → 进入 Dashboard 深度编辑
       ↓
⑤ FinDoc：选 Template + Task 素材 → AI 按模板成稿
       ↓
⑥ RAG Chat：划选库内正文 → 基于事实的 AI 问答
```

### 3.1 页面导航结构

登录前仅开放 **Homepage**；登录后顶栏展开：

| 导航项 | 说明 |
|--------|------|
| **Homepage** | 品牌首页 + Clerk 登录入口 |
| **Project** | 云端项目管理、存储用量、记录列表 |
| **Dashboard** | 富文本工作台，单条记录编辑与 AI 协作 |
| **Tools** | 工具台：Scrape / FinDoc / Template / RAG Chat |
| **Setting** | 账号、语言、工作流、界面、存储、API、诊断 |

Tools 族页面包括：`scrape`、`findoc`、`findoc-templates`、`rag-chat`。

---

## 4. 功能模块详解

### 4.1 Scrape — 网页智能抓取

**输入**：一个或多个 URL（换行或逗号分隔）

**输出**（每条成功结果）：
- `title` — 页面标题
- `summary` — AI 摘要（简洁约 40–80 字，详细约 150–300 字）
- `key_points` — 要点列表（3–5 条或 5–12 条）
- `content` — 清洗后的正文
- `detected_language` — 检测到的页面语言
- `token_usage` — Token 用量与预估成本

**可配置项**（Settings → 语言 / 工作流）：
- 输出语言：`zh`（简体中文）/ `en`（英文）/ `original`（与原文一致）
- 详细程度：`concise`（简洁）/ `detailed`（详细）
- 处理指令（Processing Prompt）：用户自定义的 AI 分析要求（最长 8000 字符）

**高级能力**：
- 多 URL 批量抓取，任务进度条实时反馈
- 单条结果可编辑、复制、导出
- 多条成功结果可通过 **Merge** 整合为一条
- 底部 **Project Upload** 区域：选择目标项目，写入 Neon

### 4.2 Project — 项目与记录管理

- 按业务主题创建项目分组（如「竞品调研 Q2」「行业报告素材」）
- 左侧展示 **存储用量**（默认约 200MB/账户）
- 中间列表项目，右侧展示某项目下的抓取记录（Task）
- 每条记录包含：来源 URL、抓取时间、结果条数、正文摘要
- 可从记录一键进入 **Dashboard** 或 **FinDoc**

**存储模式**：
- 配置 Neon 时：数据存于云端 Postgres，多设备同步
- 未配置 Neon 时：降级为浏览器 `localStorage`（单机）

### 4.3 Dashboard — 编辑与 AI 协作

- 富文本编辑器，支持查找替换（Find Bar）
- 右侧 **AI 改稿抽屉（Chat Drawer）**：提出修改建议，AI 返回编辑提案
- 支持上传本地文件解析正文（PDF / DOCX / PPTX / 图片 OCR 等）
- 保存后将 `editor_text` 写回 Neon
- 支持导出 **Word 文档**（.docx）

**文档解析支持格式**：

| 类型 | 扩展名 | 解析方式 |
|------|--------|----------|
| 纯文本 | .txt, .md, .csv, .json | 直接读取 |
| PDF | .pdf | PyMuPDF |
| Word | .docx | python-docx |
| PPT | .pptx | python-pptx |
| 图片 | .png, .jpg, .webp 等 | RapidOCR（ONNX 本地 OCR） |

单文件上限：**20MB**。

### 4.4 FinDoc — 模板驱动文档生成

FinDoc 解决「多条素材 → 一份成稿」的问题：

1. 在 **Template** 页创建或 AI 分析文档模板结构
2. 在 **FinDoc** 页选择：项目 → 模板 → 一条或多条 Task 素材
3. 左侧 Prompt 区填写额外改写要求
4. 点击 **Proceed**，AI 按模板结构整合素材并排版
5. 预览 / 编辑后保存到项目，或导出 Word

适用场景：研究报告、竞品分析、会议纪要汇编、多源资讯综述等。

### 4.5 Template — FinDoc 模板管理

- 创建、编辑、删除 FinDoc 模板
- AI 分析已有文档，自动提取章节结构
- 模板存于 Neon 用户 Schema（`findoc_templates` 表）

### 4.6 RAG Chat — 检索增强问答

RAG（Retrieval-Augmented Generation，检索增强生成）在此处的含义是：

> AI 回答问题时，**必须先引用**你已在项目中入库的正文片段，而不是凭空生成。

操作流程：
1. 选择 Project 与 Task
2. 在正文区 **划选** 需要引用的段落
3. 在输入框提问
4. AI 基于选中上下文作答

适合：核对事实、对比段落、追问细节——而非重新抓取网页。

### 4.7 Settings — 全局配置

| 分区 | 内容 |
|------|------|
| **账号** | Clerk 登录信息、每日抓取额度 |
| **语言** | 全局输出语言与详细程度 |
| **工作流** | Scrape 行为、处理指令、上传默认项 |
| **界面** | 紧凑模式、过程视觉反馈 |
| **数据与存储** | Neon / localStorage 说明 |
| **API** | 后端地址、DeepSeek 配置 |
| **连接测试** | 一键检测后端、Clerk、Neon、爬虫、AI 状态 |

---

## 5. 系统架构

### 5.1 总体分层

```
┌──────────────────────────────────────────────────────────────────┐
│                        用户浏览器                                  │
│  React 19 + TypeScript + Vite 8                                  │
│  Clerk 登录 · 多页面 SPA · Context 状态管理 · Token 用量 UI      │
└────────────────────────────┬─────────────────────────────────────┘
                             │ HTTP / REST
                             │ JWT（Clerk Session Token）
┌────────────────────────────▼─────────────────────────────────────┐
│                     Python 后端 (FastAPI)                         │
│  /api/extract · /api/merge · /api/neon/* · /api/diagnostics      │
│  鉴权 · 限流 · 超时控制 · 流水线编排                                │
└──────┬─────────────────┬──────────────────────┬──────────────────┘
       │                 │                      │
       ▼                 ▼                      ▼
 AI Web            DeepSeek API            Neon Postgres
 Intelligence      (LLM 摘要/改稿)         (多租户云存储)
 (智能抓取路由)
       │
       ▼
 httpx / Playwright / trafilatura / BeautifulSoup
```

### 5.2 前端技术栈

| 组件 | 技术 | 作用 |
|------|------|------|
| 框架 | React 19 | UI 组件与状态 |
| 构建 | Vite 8 | 开发服务器、HMR、生产构建 |
| 语言 | TypeScript 6 | 类型安全 |
| 认证 | @clerk/clerk-react | 登录、JWT、用户资料 |
| 代理 | Vite dev proxy | `/api/*` → Python 后端；可选 DeepSeek 代理 |

**关键 Context**：
- `AppSettingsContext` — 全局设置（语言、详细度、界面）
- `ScrapeSessionContext` — 抓取任务状态与结果
- `UserProfileContext` — 用户资料与额度

### 5.3 后端技术栈

| 组件 | 技术 | 作用 |
|------|------|------|
| Web 框架 | FastAPI | REST API、Pydantic 校验 |
| ASGI 服务器 | Uvicorn | 异步 HTTP 服务 |
| HTTP 客户端 | httpx | 轻量网页抓取 |
| 浏览器自动化 | Playwright | SPA / JS 渲染页面 |
| HTML 解析 | BeautifulSoup + lxml | DOM 结构分析 |
| 正文提取 | trafilatura | Readability 风格主文提取 |
| AI 客户端 | DeepSeek API | 摘要、改稿、诊断、RAG |
| 数据库 | psycopg + Neon | Postgres 多 Schema 存储 |
| 认证 | PyJWT + Clerk | JWT 校验与用户识别 |

### 5.4 主要 API 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/health` | 健康检查 |
| GET | `/api/user/me` | 当前用户资料与抓取额度 |
| POST | `/api/extract` | 单 URL 抓取 + AI 摘要 |
| POST | `/api/merge` | 多结果 AI 整合 |
| POST | `/api/documents/extract` | 上传文件解析正文 |
| GET | `/api/diagnostics` | 全链路服务诊断 |
| GET/POST | `/api/neon/projects` | 项目 CRUD |
| POST | `/api/neon/projects/{id}/upload` | 抓取结果上传 |
| GET/POST | `/api/neon/findoc/templates` | FinDoc 模板管理 |

### 5.5 抓取流水线（Pipeline）

一次 `/api/extract` 请求经历以下阶段：

```
validate（链接校验）
    ↓
fetch（页面抓取 — Intelligence Orchestrator）
    ↓
parse（正文解析 — trafilatura / AI Recovery）
    ↓
summarize（AI 摘要 — DeepSeek）
    ↓
返回 ExtractSuccess 或 ExtractError
```

**失败时**：
- 返回结构化错误码（如 `timeout`、`cloudflare`、`js_required`）
- 可选 **AI Failure Diagnosis**：AI 分析失败环节与根因
- 可选 **AI Crawl Recovery**：规则解析失败时，AI 从 HTML 恢复正文
- 可选 **Render Fallback**：正文质量低时，触发 Playwright 二次抓取

**超时保护**（可配置）：
- 全流程上限：默认 90 秒
- Playwright 单次：默认 35 秒
- AI 摘要：默认 55 秒

---

## 6. 抓取引擎：AI Web Intelligence

这是 Scarper 区别于普通爬虫工具的 **核心技术模块**，采用 **两阶段概率路由（Probabilistic Routing）** 架构。

> 详细技术文档见：`backend/docs/AI_WEB_INTELLIGENCE.md`

### 6.1 设计原则

1. **Preflight 产生置信度分数，而非二元通过/拒绝** — 避免误判导致 URL 被跳过
2. **HTTP 始终优先尝试** — 除非确认硬阻断（401/403/410 多次探测）
3. **Playwright 严格触发** — 需 SPA 证据 + 低置信度 + 预算未超限
4. **域名级缓存偏置** — 重复域名沿用历史成功策略

### 6.2 两阶段流程

```
                    ┌─────────────────────────────┐
                    │   IntelligenceOrchestrator   │
                    └──────────────┬──────────────┘
                                   │
           ┌───────────────────────┼───────────────────────┐
           ▼                       ▼                       ▼
    ┌─────────────┐        ┌─────────────┐        ┌─────────────┐
    │  Stage 1    │        │ Confidence  │        │  Stage 2    │
    │  Probe      │───────▶│ + Routing   │───────▶│ Execution   │
    │  (GET ≤20KB)│        │ Probability │        │ Chain       │
    └─────────────┘        └─────────────┘        └─────────────┘
```

#### Stage 1 — Probe（探测）

- 轻量 HTTP GET，最多读取 **20KB** 响应体
- 每域名并发上限 **2**（防止「Server disconnected」雪崩）
- 最多重试 **2** 次，超时 **14** 秒
- 分析：响应大小、熵值、SPA 标记、网络稳定性

#### Stage 2 — Execution（执行链）

根据 **PreflightConfidenceModel** 评分，按成本从低到高执行：

| 优先级 | 策略 | 适用场景 |
|--------|------|----------|
| 1 | HTTP_ONLY / RETRY_HTTP | 静态 HTML、SSR 页面 |
| 2 | API_FETCH | 页面数据来自 JSON API |
| 3 | FILE_FETCH | 直接文件链接 |
| 4 | SPA_BROWSER / STEALTH_BROWSER | React/Vue/Next 等 SPA |

### 6.3 PreflightConfidenceModel 字段

```json
{
  "confidence_score": 0.0,
  "signal_quality": "high | medium | low",
  "recommended_strategy": "HTTP_ONLY | API_FETCH | SPA_BROWSER",
  "risk_flags": ["network_unstable", "http_403_unconfirmed"],
  "http_score": 0.0,
  "api_score": 0.0,
  "playwright_score": 0.0,
  "allow_playwright": false,
  "fail_fast_certain": false
}
```

### 6.4 Render Detector（渲染检测）

识别 SPA 壳页面，防止只抓到空 HTML：

- 检测 React / Vue / Next.js 等框架信号
- 正文质量校验（`QUALITY_LOW` 时触发 Playwright 回退）
- `SHORT_PAGE` + SPA 信号 → 强制浏览器渲染

### 6.5 Playwright 触发条件（严格）

Playwright **仅在以下全部满足时** 启动：

1. `PLAYWRIGHT_ENABLED=true`
2. 该域名 Playwright 使用率 < **25%**（域名预算）
3. `allow_playwright=true`（SPA 确认 + 置信度 < 0.55，或置信度 < 0.30 且多次硬失败）
4. 执行时：`URLClass.SPA_APP`，或 HTTP 已失败 ≥2 次

**绝不会** 因以下原因单独触发 Playwright：
- 单次超时
- 单次 HEAD 失败
- 单次未确认的 403
- 仅因 `SHORT_PAGE` 分类

### 6.6 Playwright 优化策略

| 配置 | 默认值 | 作用 |
|------|--------|------|
| `PLAYWRIGHT_HEADLESS` | true | 无头模式 |
| `PLAYWRIGHT_STEALTH_ENABLED` | true | 反检测 |
| `PLAYWRIGHT_BLOCK_IMAGES` | true | 拦截图片，加速 |
| `PLAYWRIGHT_BLOCK_FONTS` | true | 拦截字体 |
| `PLAYWRIGHT_PERSISTENT_CONTEXT` | true | 持久化 Cookie/Session |
| `PLAYWRIGHT_CONTEXT_POOL_SIZE` | 2 | 浏览器上下文池 |

### 6.7 域名缓存（Domain Cache）

- 记录每个域名的 HTTP/Playwright 成功率与延迟
- 后续同域名请求自动偏置路由分数
- 降低重复试探成本，提高稳定性

---

## 7. AI 能力层

### 7.1 模型与定价

默认模型：**deepseek-chat**

| 模型 | 输入（缓存命中） | 输入（缓存未命中） | 输出 |
|------|------------------|--------------------|------|
| deepseek-chat | $0.07 / 百万 Token | $0.27 / 百万 Token | $1.10 / 百万 Token |
| deepseek-reasoner | $0.14 / 百万 Token | $0.55 / 百万 Token | $2.19 / 百万 Token |

> 前后端 `token_usage.py` 与 `modelPricing.ts` 保持同步。

### 7.2 AI 应用场景

| 场景 | 模块 | 说明 |
|------|------|------|
| 网页摘要 | Summarizer | 结构化 JSON：summary + key_points + detected_language |
| 多结果整合 | Integrator | Merge 多条抓取结果为一条 |
| 正文恢复 | Crawl Recovery | 规则解析失败时从 HTML 恢复 |
| 失败诊断 | Failure Diagnosis | 分析 error_code、stage、根因与建议 |
| FinDoc 改稿 | findocProceedRewrite | 按模板结构重写多条 Task |
| 模板分析 | findocTemplateAnalysis | AI 提取文档章节结构 |
| Dashboard 改稿 | DashboardChatDrawer | 编辑提案与 diff |
| RAG 问答 | dashboardRag | 基于选中正文的上下文问答 |
| 语言翻译 | Summarizer.translate | 摘要/正文语言与设置不符时补译 |

### 7.3 AI 安全设计

Summarizer 系统 Prompt 明确：

- 将网页内容视为 **不可信数据（untrusted data）**
- **忽略** 网页内嵌的指令（防 Prompt Injection）
- 仅提取面向用户的有意义内容
- 用户「处理指令」仅作用于已抓取内容的分析方式，不能覆盖安全规则

### 7.4 Token 用量可视化

每次成功抓取返回 `token_usage` 字段：

```json
{
  "model": "deepseek-chat",
  "prompt_tokens": 1200,
  "completion_tokens": 350,
  "total_tokens": 1550,
  "prompt_cache_hit_tokens": 800,
  "prompt_cache_miss_tokens": 400,
  "page_cache_hit": false,
  "estimated_cost_usd": 0.00042
}
```

前端 **TokenUsageBar** 组件实时展示用量与预估费用。

---

## 8. 数据存储与多租户

### 8.1 Neon Postgres 架构

启用 `NEON_ENABLED=true` 后，采用 **两层 Schema** 隔离：

```
Neon 数据库
├── Schema: u_<clerk_user_id>          ← 用户目录
│   ├── projects                       ← 项目登记
│   └── findoc_templates               ← FinDoc 模板库
│
└── Schema: u_<user_id>_p_<project_id> ← 每个 Project 独立库
    └── scrape_upload_batches          ← 抓取批次 + Dashboard 正文
```

**隔离级别**：
- 用户级：不同 Clerk 账户完全隔离
- 项目级：同一用户下不同 Project 独立 Schema

### 8.2 存储配额

- 默认：**200MB / 用户**（`NEON_USER_QUOTA_MB`）
- 含：各项目上传批次、Dashboard 保存正文、模板内容
- 前端 Project 页展示用量进度条

### 8.3 降级模式

未配置 Neon 时：
- 项目与记录存于浏览器 `localStorage`
- 适合本地开发、单机试用
- 换设备或清缓存会丢失数据

---

## 9. 安全与鉴权

### 9.1 用户认证（Clerk）

- 前端：`VITE_CLERK_PUBLISHABLE_KEY`
- 后端：`CLERK_SECRET_KEY` + `CLERK_JWT_ISSUER`
- Homepage 为唯一登录入口
- 可选 `CLERK_REQUIRE_AUTH=true`：强制登录才能抓取

### 9.2 URL 安全校验

抓取前对 URL 进行严格校验：

| 检查项 | 说明 |
|--------|------|
| 协议白名单 | 仅允许 `http` / `https` |
| 协议黑名单 | 拒绝 `file`、`javascript`、`data`、`ftp` 等 |
| SSRF 防护 | 默认禁止 localhost / 内网 IP（`ALLOW_LOCALHOST=false`） |
| 文件类型黑名单 | 拒绝 `.exe`、`.zip`、`.ps1` 等可执行/压缩包 |
| 重定向限制 | 最多 5 次跳转 |
| 响应大小限制 | 最大 5MB |

### 9.3 API 限流

- 每用户/IP：**30 次/分钟**（内存计数）
- 可选每日抓取上限：`DAILY_EXTRACT_LIMIT`（按 Clerk 计划）

### 9.4 HTML 清洗

- `html_cleaner.py`：移除 script、iframe、危险属性
- `scrub_text_for_llm`：送入 LLM 前二次清洗
- 正文截断：`max_content_chars=12000`，LLM 输入 `max_llm_chars=8000`

---

## 10. 成本分析

### 10.1 成本构成

Scarper 本身可 **免费本地部署**，主要成本来自第三方按量服务：

```
总成本 ≈ DeepSeek API + Clerk（可选）+ Neon（可选）+ 云服务器（可选）
```

### 10.2 DeepSeek API 成本估算

**单次网页摘要**（典型）：
- 输入：800–3000 Token（取决于正文长度）
- 输出：200–600 Token
- 预估：**$0.0002 – $0.002 / 次**（约 0.001 – 0.015 元人民币）

**影响因素**：
- 页面正文越长，输入 Token 越多
- `detailed` 模式比 `concise` 输出 Token 更多
- Merge、FinDoc 改稿、RAG 问答会额外消耗 Token
- DeepSeek **Prompt Cache** 命中可大幅降低输入成本（$0.07 vs $0.27 / 百万 Token）

### 10.3 基础设施成本

| 服务 | 免费档 | 付费触发 |
|------|--------|----------|
| **Clerk** | 10,000 MAU | 超出 MAU、高级功能 |
| **Neon** | 0.5GB 存储、有限计算 | 存储/计算超出 |
| **自托管 VPS** | — | 约 $5–20/月（1核2G 够用） |
| **Render / Railway** | 免费层有限 | 需 Playwright 时建议付费实例 |

### 10.4 成本优化机制

| 机制 | 效果 |
|------|------|
| HTTP 优先 | 避免不必要的 Playwright 开销 |
| Playwright 域名预算 25% | 控制浏览器资源消耗 |
| 页面内存缓存（5 分钟） | 重复 URL 零 AI 成本 |
| DeepSeek Prompt Cache | 相同 System Prompt 输入降价 74% |
| Token 用量 UI | 用户可见、可控 |

### 10.5 月度成本参考（个人/小团队）

| 使用量 | 预估 DeepSeek | 基础设施 | 合计 |
|--------|---------------|----------|------|
| 轻量（50 页/月） | < $0.10 | 免费档 | **≈ 免费** |
| 中等（500 页/月） | $0.5 – $2 | 免费档 | **< $5/月** |
| 重度（5000 页/月） | $5 – $20 | Neon 付费 | **$10 – $30/月** |

> 以上为估算，实际取决于页面长度、AI 功能使用频率与缓存命中率。

---

## 11. 核心优势

### 11.1 智能抓取，不是简单复制

- **概率路由** 而非一刀切：静态页走 HTTP，SPA 才开浏览器
- **Render Detector** 识别空壳页面
- **Domain Cache** 学习域名特征，越用越准
- **失败可诊断**：结构化 error_code + AI 根因分析

### 11.2 完整知识闭环

从 URL 到成稿，无需切换多个工具：

```
Scrape → Project → Dashboard → FinDoc → RAG Chat
```

### 11.3 AI 增强且可控

- 摘要、改稿、Merge、RAG 统一 DeepSeek 后端
- RAG 严格基于库内内容，减少幻觉
- 每次任务 Token 与成本透明

### 11.4 企业级多租户

- Clerk 账户隔离
- Neon 每用户/每项目独立 Schema
- 存储配额可配置

### 11.5 开发者友好

- 前后端分离，API 清晰
- 诊断接口一键检测全链路
- 环境变量驱动，Clerk/Neon/Playwright 均可按需开关
- 本地一键启动（`Start-Scarper.exe` / `Start-Scarper.bat`）

### 11.6 灵活部署

| 模式 | 说明 |
|------|------|
| 纯本地 | 前后端 + localStorage，无需云服务 |
| 本地 + AI | 加 DeepSeek API Key |
| 完整云版 | Clerk + Neon + DeepSeek + 云 VPS |
| 无浏览器云部署 | `PLAYWRIGHT_ENABLED=false`，仅 HTTP 抓取 |

---

## 12. 典型应用场景

### 12.1 行业研究与报告

```
Scrape 抓取 10+ 行业资讯 URL
    → Merge 整合为一条综述
    → Dashboard 编辑润色
    → FinDoc 按「研究报告」模板成稿
    → 导出 Word 提交
```

### 12.2 竞品监控

```
定期 Scrape 竞品官网 / 新闻稿
    → 上传至「竞品 Q2」Project
    → RAG Chat 对比功能描述差异
    → FinDoc 生成竞品分析周报
```

### 12.3 内容策展与二次创作

```
批量抓取参考文章摘要
    → 筛选高价值内容入库
    → Dashboard AI 改稿
    → 发布自有渠道
```

### 12.4 内部知识库建设

```
抓取内部 Wiki / 文档页
    → Project 分类管理
    → RAG Chat 供团队问答
    → 新人 onboarding 材料
```

### 12.5 学术资料整理

```
Scrape 论文页面 / 预印本
    → 提取摘要与要点
    → Merge 多篇相关研究
    → FinDoc 按「文献综述」模板输出
```

---

## 13. 部署与运行

### 13.1 环境要求

| 组件 | 版本要求 |
|------|----------|
| Node.js | 18+ |
| Python | 3.11+ |
| npm | 9+ |
| Playwright | 可选，需 `playwright install` |

### 13.2 快速启动

**方式一：一键启动（Windows）**

双击项目根目录：
- `Start-Scarper.exe` — 打包版启动器
- `Start-Scarper.bat` — 批处理版

**方式二：手动启动**

```bash
# 终端 1 — 后端
cd backend
pip install -r requirements.txt
python run_dev.py

# 终端 2 — 前端
npm install
npm run dev
```

访问：http://127.0.0.1:5173

### 13.3 生产构建

```bash
# 前端
npm run build
# 产物在 dist/

# 后端
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

### 13.4 重新打包启动器

```powershell
powershell -ExecutionPolicy Bypass -File scripts/build_launcher.ps1
```

---

## 14. 环境配置参考

复制 `.env.example` 为 `.env`，按需填写：

### 14.1 必填（AI 功能）

```env
DEEPSEEK_API_KEY=sk-your-key-here
DEEPSEEK_API_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-chat
```

### 14.2 用户登录（可选）

```env
VITE_CLERK_PUBLISHABLE_KEY=pk_test_xxx
CLERK_SECRET_KEY=sk_test_xxx
CLERK_JWT_ISSUER=https://your-app.clerk.accounts.dev
```

### 14.3 云端存储（可选）

```env
NEON_ENABLED=true
NEON_DATABASE_URL=postgresql://user:pass@ep-xxx.neon.tech/neondb?sslmode=require
NEON_USER_QUOTA_MB=200
VITE_NEON_UPLOAD_ENABLED=true
```

### 14.4 抓取调优（可选）

```env
PLAYWRIGHT_ENABLED=true
PLAYWRIGHT_STEALTH_ENABLED=true
EXTRACT_TIMEOUT_SEC=90
CACHE_TTL_SEC=300
AI_CRAWL_RECOVERY_ENABLED=true
AI_FAILURE_DIAGNOSIS_ENABLED=true
```

完整配置说明见项目根目录 `.env.example`。

---

## 15. 适用人群与竞品差异

### 15.1 适用人群

| 角色 | 使用方式 |
|------|----------|
| **研究员 / 分析师** | Scrape + Merge + FinDoc 出报告 |
| **内容运营** | 批量摘要 → 编辑 → 发布 |
| **产品经理** | 竞品页面监控 + RAG 对比 |
| **知识管理者** | Project 分类 + RAG 问答 |
| **开发者 / 技术团队** | 自托管、二次开发、API 集成 |

### 15.2 与常见工具的差异

| 对比维度 | 普通书签/剪藏 | 通用 AI 聊天 | Scarper |
|----------|---------------|--------------|---------|
| 网页抓取 | 手动复制 | 不支持 | 智能多策略自动抓取 |
| SPA 支持 | 差 | 不支持 | Playwright 按需渲染 |
| 结构化输出 | 无 | 自由文本 | 标题/摘要/要点/正文 |
| 项目管理 | 无 | 无 | Project + Neon 云库 |
| 模板成稿 | 无 | 需手动整理 | FinDoc 模板驱动 |
| 库内问答 | 无 | 易幻觉 | RAG 基于入库正文 |
| 成本可见 | 无 | 不透明 | Token + USD 实时展示 |
| 失败诊断 | 无 | 无 | 结构化错误 + AI 诊断 |
| 自托管 | — | 否 | 支持 |

---

## 附录 A：错误码与流水线阶段

| 阶段 | 中文标签 | 常见错误码 |
|------|----------|------------|
| validate | 链接校验 | empty_url, invalid_url, ssrf_blocked |
| fetch | 页面抓取 | timeout, cloudflare, captcha, js_required |
| parse | 正文解析 | extraction_failed, ai_recovery_empty |
| summarize | AI 摘要 | ai_timeout, ai_failed, ai_not_configured |
| config | 服务配置 | playwright_disabled |

---

## 附录 B：相关文档

| 文档 | 路径 |
|------|------|
| AI Web Intelligence 技术细节 | `backend/docs/AI_WEB_INTELLIGENCE.md` |
| 环境变量模板 | `.env.example` |
| Neon 数据库 Schema | `backend/db/schema/001_neon_project_uploads.sql` |
| 应用内 Tutorial | Settings → 或 Homepage → Tutorial |

---

*文档生成日期：2026-06-03 · 基于 Scarper 当前代码库*
