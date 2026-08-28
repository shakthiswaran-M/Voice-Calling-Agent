from fastapi import APIRouter, UploadFile, File
from fastapi.responses import Response
from pydantic import BaseModel

from app.providers.stt import transcribe_audio
from app.providers.tts import synthesize_speech

router = APIRouter()


@router.post("/api/stt-test")
async def stt_test(file: UploadFile = File(..., media_type="audio/wav")):
    audio_bytes = await file.read()
    text = transcribe_audio(audio_bytes, file.filename)
    return {"transcript": text}


class TTSRequest(BaseModel):
    text: str


@router.post("/api/tts-test")
async def tts_test(req: TTSRequest):
    audio_bytes = synthesize_speech(req.text)

    return Response(
        content=audio_bytes,
        media_type="audio/mpeg",
        headers={
            "Content-Disposition": "attachment; filename=tts_test.mp3"
        },
    )
