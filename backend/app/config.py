from pathlib import Path
from pydantic_settings import BaseSettings

BASE_DIR = Path(__file__).resolve().parent.parent   # points to backend/
ENV_PATH = BASE_DIR / ".env"                        # points to backend/.env

class Settings(BaseSettings):
    llm_api_key: str
    llm_model: str = "sarvam-105b-conversations"

    class Config:
        env_file = str(ENV_PATH)

settings = Settings()