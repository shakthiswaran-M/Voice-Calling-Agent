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
    stt_url: str = "https://api.sarvam.ai/speech-to-text"
    stt_model: str = "saaras:v3"
    stt_language_code: str = "en-IN"

    # TTS configuration
    elevenlabs_api_key: str
    elevenlabs_voice_id: str = "EXAVITQu4vr4xnSDxMaL"
    elevenlabs_model_id: str = "eleven_multilingual_v2"

    # Database configuration
    database_url: str
    db_pool_min_size: int = 1
    db_pool_max_size: int = 10
    conversation_retention_days: int = 30

    # CORS configuration
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    # Seeding — disabled by default; only enable locally if needed
    seed_demo_data: bool = False

    # Exotel configuration
    exotel_sid: str = ""
    exotel_api_key: str = ""
    exotel_api_token: str = ""
    exotel_subdomain: str = "api.exotel.com"
    exotel_caller_id: str = ""

    class Config:
        env_file = str(ENV_PATH)


settings = Settings()