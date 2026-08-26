from pathlib import Path

from pydantic_settings import BaseSettings

ENV_FILE = Path(__file__).resolve().parents[1] / ".env"

class Settings(BaseSettings):
    llm_api_key: str
    llm_model: str = "sarvam-105b-conversations"

    class Config:
        env_file = ENV_FILE

settings = Settings()