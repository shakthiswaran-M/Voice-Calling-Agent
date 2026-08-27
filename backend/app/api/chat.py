from uuid import uuid4
import json
import re
import logging
from fastapi import APIRouter, HTTPException
from openai import AsyncOpenAI
from pydantic import BaseModel
from app.agent.business_info import BUSINESS_INFO
from app.agent.prompts import AGENT_INSTRUCTIONS, SYSTEM_PROMPT
from app.agent.tools import TOOL_SCHEMAS, AVAILABLE_TOOLS
from app.config import settings

router = APIRouter()
logger = logging.getLogger(__name__)

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
conversation_history: dict[str, list[dict]] = {}
# CONTEXT STORAGE
conversation_context: dict[str, dict] = {}


# CONTEXT MANAGEMENT
def update_context(session_id: str, message: str):
    if session_id not in conversation_context:
        conversation_context[session_id] = {
            "customer": {"name": None},
            "business": {"appointment": None, "order": None},
            "conversation": {"language": None, "topic": None, "important_facts": []},
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


def build_context_message(session_id: str) -> str:
    context = conversation_context.get(session_id)
    if not context:
        return ""

    context_parts = []
    customer = context["customer"]
    conversation = context["conversation"]

    if customer.get("name"):
        context_parts.append(f"Customer name: {customer['name']}")
    if conversation.get("language"):
        context_parts.append(f"Preferred language: {conversation['language']}")
    if conversation.get("topic"):
        context_parts.append(f"Current topic: {conversation['topic']}")

    important_facts = conversation["important_facts"]
    if important_facts:
        context_parts.append(
            "Relevant information from the conversation:\n"
            + "\n".join(f"- {fact}" for fact in important_facts[-5:])
        )

    if not context_parts:
        return ""

    return "CONVERSATION CONTEXT:\n" + "\n".join(context_parts)


# CHAT ENDPOINT
@router.post("/api/chat", response_model=ChatResponse)
async def chat(req: ChatRequest):
    session_id = req.session_id or str(uuid4())

    if session_id not in conversation_history:
        conversation_history[session_id] = []

    update_context(session_id=session_id, message=req.message)
    context_message = build_context_message(session_id)

    messages = [
        {
            "role": "system",
            "content": f"{SYSTEM_PROMPT}\n\n{AGENT_INSTRUCTIONS}\n\nBusiness information:\n{BUSINESS_INFO}",
        }
    ]
    if context_message:
        messages.append({"role": "system", "content": context_message})

    messages.extend(conversation_history[session_id])
    messages.append({"role": "user", "content": req.message})

    try:
        # First LLM call — it may ask to use a tool instead of answering directly
        completion = await client.chat.completions.create(
            model=settings.llm_model,
            messages=messages,
            tools=TOOL_SCHEMAS,
        )
    except Exception as exc:
        logger.exception("LLM request failed for session %s", session_id)
        raise HTTPException(
            status_code=502,
            detail="The language model service is unavailable. Check LLM_API_KEY and try again.",
        ) from exc

    response_message = completion.choices[0].message

    # ------------------------------------------------------------
    # TOOL CALLING LOOP
    # If the LLM asked to call a tool, run it and send the result back
    # ------------------------------------------------------------
    if response_message.tool_calls:
        messages.append(response_message.model_dump(exclude_none=True))

        for tool_call in response_message.tool_calls:
            tool_name = tool_call.function.name
            try:
                tool_args = json.loads(tool_call.function.arguments)
            except json.JSONDecodeError:
                tool_args = {}

            tool_function = AVAILABLE_TOOLS.get(tool_name)
            if tool_function:
                logger.info("Calling tool %s with args %s", tool_name, tool_args)
                tool_result = tool_function(**tool_args)
            else:
                tool_result = {"error": f"Unknown tool: {tool_name}"}

            messages.append(
                {
                    "role": "tool",
                    "tool_call_id": tool_call.id,
                    "content": json.dumps(tool_result),
                }
            )

        # Second LLM call — Sarvam requires `tools` here too, since tool
        # messages are now present in the conversation history.
        try:
            completion = await client.chat.completions.create(
                model=settings.llm_model,
                messages=messages,
                tools=TOOL_SCHEMAS,
            )
        except Exception as exc:
            logger.exception("LLM follow-up request failed for session %s", session_id)
            raise HTTPException(
                status_code=502,
                detail="The language model service is unavailable. Check LLM_API_KEY and try again.",
            ) from exc

        reply = completion.choices[0].message.content or ""
    else:
        reply = response_message.content or ""

    conversation_history[session_id].append({"role": "user", "content": req.message})
    conversation_history[session_id].append({"role": "assistant", "content": reply})

    return ChatResponse(reply=reply, session_id=session_id)