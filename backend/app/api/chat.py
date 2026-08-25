from fastapi import APIRouter
from pydantic import BaseModel
from openai import OpenAI
from app.config import settings

router = APIRouter()

client = OpenAI(
    api_key=settings.llm_api_key,
    base_url="https://api.sarvam.ai/v1",
    default_headers={"api-subscription-key": settings.llm_api_key},
)

class ChatRequest(BaseModel):
    message: str
    session_id: str | None = None

class ChatResponse(BaseModel):
    reply: str
    session_id: str

@router.post("/api/chat", response_model=ChatResponse)
async def chat(req: ChatRequest):
    completion = client.chat.completions.create(
        model=settings.llm_model,
        messages=[
            {"role": "system", "content": "You are a helpful customer support agent."},
            {"role": "user", "content": req.message},
        ],
    )
    reply = completion.choices[0].message.content
    return ChatResponse(reply=reply, session_id=req.session_id or "temp-session")
