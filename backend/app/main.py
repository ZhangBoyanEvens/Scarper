import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

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
