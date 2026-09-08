import asyncio
import logging
from elevenlabs.client import ElevenLabs
from app.config import settings

logger = logging.getLogger(__name__)

client = ElevenLabs(api_key=settings.elevenlabs_api_key)


def _synthesize_speech_sync(text: str) -> bytes:
    audio = client.text_to_speech.convert(
        voice_id=settings.elevenlabs_voice_id,
        model_id=settings.elevenlabs_model_id,
        text=text,
        output_format="mp3_44100_128",
    )
    audio_bytes = audio if isinstance(audio, bytes) else b"".join(audio)
    if not audio_bytes:
        raise ValueError("ElevenLabs returned empty audio")
    return audio_bytes


async def synthesize_speech(text: str) -> bytes:
    """Convert text to speech using ElevenLabs, off the event loop."""
    logger.info("[TTS] Trying ElevenLabs")
    try:
        audio_bytes = await asyncio.to_thread(_synthesize_speech_sync, text)
    except Exception:
        logger.exception("[TTS] ElevenLabs failed")
        raise
    logger.info("[TTS] ElevenLabs succeeded")
    return audio_bytes