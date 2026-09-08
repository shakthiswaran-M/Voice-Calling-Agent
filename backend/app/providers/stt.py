import httpx
from app.config import settings


async def transcribe_audio(audio_bytes: bytes, filename: str = "audio.wav") -> str:
    """Sends audio to Sarvam STT and returns the transcribed text."""
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(
            settings.stt_url,
            headers={"api-subscription-key": settings.stt_api_key},
            files={"file": (filename, audio_bytes, "audio/wav")},
            data={"model": settings.stt_model, "language_code": settings.stt_language_code},
        )
        response.raise_for_status()
        result = response.json()
        return result.get("transcript", "")