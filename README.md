<p align="center">
  <img src="public/assets/logo.svg" alt="Scarper" width="72" height="72" />
</p>

<h1 align="center">Scarper</h1>

<p align="center">Secure web scraping &amp; AI analysis</p>

<p align="center">
  <a href="https://www.sparnex.us">sparnex.us</a>
</p>

---

Scarper takes a URL, fetches and sanitizes the page, then uses DeepSeek to produce a summary and key points. Supports saved processing prompts, batch URLs, output language/detail, and per-user daily extract limits for signed-in users.

## Features

- Secure pipeline: httpx → (optional) Playwright → sanitize → extract → AI summary
- Clerk authentication; free plan: 20 extracts per day (`n/20`)
- Saved processing prompt applied on each search
- Batch URLs separated by `???` (max 10)

## Stack

| Frontend | Backend |
|----------|---------|
| React · Vite · TypeScript | FastAPI · httpx · trafilatura |
| Clerk | DeepSeek API |

## Local development

**1. Environment** — Copy `.env.example` to `.env` and fill in values.

**2. Backend**

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate          # Windows
pip install -r requirements.txt
playwright install chromium     # optional; needed for JS-heavy pages
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

**3. Frontend** (repo root)

```bash
npm install
npm run dev
```

Open http://localhost:5173. In dev, Vite proxies `/api` to `127.0.0.1:8000`.

## Production

| Service | Platform | Notes |
|---------|----------|--------|
| Frontend | [Vercel](https://vercel.com) | Preset: **Vite**, output `dist` |
| API | [Render](https://render.com) | **Python 3**, see below |

**Vercel:** `VITE_CLERK_PUBLISHABLE_KEY`, `VITE_BACKEND_URL` (Render service URL)

**Render:** `DEEPSEEK_API_KEY`, `CLERK_SECRET_KEY`, `CLERK_JWT_ISSUER`, `CORS_ORIGINS` (frontend origin(s), comma-separated), `PLAYWRIGHT_ENABLED=false`

Example Render commands:

```bash
# Build
pip install -r backend/requirements.txt

# Start
cd backend && uvicorn app.main:app --host 0.0.0.0 --port $PORT
```

When using a custom domain, add it to **Render `CORS_ORIGINS`** and **Clerk Domains**.

## API

- `GET /api/health`
- `GET /api/user/me` — requires auth
- `POST /api/extract` — `{ "url", "processing_prompt?", "output_language", "output_detail" }`

See [backend/README.md](backend/README.md) for backend details.

## Repository

https://github.com/ZhangBoyanEvens/Scarper
