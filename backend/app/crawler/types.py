from dataclasses import dataclass
from typing import Literal

FetchMethod = Literal["httpx", "playwright"]


@dataclass
class FetchResult:
    url: str
    html: str
    method: FetchMethod
    status_code: int


class FetchError(Exception):
    def __init__(self, message: str, code: str = "fetch_failed"):
        super().__init__(message)
        self.code = code
