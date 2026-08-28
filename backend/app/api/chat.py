from uuid import uuid4
import re
import logging
import json
import inspect
from fastapi import APIRouter, HTTPException
from openai import AsyncOpenAI
from pydantic import BaseModel
from app.agent.business_info import BUSINESS_INFO
from app.agent.prompts import AGENT_INSTRUCTIONS, SYSTEM_PROMPT
from app.agent.tools import AVAILABLE_TOOLS, TOOL_SCHEMAS
from app.config import settings
from app.database import database

router = APIRouter()
logger = logging.getLogger(__name__)
 
client = AsyncOpenAI(
    api_key=settings.llm_api_key,
    base_url="https://api.groq.com/openai/v1",
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
def update_context(session_id: str, message: str) -> dict:
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
    await database.ensure_conversation(session_id)

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
    current_turn = [messages[-1]]
 
 
    # Call LLM
   
    try:
        for _ in range(3):
            completion = await client.chat.completions.create(
                model=settings.llm_model,
                messages=messages,
                tools=TOOL_SCHEMAS,
                tool_choice="auto",
            )
            assistant_message = completion.choices[0].message
            tool_calls = assistant_message.tool_calls or []
 
            assistant_data = assistant_message.model_dump(exclude_none=True)
            messages.append(assistant_data)
            current_turn.append(assistant_data)
 
            if not tool_calls:
                reply = assistant_message.content or ""
                break
 
            for tool_call in tool_calls:
                tool_name = tool_call.function.name
                tool = AVAILABLE_TOOLS.get(tool_name)
                if tool is None:
                    raise ValueError(f"Unknown tool requested: {tool_name}")
 
                try:
                    arguments = json.loads(tool_call.function.arguments or "{}")
                    result = tool(**arguments)
                    if inspect.isawaitable(result):
                        result = await result
                except (TypeError, ValueError, json.JSONDecodeError) as exc:
                    result = {"error": f"Tool could not be executed: {exc}"}
 
                tool_message = {
                    "role": "tool",
                    "tool_call_id": tool_call.id,
                    "name": tool_name,
                    "content": json.dumps(result),
                }
                messages.append(tool_message)
                current_turn.append(tool_message)
        else:
            completion = await client.chat.completions.create(
                model=settings.llm_model,
                messages=messages,
                tools=TOOL_SCHEMAS,
                tool_choice="none",
            )
            assistant_message = completion.choices[0].message
            reply = assistant_message.content or ""
            current_turn.append(assistant_message.model_dump(exclude_none=True))
    except Exception as exc:
        logger.exception("LLM or tool request failed for session %s", session_id)
        raise HTTPException(
            status_code=502,
            detail="The language model service is unavailable. Check LLM_API_KEY and try again.",
        ) from exc
 
    # Save the complete current turn, including tool calls and results.
    await database.add_messages(session_id, current_turn)
    # Return response
    return ChatResponse(
        reply=reply,
        session_id=session_id,
    )
 
