from uuid import uuid4
import re
from fastapi import APIRouter
from openai import AsyncOpenAI
from pydantic import BaseModel
from app.agent.business_info import BUSINESS_INFO
from app.agent.prompts import AGENT_INSTRUCTIONS, SYSTEM_PROMPT
from app.config import settings

router = APIRouter()

client = AsyncOpenAI(
    api_key=settings.llm_api_key,
    base_url="https://api.sarvam.ai/v1",
    default_headers={"api-subscription-key": settings.llm_api_key},
)
# REQUEST / RESPONSE MODELS
class ChatRequest(BaseModel):
    message: str
    session_id: str | None = None

class ChatResponse(BaseModel):
    reply: str
    session_id: str

# CONVERSATION STORAGE
conversation_history: dict[str, list[dict[str, str]]] = {}
# CONTEXT STORAGE
conversation_context: dict[str, dict] = {}
# CONTEXT MANAGEMENT
def update_context(session_id: str, message: str):
    """
    Extract important information from the user's message
    and store it for the current conversation session.
    """

    if session_id not in conversation_context:
        conversation_context[session_id] = {
            "customer": {
                "name": None
            },
            "business": {
                "appointment": None,
                "order": None
            },
            "conversation": {
                "language": None,
                "topic": None,
                "important_facts": []
            }
        }

    context = conversation_context[session_id]

    name_patterns = [
        r"\bmy name is ([A-Za-z]+)",
        r"\bi am ([A-Za-z]+)",
        r"\bi'm ([A-Za-z]+)",
        r"\bcall me ([A-Za-z]+)",
    ]

    for pattern in name_patterns:
        match = re.search(pattern, message, re.IGNORECASE)

        if match:
            context["customer"]["name"] = match.group(1).strip().title()
            break

    if len(message.strip()) > 3:
        important_facts = context["conversation"]["important_facts"]
        if message not in important_facts:
            important_facts.append(message)

    return context


# ============================================================
# CONTEXT FORMATTER
# ============================================================

def build_context_message(session_id: str) -> str:
    """
    Converts stored context into information that can be
    supplied to the LLM.
    """

    context = conversation_context.get(session_id)

    if not context:
        return ""

    context_parts = []

    customer = context["customer"]
    conversation = context["conversation"]

    if customer.get("name"):
        context_parts.append(
            f"Customer name: {customer['name']}"
        )

    if conversation.get("language"):
        context_parts.append(
            f"Preferred language: {conversation['language']}"
        )

    if conversation.get("topic"):
        context_parts.append(
            f"Current topic: {conversation['topic']}"
        )

    important_facts = conversation["important_facts"]
    if important_facts:
        context_parts.append(
            "Relevant information from the conversation:\n"
            + "\n".join(
                f"- {fact}"
                for fact in important_facts[-5:]
            )
        )

    if not context_parts:
        return ""

    return (
        "CONVERSATION CONTEXT:\n"
        + "\n".join(context_parts)
    )


# ============================================================
# CHAT ENDPOINT
# ============================================================

@router.post("/api/chat", response_model=ChatResponse)
async def chat(req: ChatRequest):

    # --------------------------------------------------------
    # Create a session if one doesn't exist
    # --------------------------------------------------------

    session_id = req.session_id or str(uuid4())

    # --------------------------------------------------------
    # Create history for this session
    # --------------------------------------------------------

    if session_id not in conversation_history:
        conversation_history[session_id] = []

  
    # Update context BEFORE calling the LLM
  

    update_context(
        session_id=session_id,
        message=req.message,
    )

    # Get current context
  

    context_message = build_context_message(session_id)

   
    # Build messages for the LLM
   

    messages = [
        {
            "role": "system",
            "content": f"{SYSTEM_PROMPT}\n\n{AGENT_INSTRUCTIONS}\n\nBusiness information:\n{BUSINESS_INFO}",
        }
    ]

    # Add context if available
    if context_message:
        messages.append(
            {
                "role": "system",
                "content": context_message,
            }
        )

    # Add previous conversation history
    messages.extend(
        conversation_history[session_id]
    )

    # Add current user message
    messages.append(
        {
            "role": "user",
            "content": req.message,
        }
    )

  
    # Call LLM
   
    completion = await client.chat.completions.create(
        model=settings.llm_model,
        messages=messages,
    )

    reply = completion.choices[0].message.content or ""

    # SAVE USER MESSAGE

    conversation_history[session_id].append(
        {
            "role": "user",
            "content": req.message,
        }
    )

    # SAVE AI RESPONSE  
    conversation_history[session_id].append(
        {
            "role": "assistant",
            "content": reply,
        }
    )
    # Return response
    return ChatResponse(
        reply=reply,
        session_id=session_id,
    )