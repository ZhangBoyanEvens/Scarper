"""Probabilistic strategy selection — delegates to routing_probability."""

from app.intelligence.routing_probability import select_strategy_decision
from app.intelligence.types import PreflightResult, StrategyDecision


class StrategyRouter:
    def route(self, preflight: PreflightResult) -> StrategyDecision:
        return select_strategy_decision(preflight)
