from uuid import uuid4
import re
import logging

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.database import database
from app.providers.llm import generate_response


router = APIRouter()
logger = logging.getLogger(__name__)


class ChatRequest(BaseModel):
    message: str
    session_id: str | None = None


class ChatResponse(BaseModel):
    reply: str
    session_id: str


def build_context_message(context: dict) -> str:
    """Converts stored context into information supplied to the LLM."""

    if not context:
        return ""

    context_parts = []

    customer = context.get("customer", {})
    conversation = context.get("conversation", {})

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

    important_facts = conversation.get(
        "important_facts",
        []
    )

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


def update_context(context: dict, message: str) -> dict:
    """Extract important information from the user message."""

    if not context:

        context = {
            "customer": {
                "name": None,
            },
            "business": {
                "appointment": None,
                "order": None,
            },
            "conversation": {
                "language": None,
                "topic": None,
                "important_facts": [],
            },
        }

    name_patterns = [
        r"\bmy name is ([A-Za-z]+)",
        r"\bi am ([A-Za-z]+)",
        r"\bi'm ([A-Za-z]+)",
        r"\bcall me ([A-Za-z]+)",
    ]

    for pattern in name_patterns:

        match = re.search(
            pattern,
            message,
            re.IGNORECASE,
        )

        if match:

            context["customer"]["name"] = (
                match.group(1).strip().title()
            )

            break

    if len(message.strip()) > 3:

        important_facts = context["conversation"].setdefault(
            "important_facts",
            []
        )

        if message not in important_facts:
            important_facts.append(message)

    return context


@router.post(
    "/api/chat",
    response_model=ChatResponse,
)
async def chat(req: ChatRequest):

    # Create or use existing session
    session_id = req.session_id or str(uuid4())

    # Ensure conversation exists
    await database.ensure_conversation(session_id)

    # Load conversation history
    history = await database.get_messages(session_id)

    # Load saved context
    context = await database.get_context(session_id)

    # Update context with current message
    context = update_context(
        context,
        req.message,
    )

    # Convert context into LLM-readable format
    context_message = build_context_message(context)

    try:

        # Call LLM provider
        reply, current_turn = await generate_response(
            message=req.message,
            history=history,
            context_message=context_message,
        )

    except Exception as exc:

        logger.exception(
            "LLM request failed for session %s",
            session_id,
        )

        raise HTTPException(
            status_code=502,
            detail=(
                "The language model service is unavailable. "
                "Check LLM_API_KEY and try again."
            ),
        ) from exc

    # Save current conversation turn
    await database.add_messages(
        session_id,
        current_turn,
    )

    # Save updated context
    await database.save_context(
        session_id,
        context,
    )

    return ChatResponse(
        reply=reply,
        session_id=session_id,
    )