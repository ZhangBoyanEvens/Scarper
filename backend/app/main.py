import asyncio
import logging
import sys
from contextlib import asynccontextmanager

# Playwright subprocess needs ProactorEventLoop on Windows
if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.deepseek_routes import router as deepseek_router
from app.api.document_routes import router as document_router
from app.api.diagnostics_routes import router as diagnostics_router
from app.api.neon_routes import router as neon_router
from app.api.routes import router
from app.config import settings
from app.services.pipeline import shutdown

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    yield
    await shutdown()


app = FastAPI(
    title="Scarper Secure Extractor",
    description="Secure web content extraction + AI summarization",
    version="1.0.0",
    lifespan=lifespan,
)

def _normalize_origins(raw: str) -> list[str]:
    out: list[str] = []
    for part in raw.split(","):
        origin = part.strip().rstrip("/")
        if origin:
            out.append(origin)
    return out


origins = _normalize_origins(settings.cors_origins)
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins or ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)
app.include_router(deepseek_router)
app.include_router(document_router)
app.include_router(diagnostics_router)
app.include_router(neon_router)
