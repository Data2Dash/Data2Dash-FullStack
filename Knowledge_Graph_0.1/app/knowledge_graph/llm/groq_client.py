import os
from dotenv import load_dotenv
from langchain_groq import ChatGroq
from groq import Groq, RateLimitError
from app.core.config import PipelineConfig

load_dotenv()

# Current valid Groq models (May 2026) — no Gemma, no Mixtral
_FALLBACK_CHAIN = [
    "llama-3.1-8b-instant",                      # Production — fast
    "llama-3.3-70b-versatile",                   # Production — quality
    "meta-llama/llama-4-scout-17b-16e-instruct", # Preview
    "qwen/qwen3-32b",                            # Preview — separate quota
]

_DECOMMISSIONED = {"gemma2-9b-it", "gemma-7b-it", "mixtral-8x7b-32768"}


def build_llm(cfg: PipelineConfig) -> ChatGroq:
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        raise RuntimeError("GROQ_API_KEY is missing.")

    preferred = cfg.model_name
    if preferred in _DECOMMISSIONED:
        preferred = "llama-3.1-8b-instant"

    chain = [preferred] + [m for m in _FALLBACK_CHAIN if m != preferred]
    client = Groq(api_key=api_key)

    working_model = preferred
    for model in chain:
        try:
            client.chat.completions.create(
                model=model,
                messages=[{"role": "user", "content": "hi"}],
                max_tokens=1,
            )
            working_model = model
            break
        except RateLimitError:
            continue
        except Exception as e:
            if "decommissioned" in str(e) or "400" in str(e):
                continue
            break  # network/auth — don't cycle

    if working_model != preferred:
        import logging
        logging.getLogger(__name__).warning(
            "KG: preferred model %s unavailable, using %s.", preferred, working_model
        )

    return ChatGroq(
        api_key=api_key,
        temperature=cfg.temperature,
        model_name=working_model,
        max_retries=cfg.max_retries,
    )
