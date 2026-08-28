# AI Voice Calling Agent

Customer-support agent that works over **web chat** and **phone calls** through the same core Agent. The Agent never knows which channel it's talking through — Exotel/STT/TTS is just a communication layer in front of it.

```
Web:   React → FastAPI → Agent → LLM → React
Phone: Exotel → FastAPI (WebSocket) → STT → Agent/LLM → TTS → Exotel
```

## Tech Stack

- **Frontend:** React + TypeScript
- **Backend:** Python + FastAPI
- **Database:** SQLite (POC) → PostgreSQL (production)
- **Cache:** Redis (optional, add later)
- **Telephony:** Exotel + AgentStream
- **AI:** Streaming STT / LLM / TTS provider APIs, each behind a swappable interface
- **Deploy:** Docker

## Project Structure

```
voice-agent/
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   ├── api/            # chat.py, voice.py
│   │   ├── agent/          # agent.py, context.py, prompts.py, tools.py
│   │   ├── providers/      # stt.py, llm.py, tts.py
│   │   ├── voice/          # session.py, audio.py
│   │   ├── database/       # models.py, database.py
│   │   └── config.py
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   └── src/  (components/, pages/, services/, App.tsx)
├── docker-compose.yml
└── .env
```

Don't scaffold all of this on day one — build it up stage by stage below.

## Setup

```bash
# backend
cd backend
python -m venv venv
venv\Scripts\activate        # Windows
pip install -r requirements.txt
uvicorn app.main:app --reload

# frontend
cd frontend
npm install
npm run dev
```

`backend/.env` (never commit this — add to `.gitignore`):
```
LLM_API_KEY=
DATABASE_URL=postgresql://postgres:<password>@localhost:5432/voice-agent
STT_API_KEY=
TTS_API_KEY=
EXOTEL_API_KEY=
EXOTEL_API_TOKEN=
DATABASE_URL=
REDIS_URL=
```

Create the PostgreSQL database before starting the backend:

```sql
CREATE DATABASE "voice-agent";
```

The backend creates the `conversations` and `messages` tables automatically
when it starts. Set `DATABASE_URL` in `backend/.env` using your PostgreSQL
credentials.

## Build Order

- [ ] **1. Basic chatbot** — FastAPI + LLM API + React, `POST /api/chat` working end to end
- [ ] **2. Context** — system prompt, agent instructions, conversation history
- [ ] **3. Tools** — 1–2 functions (`get_customer()`, `get_appointment()`); get function-calling solid before touching voice
- [ ] **4. Database** — customers, conversations, messages, business data
- [ ] **5. STT alone** — test `audio → text`, no Exotel yet
- [ ] **6. TTS alone** — test `text → audio`
- [ ] **7. Local voice loop** — browser mic → FastAPI → STT → Agent → TTS → browser audio (full voice agent, no telephony)
- [ ] **8. Exotel integration** — configure AgentStream, `/ws/exotel` WebSocket endpoint, wire audio both ways
- [ ] **9. Real phone testing** — normal conversation, interruptions, silence, long responses, tool calls, errors, call termination, concurrent calls
- [ ] **10. Optimize** — measure STT/LLM/TTS/end-to-end latency, cost per call/min, CPU/RAM, concurrent-call limits

**Don't jump to Exotel before Stage 7 works.**

## Core Principles

1. **Agent ↔ communication layer stay separate.** Agent handles context/reasoning/tools; the layer handles Exotel/WebSockets/STT/TTS.
2. **Providers are interfaces**, not hardcoded calls — `LLMProvider`, `STTProvider`, `TTSProvider` — so any of the three can be swapped (e.g. cloud → local) without touching the Agent.
3. **Stream everything.** Don't wait for full STT → full LLM → full TTS before responding. Buffer LLM output into phrases, start TTS on the first phrase, stream audio to the caller as it's generated.
4. **One session per call/conversation** (`call_id`, `customer_id`, connections, state) so concurrent calls never share state.
5. **LLM never touches the DB directly** — only via declared tools, executed by your backend.
6. **No giant sequential function.** Run Exotel-reader / STT / Agent-LLM / TTS-writer as concurrent pipelines via `asyncio.gather()`, connected by queues.
7. **Handle interruptions (barge-in):** caller speaks → STT detects it → stop current TTS playback → process new input.

## Database Tables (starting point)

```
customers(id, name, contact, ...)
appointments(id, customer_id, date, time, status)
conversations(id, customer_id, created_at)
messages(id, conversation_id, role, content, timestamp)
calls(id, exotel_call_id, customer_id, started_at, ended_at, duration, status)
agent_configs(id, name, system_prompt)
```

## Error Handling — cover at minimum

STT/LLM/TTS failure · Exotel disconnect · WebSocket disconnect · invalid audio · LLM timeout · tool failure · customer silence · customer interruption · call termination · multiple simultaneous calls

Always fall back to a message like *"I'm having trouble accessing that — let me transfer you."* rather than failing silently.

## Logging

Per call, log: `CALL_STARTED → STT_CONNECTED → TRANSCRIPT_RECEIVED → LLM_REQUEST → TOOL_CALLED → LLM_RESPONSE → TTS_REQUEST → AUDIO_SENT → CALL_ENDED`, with call ID, session ID, timestamp, duration, provider, error info. Don't log sensitive customer data.