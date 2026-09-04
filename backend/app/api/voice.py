import logging
from fastapi import APIRouter, UploadFile, File, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel

from app.providers.stt import transcribe_audio
from app.providers.tts import synthesize_speech
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
    try:
        audio_bytes = await synthesize_speech(req.text)
    except Exception:
        logger.exception("TTS request failed")
        raise HTTPException(status_code=502, detail="Text-to-speech service unavailable.")
    return Response(
        content=audio_bytes,
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