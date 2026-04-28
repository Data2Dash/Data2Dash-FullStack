import os
from dotenv import load_dotenv
from langchain_groq import ChatGroq
from app.core.config import PipelineConfig

load_dotenv()   # 🔥 VERY IMPORTANT

def build_llm(cfg: PipelineConfig) -> ChatGroq:
    api_key = os.getenv("GROQ_API_KEY")

    if not api_key:
        raise RuntimeError(
            "GROQ_API_KEY is missing. Put it inside a .env file in project root."
        )

    return ChatGroq(
        api_key=api_key,
        temperature=cfg.temperature,
        model_name=cfg.model_name,
        max_retries=cfg.max_retries,
    )
