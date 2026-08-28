from pathlib import Path
from pydantic_settings import BaseSettings

BASE_DIR = Path(__file__).resolve().parent.parent
ENV_PATH = BASE_DIR / ".env"

class Settings(BaseSettings):
    llm_api_key: str
    llm_model: str = "llama-3.3-70b-versatile"
    stt_api_key: str
    elevenlabs_api_key: str
    database_url: str

    class Config:
        env_file = str(ENV_PATH)

settings = Settings()
