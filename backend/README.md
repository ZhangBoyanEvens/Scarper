# Scarper Backend — Secure Crawler + AI Extraction

## 架构

```
FETCH (httpx → Playwright fallback)
  → CLEAN HTML (sanitizer)
  → PARSE DOM (BeautifulSoup + trafilatura)
  → STRUCTURED JSON
  → LLM (DeepSeek, structured output only)
```

## 安装

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate   # Windows
pip install -r requirements.txt
playwright install chromium
```

## 运行

在项目根目录配置 `.env` 中的 `DEEPSEEK_API_KEY`，然后：

```bash
cd backend
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

## API

- `GET /api/health`
- `POST /api/extract` — body: `{ "url": "https://example.com" }`

## 安全说明

- 所有 HTML 视为不可信；禁止将 raw HTML 送入 LLM
- SSRF 防护：阻止私有 IP / localhost（`ALLOW_LOCALHOST=true` 可开开发模式）
- 移除 script/iframe/form 及事件处理器属性
- AI 系统提示词要求忽略页面内嵌指令
