# Scarper API 费用报告（人民币）

> 生成日期：2026-06-11  
> 基准数据：`backend/reports/bench_tool_tokens.json`（真实 DeepSeek 调用，源文章 1000 字中文）  
> 复跑命令：`cd backend && python scripts/bench_tool_tokens.py --chars 1000`

---

## 1. 摘要

Scarper 的 **按量计费 API** 几乎全部为 **DeepSeek Chat Completions**。在默认模型 `deepseek-chat`、输出语言 `zh`、摘要详细度 `concise` 下：

| 指标 | 数值 |
|------|------|
| 汇率（项目内置估算） | **1 USD = ¥7.25** |
| 最便宜单步 | RAG 单轮问答 ≈ **¥0.0015 / 1000 字语料** |
| 最贵完整 Tool 流程 | Vetra 外联全流程 ≈ **¥0.0109 / 1000 字 Task 素材** |
| Scrape 单页（含 AI） | ≈ **¥0.0024 / 1000 字正文** |
| FinDoc Proceed | ≈ **¥0.0018 / 1000 字 Task**（无校验重试） |

**量级结论**：按当前定价，处理 **1 万字** 中文源素材的 AI 费用通常在 **¥0.02～¥0.11** 之间（视 Tool 与是否多步整合而定），远低于人工撰写成本。

---

## 2. 计费模型

### 2.1 DeepSeek（唯一按 Token 计费的主 API）

来源：`backend/app/ai/token_usage.py`、`src/config/modelPricing.ts`

| 模型 | 输入（缓存命中）/ 百万 Token | 输入（缓存未命中）/ 百万 Token | 输出 / 百万 Token |
|------|------------------------------|--------------------------------|-------------------|
| `deepseek-chat` | $0.07 | $0.27 | $1.10 |
| `deepseek-reasoner` | $0.14 | $0.55 | $2.19 |

费用公式（美元）：

```
cost = (hit × 0.07 + miss × 0.27 + completion × 1.10) / 1,000,000
```

人民币显示：`cost_usd × 7.25`（与设置页「人民币 CNY」一致，**非实时汇率**）。

### 2.2 其他外部服务（非 Token 计费）

| 服务 | 用途 | 计费方式 | 本报告 |
|------|------|----------|--------|
| **Clerk** | 登录、JWT | 套餐 / MAU | 不计入 Token 表 |
| **Neon Postgres** | 项目数据、FinDoc/Vetra 持久化 | 存储 + 计算套餐 | 不计入 Token 表 |
| **Render / Vercel** | 后端 / 前端托管 | 套餐 | 不计入 Token 表 |
| **目标网站** | Scrape 抓取 | 无 API Key 费用 | 仅带宽/时间 |

### 2.3 文档解析（无 LLM）

`POST /api/documents/extract`：本地解析 PDF/Word/PPT/图片，**不调用 DeepSeek**。

---

## 3. DeepSeek 调用点全清单

凡走 `chat/completions` 的路径均汇总如下。

### 3.1 后端（Python → `app.ai.deepseek_client`）

| # | 模块 / 文件 | 函数 | 触发场景 | HTTP 路由 / 入口 | 调用形式 | 典型次数 |
|---|-------------|------|----------|------------------|----------|----------|
| B1 | `summarizer.py` | `AISummarizer.summarize` | 抓取成功后 AI 摘要 | `POST /api/extract` | `chat_json` | 1；语言不符时 +1 |
| B2 | `summarizer.py` | `AISummarizer.translate_text` | 输出 zh/en 时翻译标题/摘要/要点/正文 | 同上（pipeline） | `chat_text` | 1～4 |
| B3 | `integrator.py` | `integrate_extractions` | 多 URL AI 整合 | `POST /api/merge`、Scrape 勾选整合 | `chat_json` | 1 |
| B4 | `crawl_recovery.py` | `CrawlRecovery.recover` | 规则解析失败，HTML 恢复正文 | `POST /api/extract`（失败恢复链） | `chat_json` | 0～1 |
| B5 | `failure_diagnosis.py` | `diagnose_failure` | 抓取失败时 AI 诊断 | `POST /api/extract` 错误响应 | `chat_json` | 0～1 |
| B6 | `deepseek_routes.py` | `proxy_chat_completions` | 转发前端所有 DeepSeek 请求 | `POST /api/deepseek/chat/completions` | 流式/非流式代理 | 按前端 |

**管道组装**：`pipeline_recovery.py` → `complete_from_fetch` 组合 B1 + B2；`ScrapeSessionContext` 多页成功后调用 B3（经 `mergeIntegrateApi`）。

### 3.2 前端（TypeScript → `deepseekClient.ts`）

生产环境经 **后端 B6 代理**；本地开发可经 Vite `/api/deepseek` 直连 DeepSeek。

| # | 服务文件 | 函数 | Tool / 页面 | 调用形式 | 典型次数 |
|---|----------|------|-------------|----------|----------|
| F1 | `findocProceedRewrite.ts` | `rewriteTasksWithTemplate` | **FinDoc** Proceed | `streamChatCompletion` | 1；校验失败 +1 |
| F2 | `findocTemplateAnalysis.ts` | `analyzeTemplateStructure` | **Templates** 结构分析 | `createChatCompletion` | 1 |
| F3 | `DashboardChatDrawer.tsx` | 聊天发送 | **Dashboard** 改稿助手 | `streamChatCompletion` | 每轮 1 |
| F4 | `DashboardChatDrawer.tsx` | 聊天发送 | **RAG Chat** 问答 | `streamChatCompletion` | 每轮 1 |
| F5 | `vetraCompanyIntroImport.ts` | `generateCompanyIntroFromTask` | **Vetra** Companies 导入 | `createChatCompletion` | 1 |
| F6 | `vetraOutreachCollaboration.ts` | `generateCollaborationAnalysis` | **Vetra** Outreach 合作分析 | `createChatCompletion` | 1 |
| F7 | `vetraOutreachMessage.ts` | `generateOutreachMessage` | **Vetra** Outreach 邮件生成 | `createChatCompletion` | 1 |

**Dashboard 改稿（F3）**：`buildEditorSystemPrompt` 可注入最多约 12,000 字编辑器正文；输出可能含整篇 `scarper-edit` revision，**completion 常高于 RAG 问答（F4）**。

### 3.3 前端经后端 REST（非 deepseekClient，仍消耗 DeepSeek）

| # | 前端 | 后端 | 路由 | 实际 AI |
|---|------|------|------|---------|
| R1 | `crawlerApi.ts` → `extractUrl` | `routes.py` → `pipeline` | `POST /api/extract` | B1～B5 |
| R2 | `mergeIntegrateApi.ts` | `routes.py` | `POST /api/merge` | B3 |
| R3 | `ScrapeSessionContext.tsx` | 多页成功后 | 调用 R2 | B3 |

### 3.4 不消耗 DeepSeek 的 `/api/*`（易混淆）

| 路由 | 说明 |
|------|------|
| `GET /api/health` | 健康检查 |
| `GET /api/user/me` | Clerk 用户资料 |
| `GET /api/diagnostics/*` | 配置探测（不报 Token） |
| `GET/POST /api/neon/*` | Neon 数据库 CRUD |
| `POST /api/documents/extract` | 本地文档解析 |
| Neon / Vetra / FinDoc 模板 CRUD | 纯数据库 |

---

## 4. 各 Tool 流程费用（每 1000 字源文章）

基准：1000 字中文样例文章；模型 `deepseek-chat`；**源文字**为输入侧字数（Vetra 会产出更长介绍/邮件，completion 偏高）。

| Tool | 流程 | API 次数 | Total Tokens | USD | **RMB (¥)** |
|------|------|----------|--------------|-----|-------------|
| **Scrape** | 单页：摘要 + 正文/标题翻译 | 3 | 1,603 | $0.000325 | **¥0.0024** |
| **Scrape** | 2 页摘要 + AI 整合（`???` batch） | 3 | 2,713 | $0.001082 | **¥0.0078** |
| **FinDoc** | Proceed 改写（无重试） | 1 | 782 | $0.000251 | **¥0.0018** |
| **Templates** | 样例 → 结构模板 | 1 | 648 | $0.000257 | **¥0.0019** |
| **RAG Chat** | 单轮问答（qaMode） | 1 | 614 | $0.000202 | **¥0.0015** |
| **Vetra** | Task → 公司介绍 | 1 | 715 | $0.000349 | **¥0.0025** |
| **Vetra** | 合作机会分析（10 条） | 1 | 1,287 | $0.000557 | **¥0.0040** |
| **Vetra** | 邮件槽位生成 | 1 | 1,439 | $0.000625 | **¥0.0045** |
| **Vetra** | **完整外联**（介绍+分析+邮件） | 3 | 3,415 | $0.001503 | **¥0.0109** |

### 4.1 Token 明细（每 1000 字源文章）

| Tool | 流程 | Prompt | Completion |
|------|------|--------|------------|
| Scrape 单页 | 摘要+翻译 | 1,425 | 178 |
| Scrape 整合 | 2页+整合 | 2,292 | 421 |
| FinDoc Proceed | 改写 | 611 | 171 |
| Templates | 结构分析 | 549 | 99 |
| RAG Chat | 问答 | 570 | 44 |
| Vetra 介绍 | 公司介绍 | 527 | 188 |
| Vetra 合作分析 | 10 条机会 | 1,034 | 253 |
| Vetra 邮件 | 槽位填充 | 1,154 | 285 |
| Vetra 全流程 | 合计 | 2,715 | 700 |

### 4.2 按字数放大（线性估算）

| 源文章字数 | Scrape 单页 (¥) | FinDoc Proceed (¥) | Vetra 全流程 (¥) |
|------------|-----------------|--------------------|------------------|
| 1,000 | 0.0024 | 0.0018 | 0.0109 |
| 5,000 | 0.012 | 0.009 | 0.055 |
| 10,000 | 0.024 | 0.018 | 0.109 |
| 50,000 | 0.12 | 0.09 | 0.55 |

> 超长输入会触发截断（如 Scrape `max_llm_chars`、Vetra `MAX_INTRO_CHARS`），实际费用可能低于线性值。

---

## 5. 附加 / 失败路径（未单独压测，定性+粗算）

| 路径 | 调用点 | 何时触发 | 粗算费用（单次） |
|------|--------|----------|------------------|
| 摘要语言重试 | B1 `summarize` 第二次 | 摘要语言与设定不符 | ≈ 再 +1 次摘要 Token（约 +¥0.001～0.002/千字级输入） |
| 正文/标题翻译 | B2 | `output_language` 为 zh 或 en | 已计入 Scrape 单页基准 |
| AI HTML 恢复 | B4 `crawl_recovery` | 解析失败且 `AI_CRAWL_RECOVERY_ENABLED` | 约 2,000～5,000 tokens → **约 ¥0.005～0.015**（与 HTML 片段长度相关，上限约 16k 字符） |
| 失败 AI 诊断 | B5 `diagnose_failure` | 抓取失败且 `AI_FAILURE_DIAGNOSIS_ENABLED` | 约 800～1,500 tokens → **约 ¥0.002～0.004** |
| FinDoc 校验重试 | F1 第二次 `streamChatCompletion` | 输出未通过模板/ Task 校验 | Proceed 费用 **约 ×2** |
| Dashboard 改稿 | F3 每轮 | 用户要求改正文 | 通常 **高于 RAG**（系统注入全文 + 可能整篇 revision）；千字语料约 **¥0.003～0.008/轮**（视输出长度） |
| 页面缓存命中 | Scrape 同 URL 重复抓 | `cache` 命中 | **¥0**（`page_cache_hit`） |

---

## 6. 端到端场景举例（人民币）

假设源材料均为 **10,000 字中文**，无失败重试。

| 场景 | 步骤 | 估算合计 (¥) |
|------|------|--------------|
| 只抓取一页 | Scrape 单页 ×10（千字） | ≈ **0.024** |
| 抓取 2 页并整合 | Scrape 整合 ×10 | ≈ **0.078** |
| 抓取 → FinDoc 成稿 | Scrape 0.024 + FinDoc 0.018 | ≈ **0.042** |
| 抓取 → 建模板 → FinDoc | + Templates 0.019 | ≈ **0.061** |
| Vetra 完整外联一封 | Vetra 全流程 ×10 | ≈ **0.109** |
| 从 Task 到外联邮件（含先 Scrape） | 0.024 + 0.109 | ≈ **0.133** |

---

## 7. 安全与成本风险

1. **`POST /api/merge` 当前无强制 Clerk 鉴权**（`brutal_audit.py` 已记录）：任意调用者可消耗服务端 `DEEPSEEK_API_KEY`。
2. **前端 DeepSeek** 经 B6 代理后，密钥在服务端，但无 per-user Token 预算（仅 Clerk 抓取日限额针对 `/api/extract`）。
3. **流式接口**（F1/F3/F4）前端默认不展示 Token；费用与 non-stream 同级。

---

## 8. 附录：文件索引

```
后端 DeepSeek 客户端
  backend/app/ai/deepseek_client.py      # chat_json, chat_text
  backend/app/api/deepseek_routes.py     # /api/deepseek 代理

后端 AI 逻辑
  backend/app/ai/summarizer.py           # 摘要、翻译
  backend/app/ai/integrator.py           # 多页整合
  backend/app/ai/crawl_recovery.py       # HTML 恢复
  backend/app/ai/failure_diagnosis.py    # 失败诊断
  backend/app/services/pipeline_recovery.py

后端路由
  backend/app/api/routes.py              # /api/extract, /api/merge

前端 DeepSeek 客户端
  src/services/deepseekClient.ts
  src/config/deepseek.ts

前端业务调用
  src/services/findocProceedRewrite.ts
  src/services/findocTemplateAnalysis.ts
  src/services/vetraCompanyIntroImport.ts
  src/services/vetraOutreachCollaboration.ts
  src/services/vetraOutreachMessage.ts
  src/components/dashboard/DashboardChatDrawer.tsx
  src/services/crawlerApi.ts
  src/services/mergeIntegrateApi.ts

基准与报告
  backend/scripts/bench_tool_tokens.py
  backend/reports/bench_tool_tokens.json
  docs/api-cost-report.md                # 本文件
```

---

## 9. 免责声明

- 价格为 DeepSeek 官方标价 + 项目内固定汇率 **¥7.25/USD**，非银行实时汇价。
- 基准在 **2026-06-11** 实测；模型版本（如 `deepseek-v4-flash` 别名）可能影响单价与 Token 数。
- Prompt 缓存命中可降低输入成本（本基准未专门优化缓存命中）。
- Clerk、Neon、Render、Vercel 等托管费用请查阅各自账单，不在本表内。
