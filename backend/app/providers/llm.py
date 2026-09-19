import inspect
import json
import logging
import os
import re

from openai import AsyncOpenAI


from app.agent.prompts import (
    AGENT_INSTRUCTIONS,
    NETKATHIR_SCOPE_RESTRICTION_RESPONSE,
    SYSTEM_PROMPT,
)
from app.agent.tools import AVAILABLE_TOOLS, TOOL_SCHEMAS
from app.config import settings


logger = logging.getLogger(__name__)

# Single source of truth for the maximum response length. Keep this large enough
# for structured Netkathir answers without allowing unnecessarily verbose output.
MAX_OUTPUT_TOKENS = 1200

client = AsyncOpenAI(
    api_key=settings.llm_api_key,
    base_url=settings.llm_base_url
)


NETKATHIR_EXPLICIT_TERMS = (
    "netkathir",
    "garage bill",
    "hrms",
)

NETKATHIR_CONTEXT_TERMS = (
    "services",
    "service",
    "product",
    "products",
    "project",
    "projects",
    "team",
    "founder",
    "leadership",
    "location",
    "office",
    "contact",
    "working hours",
    "internship",
    "internships",
    "career",
    "careers",
    "appointment",
    "appointments",
    "consultation",
    "consultations",
    "website",
    "technology",
    "technologies",
    "platform",
    "hr",
)

GREETINGS = (
    "hi",
    "hello",
    "hey",
    "good morning",
    "good evening",
    "welcome",
    "greetings",
)


def _normalize_scope_text(value: str) -> str:
    """Normalize text for safe deterministic scope checks."""
    return re.sub(r"[^a-z0-9\s]", " ", (value or "").lower())


def _history_text(history: list | None) -> str:
    """Flatten prior chat messages for contextual follow-up detection."""
    if not history:
        return ""

    parts: list[str] = []
    for message in history:
        if isinstance(message, dict):
            content = message.get("content") or ""
        else:
            content = str(message)
        if content:
            parts.append(content)
    return " ".join(parts)


def get_relevant_history(message: str, history: list | None = None, max_messages: int = 4) -> list:
    """Only include earlier conversation when the user explicitly refers back to it."""
    if not history:
        return []

    message_text = _normalize_scope_text(message)
    if not message_text:
        return []

    follow_up_patterns = (
        r"\b(?:this|that|it|they|them|those|these|earlier|before|previous|mentioned|you mentioned|you said|that one|this one|itself|what about|what was|who was|where was|tell me more about it|give me that|give me this|the above|the previous one|the first one|his|her|their|the email|the link|the website|the address|the phone|the phone number|the contact|what was it|what was his|what was her|what was their)\b"
    )
    if not re.search(follow_up_patterns, message_text):
        return []

    relevant: list[dict] = []
    for item in reversed(history):
        if not isinstance(item, dict):
            continue
        content = (item.get("content") or "").strip()
        if not content:
            continue
        relevant.append({"role": item.get("role", "user"), "content": content})
        if len(relevant) >= max_messages:
            break

    return list(reversed(relevant))


def is_netkathir_related(
    message: str,
    history: list | None = None,
    context_message: str = "",
) -> bool:
    """Return True when the request falls within the Netkathir scope."""
    if not message and not history and not context_message:
        return False

    message_text = _normalize_scope_text(message)
    context_text = _normalize_scope_text(context_message)

    if any(term in message_text for term in NETKATHIR_EXPLICIT_TERMS):
        return True
    if any(term in message_text for term in NETKATHIR_CONTEXT_TERMS):
        return True
    if any(greeting in message_text for greeting in GREETINGS):
        return True

    if history:
        history_text = _normalize_scope_text(_history_text(get_relevant_history(message, history)))
    else:
        history_text = ""

    if re.search(r"\b(?:this|that|it|they|them|those|these|earlier|before|previous|mentioned|you mentioned|you said|that one|this one|itself|what about|what was|who was|where was|tell me more about it|give me that|give me this|the above|the previous one|the first one|his|her|their|the email|the link|the website|the address|the phone|the phone number|the contact|what was it|what was his|what was her|what was their)\b", message_text) and (
        any(term in history_text for term in NETKATHIR_EXPLICIT_TERMS)
        or any(term in history_text for term in NETKATHIR_CONTEXT_TERMS)
        or any(term in context_text for term in NETKATHIR_EXPLICIT_TERMS)
        or any(term in context_text for term in NETKATHIR_CONTEXT_TERMS)
    ):
        return True

    return False


def get_scope_restriction_response() -> str:
    """Return the single source of truth for off-topic responses."""
    return NETKATHIR_SCOPE_RESTRICTION_RESPONSE


def clean_response(text: str) -> str:
    """Normalize formatting without stripping Markdown structure."""

    if not text:
        return ""

    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = re.sub(r"\n{3,}", "\n\n", text)
    text = re.sub(r"[ \t]+\n", "\n", text)

    return text.strip()


async def generate_response(
    message: str,
    history: list,
    context_message: str = "",
):
    """
    Generate a response from the LLM.

    Returns:
        reply: Clean assistant response
        current_turn: Messages generated during the current turn
    """

    relevant_history = get_relevant_history(message, history)

    messages = [
        {
            "role": "system",
            "content": (
                f"{SYSTEM_PROMPT}\n\n"
                f"{AGENT_INSTRUCTIONS}\n\n"
                
            ),
        }
    ]

    if context_message and relevant_history:
        messages.append(
            {
                "role": "system",
                "content": context_message,
            }
        )

    # Add only genuinely needed conversation context.
    messages.extend(relevant_history)

    # Add current user message
    messages.append(
        {
            "role": "user",
            "content": message,
        }
    )

    # Store only the current interaction
    current_turn = [messages[-1]]
    initial_message_count = len(messages)

    reply = ""

    if not is_netkathir_related(message, history=history, context_message=context_message):
        return get_scope_restriction_response(), [
            {"role": "user", "content": message},
            {"role": "assistant", "content": get_scope_restriction_response()},
        ]

    try:
        # Allow up to 3 tool-calling rounds
        for round_number in range(3):

            request = {
                "model": settings.llm_model,
                "messages": messages,
                "max_tokens": MAX_OUTPUT_TOKENS,
                "temperature": 0.2,
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
                            "information is unavailable and do not call "
                            "any tools.\n"
                            + "\n".join(tool_results)
                        ),
                    }
                ]

            completion = await client.chat.completions.create(**request)

            assistant_message = completion.choices[0].message

            tool_calls = assistant_message.tool_calls or []

            assistant_data = assistant_message.model_dump(
                exclude_none=True
            )

            messages.append(assistant_data)
            current_turn.append(assistant_data)

            # If there are no tool calls, we have the final answer
            if not tool_calls:
                reply = assistant_message.content or ""
                break

            # Execute requested tools
            for tool_call in tool_calls:

                tool_name = tool_call.function.name

                if os.getenv("DEBUG", "").lower() == "true":
                    print(
                        f"LLM tool call: "
                        f"{tool_name}("
                        f"{tool_call.function.arguments or '{}'}"
                        f")",
                        flush=True,
                    )

                tool = AVAILABLE_TOOLS.get(tool_name)

                if tool is None:
                    raise ValueError(
                        f"Unknown tool requested: {tool_name}"
                    )

                try:

                    arguments = json.loads(
                        tool_call.function.arguments or "{}"
                    )

                    result = tool(**arguments)

                    if inspect.isawaitable(result):
                        result = await result

                except (
                    TypeError,
                    ValueError,
                    json.JSONDecodeError,
                ) as exc:

                    result = {
                        "error": (
                            f"Tool could not be executed: {exc}"
                        )
                    }

                tool_message = {
                    "role": "tool",
                    "tool_call_id": tool_call.id,
                    "name": tool_name,
                    "content": json.dumps(result),
                }

                messages.append(tool_message)
                current_turn.append(tool_message)

    except Exception:
        logger.exception("LLM request failed")
        raise

    reply = clean_response(reply)

    return reply, current_turn