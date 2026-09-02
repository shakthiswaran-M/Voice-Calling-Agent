
from pathlib import Path
from pydantic_settings import BaseSettings

BASE_DIR = Path(__file__).resolve().parent.parent
ENV_PATH = BASE_DIR / ".env"


class Settings(BaseSettings):
    # LLM configuration
    llm_api_key: str
    llm_model: str = "llama-3.3-70b-versatile"

    # STT configuration
    stt_api_key: str

    # TTS configuration
    elevenlabs_api_key: str

    # Database configuration
    database_url: str

    # Exotel configuration
    exotel_sid: str = ""
    exotel_api_key: str = ""
    exotel_api_token: str = ""
    exotel_subdomain: str = "api.exotel.com"
    exotel_caller_id: str = ""

    class Config:
        env_file = str(ENV_PATH)


settings = Settings()
