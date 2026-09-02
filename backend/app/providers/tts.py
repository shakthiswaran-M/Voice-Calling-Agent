from elevenlabs.client import ElevenLabs
from app.config import settings

client = ElevenLabs(
    api_key=settings.elevenlabs_api_key
)

VOICE_ID = "EXAVITQu4vr4xnSDxMaL"
MODEL_ID = "eleven_multilingual_v2"


def synthesize_speech(text: str) -> bytes:
    """Convert text to speech using ElevenLabs."""
    audio = client.text_to_speech.convert(
        voice_id=VOICE_ID,
        model_id=MODEL_ID,
        text=text,
        output_format="mp3_44100_128",
    )

    if isinstance(audio, bytes):
        return audio

    return b"".join(audio)
