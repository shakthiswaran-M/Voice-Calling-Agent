import logging
from collections.abc import Iterator
from fastapi import APIRouter, UploadFile, File, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.providers.stt import transcribe_audio
from app.providers.tts import stream_speech
from app.providers.exotel import place_call

router = APIRouter()
logger = logging.getLogger(__name__)


@router.post("/api/stt-test")
async def stt_test(file: UploadFile = File(..., media_type="audio/wav")):
    audio_bytes = await file.read()
    try:
        text = await transcribe_audio(audio_bytes, file.filename)
    except Exception:
        logger.exception("STT request failed")
        raise HTTPException(status_code=502, detail="Speech-to-text service unavailable.")
    return {"transcript": text}


class TTSRequest(BaseModel):
    text: str


@router.post("/api/tts-test")
async def tts_test(req: TTSRequest):
    audio_stream = stream_speech(req.text)
    try:
        first_chunk = next(audio_stream)
    except Exception as exc:
        logger.warning("ElevenLabs TTS unavailable: %s", exc)
        raise HTTPException(
            status_code=503,
            detail="ElevenLabs TTS is unavailable. The browser can use speech synthesis fallback.",
        ) from exc

    def remaining_audio() -> Iterator[bytes]:
        yield first_chunk
        try:
            yield from audio_stream
        except Exception as exc:
            logger.warning("ElevenLabs TTS stream ended early: %s", exc)

    return StreamingResponse(
        remaining_audio(),
        media_type="audio/mpeg",
        headers={"Content-Disposition": "attachment; filename=tts_test.mp3"},
    )


class ExotelCallRequest(BaseModel):
    customer_number: str
    caller_id: str | None = None


@router.post("/api/exotel/call")
async def exotel_call(req: ExotelCallRequest):
    try:
        result = await place_call(customer_number=req.customer_number, caller_id=req.caller_id)
    except Exception:
        logger.exception("Exotel call request failed")
        raise HTTPException(status_code=502, detail="Exotel call service unavailable.")
    return {"success": True, "message": "Exotel call initiated", "data": result}