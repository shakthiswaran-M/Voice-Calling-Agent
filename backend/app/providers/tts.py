import logging
from collections.abc import Iterator
from elevenlabs.client import ElevenLabs
from app.config import settings

logger = logging.getLogger(__name__)

client = ElevenLabs(api_key=settings.elevenlabs_api_key)


def _stream_speech_sync(text: str) -> Iterator[bytes]:
    audio = client.text_to_speech.convert(
        voice_id=settings.elevenlabs_voice_id,
        model_id=settings.elevenlabs_model_id,
        text=text,
        output_format="mp3_44100_128",
    )
    if isinstance(audio, bytes):
        if audio:
            yield audio
        return

    for chunk in audio:
        if chunk:
            yield chunk


def stream_speech(text: str) -> Iterator[bytes]:
    """Stream ElevenLabs audio chunks without buffering the full response."""
    logger.info("[TTS] Trying ElevenLabs")
    yielded_audio = False
    try:
        for chunk in _stream_speech_sync(text):
            yielded_audio = True
            yield chunk
    except Exception as exc:
        logger.warning("[TTS] ElevenLabs unavailable: %s", exc)
        raise
    if not yielded_audio:
        raise ValueError("ElevenLabs returned empty audio")
    logger.info("[TTS] ElevenLabs succeeded")