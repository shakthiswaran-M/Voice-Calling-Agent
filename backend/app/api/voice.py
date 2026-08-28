from fastapi import APIRouter, UploadFile, File
from app.providers.stt import transcribe_audio

router = APIRouter()

@router.post("/api/stt-test")
async def stt_test(file: UploadFile = File(..., media_type="audio/wav")):
    audio_bytes = await file.read()
    text = transcribe_audio(audio_bytes, file.filename)
    return {"transcript": text}
