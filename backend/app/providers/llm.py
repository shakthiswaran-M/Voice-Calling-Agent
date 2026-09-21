import inspect
import json
import logging
import os
import re

from openai import AsyncOpenAI


from app.agent.prompts import (
    AGENT_INSTRUCTIONS,
    CLOSING_MESSAGE_RESPONSE,
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
    "company",
    "overview",
    "headquarters",
    "industry",
    "industries",
    "sector",
    "sectors",
    "mission",
    "vision",
    "employee",
    "employees",
    "countries",
    "serve",
    "serves",
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
    "offices",
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

CLOSING_MESSAGE_PATTERNS = (
    r"\b(?:thank you|thanks|thx)\b",
    r"\b(?:i appreciate|appreciate)\b",
    r"\b(?:you(?:re| re| are) helpful|you helped me)\b",
    r"\b(?:that is|that's|that was) all\b",
    r"\b(?:no more questions?|nothing else)\b",
    r"\b(?:goodbye|good bye|bye|see you|talk to you later)\b",
    r"\b(?:have a (?:good|great)|good) (?:day|evening|night)\b",
)

CLOSING_QUESTION_PATTERN = (
    r"\b(?:what|who|where|when|why|how|which|can|could|would|will|"
    r"do|does|did|is|are|tell|explain|provide|give|show)\b"
)

ACKNOWLEDGEMENT_PHRASES = frozenset(
    {
        "good",
        "great",
        "nice",
        "okay",
        "ok",
        "alright",
        "fine",
        "perfect",
        "sounds good",
        "that s good",
        "that s great",
        "thats good",
        "thats great",
        "cool",
        "got it",
        "understood",
        "sure",
        "yes",
        "yeah",
        "yep",
        "correct",
        "exactly",
        "thats right",
    }
)

ACKNOWLEDGEMENT_QUESTION_PATTERNS = (
    r"\b(?:is|was)\s+that\s+right\b",
    r"\bdoes\s+that\s+(?:sound|make)\s+(?:right|sense)\b",
    r"\b(?:right|makes\s+sense)\s*\??$",
)

PERSONAL_CONTEXT_CANDIDATE_PATTERN = re.compile(
    r"(?:\bmy\s+name\s+is\b|\bcall\s+me\b|\bthis\s+is\b|\bi['’]?m\b|\bi\s+am\b|\b\w+\s+here\b)",
    re.IGNORECASE,
)

INTERNAL_QUERY_PATTERN = re.compile(
    r"\b(?:database\s+schema|database|postgres(?:ql)?|tables?|columns?|"
    r"source\s+code|backend|frontend|internal\s+(?:api|architecture|implementation|details)|"
    r"api\s+keys?|environment\s+variables?|infrastructure|tech\s+stack|"
    r"llm\s+configuration|model\s+configuration|"
    r"how\s+(?:(?:this|the)\s+chatbot\s+is\s+implemented|is\s+(?:this|the)\s+chatbot\s+implemented|"
    r"does\s+(?:this|the)\s+chatbot\s+work)|messages\s+table)\b",
    re.IGNORECASE,
)

PERSONAL_CONTEXT_ANALYSIS_PROMPT = """Analyze the user's message for a self-introduction or personal context.

Return JSON only with this exact shape:
{"intent":"SELF_INTRODUCTION" or "PERSONAL_CONTEXT" or "NONE","name":null,"role":null,"team":null,"affiliation":null}

Rules:
- Use SELF_INTRODUCTION when the user introduces themselves, even if the name and role appear in an unusual order.
- Use PERSONAL_CONTEXT when the user explicitly provides personal details but is not primarily introducing themselves.
- Use NONE for questions, requests, or statements that do not explicitly provide personal information.
- Extract only information explicitly stated by the user. Never infer or guess a name, role, team, or affiliation.
- A role may be a multi-word title such as "Java developer". Preserve the user's wording, with normal capitalization.
- A team, department, company, or organizational affiliation belongs in team or affiliation only when explicitly stated.
- Return null for every field that is not explicitly provided.
"""


def _normalize_scope_text(value: str) -> str:
    """Normalize text for safe deterministic scope checks."""
    return re.sub(r"[^a-z0-9\s]", " ", (value or "").lower())


def _contains_scope_term(text: str, terms: tuple[str, ...]) -> bool:
    """Match scope terms as words instead of accidental substrings."""
    return any(
        re.search(rf"\b{re.escape(term)}\b", text)
        for term in terms
    )


def is_personal_context_candidate(message: str) -> bool:
    """Identify messages worth sending to the LLM personal-context classifier."""
    text = message or ""
    return bool(
        PERSONAL_CONTEXT_CANDIDATE_PATTERN.search(text)
        or re.search(
            r"\b(?:from|work(?:s|ing)?\s+as|team|department|role|title)\b",
            text,
            re.IGNORECASE,
        )
    )


def contains_question(message: str) -> bool:
    """Keep combined introductions and questions on the normal answer path."""
    return bool(
        "?" in (message or "")
        or re.search(
            r"\b(?:what|who|where|when|why|how|can|could|would|does|do)\b",
            message or "",
            re.IGNORECASE,
        )
    )


def is_internal_query(message: str) -> bool:
    """Block requests for private implementation details before context lookup."""
    return bool(INTERNAL_QUERY_PATTERN.search(message or ""))


async def analyze_personal_context(message: str) -> dict | None:
    """Classify and extract explicitly stated personal details when indicated."""
    if not is_personal_context_candidate(message):
        return None

    try:
        completion = await client.chat.completions.create(
            model=settings.llm_model,
            messages=[
                {"role": "system", "content": PERSONAL_CONTEXT_ANALYSIS_PROMPT},
                {"role": "user", "content": message},
            ],
            max_tokens=180,
            temperature=0,
            response_format={"type": "json_object"},
        )
        content = completion.choices[0].message.content or "{}"
        extracted = json.loads(content)
    except Exception:
        logger.warning("Personal-context analysis failed", exc_info=True)
        return None

    intent = extracted.get("intent")
    if intent not in {"SELF_INTRODUCTION", "PERSONAL_CONTEXT"}:
        return None

    return {
        "intent": intent,
        "name": extracted.get("name") or None,
        "role": extracted.get("role") or None,
        "team": extracted.get("team") or None,
        "affiliation": extracted.get("affiliation") or None,
    }


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


def get_closing_response(message: str) -> str | None:
    """Return a deterministic reply for standalone closing messages."""
    normalized = _normalize_scope_text(message)
    if not normalized or re.search(CLOSING_QUESTION_PATTERN, normalized):
        return None

    if any(re.search(pattern, normalized) for pattern in CLOSING_MESSAGE_PATTERNS):
        return CLOSING_MESSAGE_RESPONSE

    return None


def get_acknowledgement_response(message: str) -> str | None:
    """Return a brief response for standalone conversational confirmations."""
    normalized = _normalize_scope_text(message)
    normalized = re.sub(r"\s+", " ", normalized).strip()
    if not normalized:
        return None

    if normalized in ACKNOWLEDGEMENT_PHRASES or any(
        re.search(pattern, normalized)
        for pattern in ACKNOWLEDGEMENT_QUESTION_PATTERNS
    ):
        return "Glad to hear that! How can I help you today?"

    return None


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
    personal_context: dict | None = None,
) -> bool:
    """Return True when the request falls within the Netkathir scope."""
    if not message and not history and not context_message:
        return False

    if is_internal_query(message):
        return False

    if personal_context and personal_context.get("intent") in {
        "SELF_INTRODUCTION",
        "PERSONAL_CONTEXT",
    }:
        return True

    message_text = _normalize_scope_text(message)
    context_text = _normalize_scope_text(context_message)

    if _contains_scope_term(message_text, NETKATHIR_EXPLICIT_TERMS):
        return True
    if _contains_scope_term(message_text, NETKATHIR_CONTEXT_TERMS):
        return True
    if _contains_scope_term(message_text, GREETINGS):
        return True

    if history:
        history_text = _normalize_scope_text(_history_text(get_relevant_history(message, history)))
    else:
        history_text = ""

    if re.search(r"\b(?:this|that|it|they|them|those|these|earlier|before|previous|mentioned|you mentioned|you said|that one|this one|itself|what about|what was|who was|where was|tell me more about it|give me that|give me this|the above|the previous one|the first one|his|her|their|the email|the link|the website|the address|the phone|the phone number|the contact|what was it|what was his|what was her|what was their)\b", message_text) and (
        _contains_scope_term(history_text, NETKATHIR_EXPLICIT_TERMS)
        or _contains_scope_term(history_text, NETKATHIR_CONTEXT_TERMS)
        or _contains_scope_term(context_text, NETKATHIR_EXPLICIT_TERMS)
        or _contains_scope_term(context_text, NETKATHIR_CONTEXT_TERMS)
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
    personal_context: dict | None = None,
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

    closing_response = get_closing_response(message)
    if closing_response:
        return closing_response, current_turn + [
            {"role": "assistant", "content": closing_response}
        ]

    if not is_netkathir_related(
        message,
        history=history,
        context_message=context_message,
        personal_context=personal_context,
    ):
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