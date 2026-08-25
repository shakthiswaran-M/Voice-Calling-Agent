from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    llm_api_key: str
    llm_model: str = "sarvam-105b-conversations"

    class Config:
        env_file = "../.env"

settings = Settings()