"""DeepSeek token usage aggregation and cost estimation."""

from __future__ import annotations

from dataclasses import dataclass, field

from app.config import settings

# USD per 1M tokens — https://api-docs.deepseek.com/quick_start/pricing
_MODEL_PRICING: dict[str, dict[str, float]] = {
    "deepseek-chat": {
        "input_cache_hit": 0.07,
        "input_cache_miss": 0.27,
        "output": 1.10,
    },
    "deepseek-reasoner": {
        "input_cache_hit": 0.14,
        "input_cache_miss": 0.55,
        "output": 2.19,
    },
}


@dataclass
class CompletionUsage:
    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0
    prompt_cache_hit_tokens: int = 0
    prompt_cache_miss_tokens: int = 0

    @classmethod
    def from_api(cls, data: dict) -> CompletionUsage:
        raw = data.get("usage") if isinstance(data.get("usage"), dict) else {}
        prompt = int(raw.get("prompt_tokens") or 0)
        completion = int(raw.get("completion_tokens") or 0)
        total = int(raw.get("total_tokens") or (prompt + completion))
        hit = int(raw.get("prompt_cache_hit_tokens") or raw.get("cached_tokens") or 0)
        miss = int(raw.get("prompt_cache_miss_tokens") or 0)
        if prompt and hit == 0 and miss == 0:
            miss = prompt
        elif prompt and hit and miss == 0:
            miss = max(0, prompt - hit)
        return cls(
            prompt_tokens=prompt,
            completion_tokens=completion,
            total_tokens=total,
            prompt_cache_hit_tokens=hit,
            prompt_cache_miss_tokens=miss,
        )


@dataclass
class TokenUsageAccumulator:
    model: str = ""
    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0
    prompt_cache_hit_tokens: int = 0
    prompt_cache_miss_tokens: int = 0
    page_cache_hit: bool = False
    _calls: int = field(default=0, repr=False)

    def __post_init__(self) -> None:
        if not self.model:
            self.model = settings.deepseek_model

    def add(self, usage: CompletionUsage) -> None:
        if not any(
            (
                usage.prompt_tokens,
                usage.completion_tokens,
                usage.prompt_cache_hit_tokens,
                usage.prompt_cache_miss_tokens,
            ),
        ):
            return
        self._calls += 1
        self.prompt_tokens += usage.prompt_tokens
        self.completion_tokens += usage.completion_tokens
        self.total_tokens += usage.total_tokens or (
            usage.prompt_tokens + usage.completion_tokens
        )
        self.prompt_cache_hit_tokens += usage.prompt_cache_hit_tokens
        self.prompt_cache_miss_tokens += usage.prompt_cache_miss_tokens

    def estimated_cost_usd(self) -> float:
        if self.page_cache_hit:
            return 0.0
        rates = _MODEL_PRICING.get(self.model) or _MODEL_PRICING["deepseek-chat"]
        hit = self.prompt_cache_hit_tokens
        miss = self.prompt_cache_miss_tokens
        if self.prompt_tokens and hit == 0 and miss == 0:
            miss = self.prompt_tokens
        cost = (
            hit * rates["input_cache_hit"]
            + miss * rates["input_cache_miss"]
            + self.completion_tokens * rates["output"]
        ) / 1_000_000
        return round(cost, 6)

    def to_dict(self) -> dict:
        return {
            "model": self.model,
            "prompt_tokens": self.prompt_tokens,
            "completion_tokens": self.completion_tokens,
            "total_tokens": self.total_tokens,
            "prompt_cache_hit_tokens": self.prompt_cache_hit_tokens,
            "prompt_cache_miss_tokens": self.prompt_cache_miss_tokens,
            "page_cache_hit": self.page_cache_hit,
            "estimated_cost_usd": self.estimated_cost_usd(),
        }
