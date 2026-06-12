<p align="center">
  <img src="public/assets/logo.svg" alt="Scarper" width="72" height="72" />
</p>

<h1 align="center">Scarper</h1>

<p align="center">Secure web scraping, project library &amp; AI document workflows</p>

<p align="center">
  <a href="https://www.sparnex.us">sparnex.us</a>
</p>

---

Scarper fetches URLs, sanitizes page content, and uses DeepSeek to produce structured summaries. Results can be saved to per-user **Projects** (Neon cloud or local fallback), then reused in **FinDoc**, **RAG Chat**, and **Vetra** outreach tools.

## Features

### Core

- **Scrape** — URL tasks, batch input (`???`), optional AI merge, processing prompt, output language/detail
- **Project** — Group scrape & FinDoc records; Neon Postgres per Clerk user when configured
- **Tools hub** — Scrape · FinDoc · Templates · RAG Chat · Vetra

### Tools

| Tool | Purpose |
|------|---------|
| **FinDoc** | Merge Task content into a template structure, AI rewrite, save to Project; **Proceed** reuses matching saved context |
| **Templates** | Create/edit FinDoc template structures; AI structure analysis |
| **RAG Chat** | Ask questions grounded in selected Task body text |
| **Vetra** | Company intros, email templates, collaboration analysis & outreach generation (Neon-backed) |

### Platform

- Secure pipeline: httpx → (optional) Playwright → sanitize → extract → AI summary
- **Clerk** authentication; optional daily extract limits for signed-in users
- **i18n** — English / 中文 UI toggle in **Settings → Language**
- **Ant Design** light UI with shared design tokens
- In-memory page cache (same URL + prompt + language + detail)
- Diagnostics panel in Settings (backend health, Neon, auth)

## Stack

| Frontend | Backend |
|----------|---------|
| React 19 · Vite 8 · TypeScript | FastAPI · httpx · trafilatura |
| Ant Design · Clerk | DeepSeek API · Playwright (optional) |
| i18n (`src/i18n/`) | Neon Postgres (optional) |

## Local development

**1. Environment** — Copy `.env.example` to `.env` and fill in values (`DEEPSEEK_API_KEY`, Clerk keys, optional `NEON_DATABASE_URL`).

**2. Backend** (port `8000`)

```bash
npm run dev:api
# or:
cd backend && python -m venv .venv && .venv\Scripts\activate
pip install -r requirements.txt
playwright install chromium   # optional; JS-heavy pages
python run_dev.py
```

**3. Frontend** (port `5173`)

```bash
npm install
npm run dev
```

Open http://127.0.0.1:5173. Vite proxies `/api` to the backend (`VITE_BACKEND_URL` or `http://127.0.0.1:8000`).

**Build & preview**

```bash
npm run build
npm run preview
```

## Project layout

```
src/
  components/     # Pages, Scrape, FinDoc, Vetra, settings
  i18n/           # en/zh message packs & helpers
  contexts/       # Settings, i18n, scrape session, user profile
  services/       # API clients (extract, neon, findoc, vetra)
backend/
  app/            # FastAPI routes, pipeline, Neon CRUD
docs/
  api-cost-report.md
  SCARPER_INTRODUCTION.md
```

## Production

| Service | Platform | Notes |
|---------|----------|--------|
| Frontend | [Vercel](https://vercel.com) | Preset: **Vite**, output `dist` |
| API | [Render](https://render.com) | Python 3; see `docs/DEPLOY_HONG_KONG.md` |

**Vercel:** `VITE_CLERK_PUBLISHABLE_KEY`, `VITE_BACKEND_URL`

**Render:** `DEEPSEEK_API_KEY`, `CLERK_SECRET_KEY`, `CLERK_JWT_ISSUER`, `CORS_ORIGINS`, `NEON_DATABASE_URL` (optional), `PLAYWRIGHT_ENABLED=false` on slim hosts

Example Render start:

```bash
pip install -r backend/requirements.txt
cd backend && uvicorn app.main:app --host 0.0.0.0 --port $PORT
```

Add custom domains to **Render `CORS_ORIGINS`** and **Clerk Domains**.

## API (summary)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/health` | Health check |
| `GET` | `/api/user/me` | Current user (auth) |
| `POST` | `/api/extract` | Scrape + AI summary |
| `POST` | `/api/merge` | Multi-page AI integrate |
| `GET/POST` | `/api/neon/*` | Projects, uploads, FinDoc, Vetra |

See [backend/README.md](backend/README.md) and [docs/api-cost-report.md](docs/api-cost-report.md) for details.

## Docs

- [Product introduction](docs/SCARPER_INTRODUCTION.md)
- [API cost report (RMB)](docs/api-cost-report.md)
- [Hong Kong VPS deploy](docs/DEPLOY_HONG_KONG.md)

## Repository

https://github.com/ZhangBoyanEvens/Scarper
