"""
backend_python/agents/model_router.py
──────────────────────────────────────
Centralized Groq model selector with automatic rate-limit fallback.

Current Groq free-tier model pools (May 2026):
  Production : llama-3.3-70b-versatile, llama-3.1-8b-instant
  Preview    : meta-llama/llama-4-scout-17b-16e-instruct, qwen/qwen3-32b
  Decommissioned (DO NOT USE): gemma2-9b-it, gemma-7b-it, mixtral-8x7b-32768
"""

from __future__ import annotations

import logging
import os
from typing import Optional

from groq import Groq, RateLimitError, AuthenticationError, APIConnectionError, APIStatusError

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Ordered fallback chain — best available models as of May 2026
# ---------------------------------------------------------------------------
_FALLBACK_CHAIN = [
    "llama-3.3-70b-versatile",                   # Production — high quality
    "llama-3.1-8b-instant",                      # Production — fast/cheap
    "meta-llama/llama-4-scout-17b-16e-instruct", # Preview — separate quota
    "qwen/qwen3-32b",                            # Preview — separate quota
]

# Runtime set of models known to be rate-limited this session
_rate_limited: set[str] = set()
# Decommissioned models — skip immediately without trying
_decommissioned: set[str] = {
    "gemma2-9b-it", "gemma-7b-it", "gemma-2-9b-it",
    "mixtral-8x7b-32768", "llama2-70b-4096",
}


def _try_model(client: Groq, model: str, messages: list, max_tokens: int, temperature: float) -> str:
    response = client.chat.completions.create(
        model=model,
        messages=messages,
        max_tokens=max_tokens,
        temperature=temperature,
    )
    return response.choices[0].message.content or ""


def chat_with_fallback(
    messages: list[dict],
    *,
    preferred_model: str = "llama-3.3-70b-versatile",
    max_tokens: int = 4096,
    temperature: float = 0.3,
    groq_api_key: Optional[str] = None,
) -> str:
    api_key = groq_api_key or os.getenv("GROQ_API_KEY", "")
    client = Groq(api_key=api_key)

    chain = [preferred_model] + [m for m in _FALLBACK_CHAIN if m != preferred_model]
    last_error: Exception | None = None

    for model in chain:
        if model in _decommissioned:
            logger.debug("Skipping decommissioned model: %s", model)
            continue
        if model in _rate_limited:
            logger.debug("Skipping rate-limited model: %s", model)
            continue
        try:
            result = _try_model(client, model, messages, max_tokens, temperature)
            if model != preferred_model:
                logger.info("Used fallback model %s (preferred %s unavailable)", model, preferred_model)
            return result
        except RateLimitError as exc:
            logger.warning("Rate limit on %s — trying next.", model)
            _rate_limited.add(model)
            last_error = exc
        except Exception as exc:
            err = str(exc)
            if "decommissioned" in err or "400" in err:
                logger.warning("Model %s decommissioned — removing from chain.", model)
                _decommissioned.add(model)
            else:
                logger.warning("Error on %s: %s", model, exc)
            last_error = exc

    raise RuntimeError(
        f"All Groq models exhausted. Last error: {last_error}. "
        "Wait ~30 minutes for rate limits to reset, or upgrade your Groq plan."
    )


def get_groq_llm(
    preferred_model: str = "llama-3.3-70b-versatile",
    temperature: float = 0.3,
    groq_api_key: Optional[str] = None,
):
    from langchain_groq import ChatGroq

    api_key = groq_api_key or os.getenv("GROQ_API_KEY", "")
    chain = [preferred_model] + [m for m in _FALLBACK_CHAIN if m != preferred_model]

    for model in chain:
        if model not in _decommissioned and model not in _rate_limited:
            if model != preferred_model:
                logger.info("LLM fallback: using %s (preferred %s unavailable)", model, preferred_model)
            return ChatGroq(groq_api_key=api_key, model_name=model, temperature=temperature)

    logger.error("All models unavailable — returning preferred as last resort.")
    return ChatGroq(groq_api_key=api_key, model_name=preferred_model, temperature=temperature)


def clear_rate_limit_cache():
    _rate_limited.clear()
    logger.info("Rate-limit cache cleared.")
