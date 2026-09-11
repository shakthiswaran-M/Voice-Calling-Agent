from uuid import uuid4
import json
import re
import logging

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.database import database
from app.providers.llm import generate_response, clean_response, client, TOOL_SCHEMAS, AVAILABLE_TOOLS


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


# ── Streaming chat endpoint ──
# Returns Server-Sent Events: each "data:" line is a JSON object.
# {"type": "chunk", "text": "..."}   — incremental LLM text
# {"type": "done", "session_id": "..."}  — stream complete

from app.agent.prompts import AGENT_INSTRUCTIONS, SYSTEM_PROMPT
# from app.agent.business_info import BEHAVIOR_RULES


async def _build_messages(message: str, history: list, context_message: str) -> list:
    """Build the messages array for the LLM (shared by streaming and non-streaming)."""
    messages = [
        {
            "role": "system",
            "content": (
                f"{SYSTEM_PROMPT}\n\n"
                f"{AGENT_INSTRUCTIONS}\n\n"
                # f"Behavior rules:\n{BEHAVIOR_RULES}"
            ),
        }
    ]
    if context_message:
        messages.append({"role": "system", "content": context_message})
    messages.extend(history)
    messages.append({"role": "user", "content": message})
    return messages


async def _run_tool_loop(messages: list, current_turn: list) -> str:
    """Run up to 3 rounds of tool-calling. Returns the final reply text."""
    import inspect as _inspect
    import os as _os
    from app.config import settings as _settings
    initial_message_count = len(messages)

    for round_number in range(3):
        request = {
            "model": _settings.llm_model,
            "messages": messages,
        }
        if round_number < 2:
            request.update(
                tools=TOOL_SCHEMAS,
                tool_choice="auto",
            )
        else:
            tool_results = [
                item["content"]
                for item in messages[initial_message_count:]
                if item.get("role") == "tool"
            ]
            request["messages"] = messages[:initial_message_count] + [
                {
                    "role": "system",
                    "content": (
                        "The following website search results are "
                        "authoritative. Answer the user's question "
                        "directly from them. Do not claim the "
                        "information is unavailable and do not call any "
                        "tools.\n"
                        + "\n".join(tool_results)
                    ),
                }
            ]
        completion = await client.chat.completions.create(**request)
        assistant_message = completion.choices[0].message
        tool_calls = assistant_message.tool_calls or []
        assistant_data = assistant_message.model_dump(exclude_none=True)
        messages.append(assistant_data)
        current_turn.append(assistant_data)

        if not tool_calls:
            return assistant_message.content or ""

        for tool_call in tool_calls:
            tool_name = tool_call.function.name
            tool = AVAILABLE_TOOLS.get(tool_name)
            if tool is None:
                continue
            try:
                arguments = json.loads(tool_call.function.arguments or "{}")
                result = tool(**arguments)
                if _inspect.isawaitable(result):
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
    return ""


async def _stream_chat_generator(message: str, session_id: str):
    """Yield SSE lines for the streaming chat endpoint."""
    from app.config import settings

    await database.ensure_conversation(session_id)
    history = await database.get_messages(session_id)
    context = await database.get_context(session_id)
    context = update_context(context, message)
    context_message = build_context_message(context)

    messages = await _build_messages(message, history, context_message)
    current_turn = [messages[-1]]
    try:
        # Phase 1: tool calling (non-streaming) — typically 0-2 rounds
        reply_text = await _run_tool_loop(messages, current_turn)

        # Phase 2: stream the final text response
        if not reply_text:
            # Model didn't produce text in tool loop — make a final streaming call
            completion = await client.chat.completions.create(
                model=settings.llm_model,
                messages=messages,
                tools=TOOL_SCHEMAS,
                tool_choice="none",
                stream=True,
            )
            reply_text = ""
            async for chunk in completion:
                delta = chunk.choices[0].delta if chunk.choices else None
                if delta and delta.content:
                    reply_text += delta.content
                    yield f"data: {json.dumps({'type': 'chunk', 'text': delta.content})}\n\n"
            reply_text = clean_response(reply_text)
        else:
            # Text was produced during tool loop — stream it as a single chunk
            reply_text = clean_response(reply_text)
            yield f"data: {json.dumps({'type': 'chunk', 'text': reply_text})}\n\n"

    except Exception as exc:
        logger.exception("Streaming LLM request failed for session %s", session_id)
        error_msg = (
            "The language model service is unavailable. "
            "Check LLM_API_KEY and try again."
        )
        yield f"data: {json.dumps({'type': 'error', 'text': error_msg})}\n\n"
        yield f"data: {json.dumps({'type': 'done', 'session_id': session_id})}\n\n"
        return

    # Save conversation turn
    await database.add_messages(session_id, current_turn)
    await database.save_context(session_id, context)

    yield f"data: {json.dumps({'type': 'done', 'session_id': session_id})}\n\n"


@router.post("/api/chat/stream")
async def chat_stream(req: ChatRequest):
    session_id = req.session_id or str(uuid4())
    return StreamingResponse(
        _stream_chat_generator(req.message, session_id),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )