from uuid import uuid4
import json
import logging
import re

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.database import database
from app.agent.prompts import NETKATHIR_SCOPE_RESTRICTION_RESPONSE
from app.providers.llm import (
    AVAILABLE_TOOLS,
    MAX_OUTPUT_TOKENS,
    TOOL_SCHEMAS,
    clean_response,
    client,
    generate_response,
    get_closing_response,
    get_acknowledgement_response,
    get_relevant_history,
    analyze_personal_context,
    contains_question,
    is_netkathir_related,
)


router = APIRouter()
logger = logging.getLogger(__name__)


class ChatRequest(BaseModel):
    message: str
    session_id: str | None = None


class ChatResponse(BaseModel):
    reply: str
    session_id: str


PERSONAL_RECALL_PATTERNS = {
    "name": re.compile(
        r"\b(?:what\s+is\s+my\s+name|what\s+did\s+i\s+tell\s+you\s+my\s+name\s+was|"
        r"do\s+you\s+remember\s+my\s+name)\b",
        re.IGNORECASE,
    ),
    "role": re.compile(
        r"\b(?:what\s+is\s+my\s+role|what\s+role\s+did\s+i\s+say\s+i\s+have)\b",
        re.IGNORECASE,
    ),
    "team": re.compile(
        r"\b(?:which\s+team\s+(?:do\s+i\s+work\s+in|am\s+i\s+from)|"
        r"what\s+(?:team|department)\s+(?:do\s+i\s+work\s+in|am\s+i\s+from))\b",
        re.IGNORECASE,
    ),
    "all": re.compile(
        r"\bwhat\s+did\s+i\s+tell\s+you\s+about\s+myself\b",
        re.IGNORECASE,
    ),
}


def get_personal_context_reply(message: str, context: dict) -> str | None:
    """Answer only explicit personal-context recall questions from saved fields."""
    customer = context.get("customer", {}) if context else {}

    def role_phrase(role: str) -> str:
        normalized_role = role.strip()
        if re.match(r"^(?:a|an|the)\s+", normalized_role, re.IGNORECASE):
            return normalized_role
        article = "an" if normalized_role[:1].lower() in "aeiou" else "a"
        return f"{article} {normalized_role}"

    if PERSONAL_RECALL_PATTERNS["name"].search(message):
        name = customer.get("name")
        return f"Your name is {name}." if name else "I don't think you've told me your name yet."

    if PERSONAL_RECALL_PATTERNS["role"].search(message):
        role = customer.get("role")
        return (
            f"You told me you're {role_phrase(role)}."
            if role
            else "I don't think you've told me your role yet."
        )

    if PERSONAL_RECALL_PATTERNS["team"].search(message):
        team = customer.get("team")
        return (
            f"You told me you work in {team}."
            if team
            else "I don't think you've told me your team yet."
        )

    if PERSONAL_RECALL_PATTERNS["all"].search(message):
        details = []
        if customer.get("name"):
            details.append(f"your name is {customer['name']}")
        if customer.get("role"):
            details.append(f"you are {role_phrase(customer['role'])}")
        if customer.get("team"):
            details.append(f"you work in {customer['team']}")
        if customer.get("affiliation"):
            details.append(f"you are affiliated with {customer['affiliation']}")
        if details:
            return "You told me that " + ", and ".join(details) + "."
        return "I don't think you've told me anything about yourself yet."

    return None


async def save_direct_reply(session_id: str, message: str, reply: str) -> None:
    """Persist deterministic intent replies like any other conversation turn."""
    await database.add_messages(
        session_id,
        [
            {"role": "user", "content": message},
            {"role": "assistant", "content": reply},
        ],
    )


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

    if customer.get("role"):
        context_parts.append(f"Customer role: {customer['role']}")

    if customer.get("team"):
        context_parts.append(f"Customer team or department: {customer['team']}")

    if customer.get("affiliation"):
        context_parts.append(f"Customer affiliation: {customer['affiliation']}")

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


def update_context(context: dict, message: str, personal_context: dict | None = None) -> dict:
    """Extract important information from the user message."""

    if not context:

        context = {
            "customer": {
                "name": None,
                "role": None,
                "team": None,
                "affiliation": None,
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

    if personal_context:
        customer = context["customer"]
        for field in ("name", "role", "team", "affiliation"):
            value = personal_context.get(field)
            if isinstance(value, str) and value.strip():
                customer[field] = value.strip()

        context["conversation"]["personal_intent"] = personal_context["intent"]

    if len(message.strip()) > 3:
        message_lower = message.lower()
        follow_up_keywords = (
            "this",
            "that",
            "it",
            "they",
            "them",
            "those",
            "earlier",
            "before",
            "previous",
            "mentioned",
            "company",
            "business",
            "organization",
        )

        if any(keyword in message_lower for keyword in follow_up_keywords):
            important_facts = context["conversation"].setdefault(
                "important_facts",
                []
            )
            if message.strip() not in important_facts:
                important_facts.append(message.strip())
                context["conversation"]["important_facts"] = important_facts[-3:]

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

    personal_context = await analyze_personal_context(req.message)

    # Update context with current message
    context = update_context(
        context,
        req.message,
        personal_context,
    )

    # Convert context into LLM-readable format
    context_message = build_context_message(context)

    personal_recall_reply = get_personal_context_reply(req.message, context)
    if personal_recall_reply:
        await save_direct_reply(session_id, req.message, personal_recall_reply)
        await database.save_context(session_id, context)
        return ChatResponse(reply=personal_recall_reply, session_id=session_id)

    closing_response = get_closing_response(req.message)
    if closing_response:
        current_turn = [
            {"role": "user", "content": req.message},
            {"role": "assistant", "content": closing_response},
        ]
        await database.add_messages(session_id, current_turn)
        await database.save_context(session_id, context)
        return ChatResponse(reply=closing_response, session_id=session_id)

    acknowledgement_response = get_acknowledgement_response(req.message)
    if acknowledgement_response:
        await save_direct_reply(session_id, req.message, acknowledgement_response)
        await database.save_context(session_id, context)
        return ChatResponse(
            reply=acknowledgement_response,
            session_id=session_id,
        )

    if (
        personal_context
        and personal_context["intent"] == "SELF_INTRODUCTION"
        and not contains_question(req.message)
    ):
        name = personal_context.get("name")
        reply = (
            f"Hello {name}! How can I assist you today?"
            if name
            else "Nice to meet you! How can I assist you today?"
        )
        current_turn = [
            {"role": "user", "content": req.message},
            {"role": "assistant", "content": reply},
        ]
        await database.add_messages(session_id, current_turn)
        await database.save_context(session_id, context)
        return ChatResponse(reply=reply, session_id=session_id)

    if not is_netkathir_related(
        req.message,
        history=history,
        context_message=context_message,
        personal_context=personal_context,
    ):
        reply = NETKATHIR_SCOPE_RESTRICTION_RESPONSE
        current_turn = [
            {"role": "user", "content": req.message},
            {"role": "assistant", "content": reply},
        ]
        await database.add_messages(session_id, current_turn)
        await database.save_context(session_id, context)
        return ChatResponse(reply=reply, session_id=session_id)

    relevant_history = get_relevant_history(req.message, history)
    if not relevant_history and not (personal_context and contains_question(req.message)):
        context_message = ""

    try:

        # Call LLM provider
        reply, current_turn = await generate_response(
            message=req.message,
            history=relevant_history,
            context_message=context_message,
            personal_context=personal_context,
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
    personal_context = await analyze_personal_context(message)
    context = update_context(context, message, personal_context)
    context_message = build_context_message(context)

    personal_recall_reply = get_personal_context_reply(message, context)
    if personal_recall_reply:
        await save_direct_reply(session_id, message, personal_recall_reply)
        await database.save_context(session_id, context)
        yield f"data: {json.dumps({'type': 'chunk', 'text': personal_recall_reply})}\n\n"
        yield f"data: {json.dumps({'type': 'done', 'session_id': session_id})}\n\n"
        return

    closing_response = get_closing_response(message)
    if closing_response:
        current_turn = [
            {"role": "user", "content": message},
            {"role": "assistant", "content": closing_response},
        ]
        await database.add_messages(session_id, current_turn)
        await database.save_context(session_id, context)
        yield f"data: {json.dumps({'type': 'chunk', 'text': closing_response})}\n\n"
        yield f"data: {json.dumps({'type': 'done', 'session_id': session_id})}\n\n"
        return

    acknowledgement_response = get_acknowledgement_response(message)
    if acknowledgement_response:
        await save_direct_reply(session_id, message, acknowledgement_response)
        await database.save_context(session_id, context)
        yield f"data: {json.dumps({'type': 'chunk', 'text': acknowledgement_response})}\n\n"
        yield f"data: {json.dumps({'type': 'done', 'session_id': session_id})}\n\n"
        return

    if (
        personal_context
        and personal_context["intent"] == "SELF_INTRODUCTION"
        and not contains_question(message)
    ):
        name = personal_context.get("name")
        reply_text = (
            f"Hello {name}! How can I assist you today?"
            if name
            else "Nice to meet you! How can I assist you today?"
        )
        current_turn = [
            {"role": "user", "content": message},
            {"role": "assistant", "content": reply_text},
        ]
        await database.add_messages(session_id, current_turn)
        await database.save_context(session_id, context)
        yield f"data: {json.dumps({'type': 'chunk', 'text': reply_text})}\n\n"
        yield f"data: {json.dumps({'type': 'done', 'session_id': session_id})}\n\n"
        return

    if not is_netkathir_related(
        message,
        history=history,
        context_message=context_message,
        personal_context=personal_context,
    ):
        reply_text = NETKATHIR_SCOPE_RESTRICTION_RESPONSE
        current_turn = [
            {"role": "user", "content": message},
            {"role": "assistant", "content": reply_text},
        ]
        await database.add_messages(session_id, current_turn)
        await database.save_context(session_id, context)
        yield f"data: {json.dumps({'type': 'chunk', 'text': reply_text})}\n\n"
        yield f"data: {json.dumps({'type': 'done', 'session_id': session_id})}\n\n"
        return

    relevant_history = get_relevant_history(message, history)
    if not relevant_history and not (personal_context and contains_question(message)):
        context_message = ""

    messages = await _build_messages(message, relevant_history, context_message)
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
                max_tokens=MAX_OUTPUT_TOKENS,
                temperature=0.2,
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