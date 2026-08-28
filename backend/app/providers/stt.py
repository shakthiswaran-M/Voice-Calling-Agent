import requests
from app.config import settings

STT_URL = "https://api.sarvam.ai/speech-to-text"

def transcribe_audio(audio_bytes: bytes, filename: str = "audio.wav") -> str:
    """Sends audio to Sarvam STT and returns the transcribed text."""
    response = requests.post(
        STT_URL,
        headers={"api-subscription-key": settings.stt_api_key},
        files={"file": (filename, audio_bytes, "audio/wav")},
        data={"model": "saaras:v3", "language_code": "en-IN"},
    )
    response.raise_for_status()
    result = response.json()
    return result.get("transcript", "")
