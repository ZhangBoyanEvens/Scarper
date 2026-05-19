# Scarper Backend

FastAPI service: secure fetch → sanitize → structured extraction → DeepSeek summary.

```
httpx → Playwright (optional) → sanitizer → trafilatura → DeepSeek
```

Local setup and Render deployment: see the root [README.md](../README.md).

## Security

- Raw HTML is never sent to the LLM
- SSRF protection (`ALLOW_LOCALHOST=true` for local dev only)
- Strips scripts, iframes, event handlers, and similar
