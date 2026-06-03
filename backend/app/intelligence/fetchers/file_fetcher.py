"""File URL handler — reject unsupported downloads."""

from app.crawler.types import FetchError


class FileFetcher:
    async def fetch(self, url: str) -> None:
        raise FetchError("不支持直接下载该文件类型", "blocked_file_type")
