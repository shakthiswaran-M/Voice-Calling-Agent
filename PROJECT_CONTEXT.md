# Project Context: Voice-Calling-Agent

> Source-of-truth document generated from the repository source, configuration, dependency manifests, and README. It describes the code as found, not an intended future architecture. No secrets or credential values are included.
>
> Evidence labels used in this document:
> - **Confirmed:** directly present in source/configuration.
> - **Inferred:** a reasonable interpretation of implemented behavior, but not explicitly stated.
> - **Unknown:** not determinable from the repository.

## 1. Project Overview

### Project name

- **Confirmed:** The repository is named `Voice-Calling-Agent`.
- **Confirmed:** The application branding in the frontend and backend is Netkathir / Netkathir Technologies. The frontend document title is `NetKathir Bot - Premium Assistant`; the backend FastAPI title is `AI Voice Calling Agent`.

### Purpose

- **Confirmed:** This is a customer-support conversational agent intended to work through web chat and voice interactions.
- **Confirmed:** The web application provides a React chat workspace with persistent local threads, text chat, browser microphone recording, speech-to-speech mode, text-to-speech playback, message search, pinning, sharing, printing, and PDF export.
- **Confirmed:** The backend exposes chat, streaming chat, speech-to-text, text-to-speech, outbound Exotel call initiation, health, website scraping, conversation context, and database-backed agent tools.
- **Inferred:** The central design goal is to let the LLM-driven support behavior be reused across text and voice communication layers.

### Main problem solved

- **Confirmed:** The application answers customer questions using conversation history, stored conversation context, configured business instructions, and scraped Netkathir website content.
- **Confirmed:** It converts recorded browser audio to text, sends the text through the same chat agent, and speaks the response using ElevenLabs or browser speech synthesis.
- **Inferred:** It is intended to reduce manual customer-support effort and provide a single company-information interface across web and telephony channels.

### Main users and use cases

- **Confirmed:** The UI is designed for a customer or visitor who wants to ask Netkathir questions by typing or speaking.
- **Confirmed:** Tool definitions support customer lookup, appointment lookup, consultation scheduling, consultation availability, human escalation, case-study lookup, FAQ lookup, and website-content search.
- **Confirmed:** The Exotel route accepts a customer phone number and initiates an outbound call.
- **Unknown:** There is no authentication, user-account, role, or operator dashboard implementation in the repository, so the exact production user roles are unknown.

### Current project status

- **Confirmed:** The chat, streaming chat, browser voice, STT, TTS, database schema bootstrap, website scraper, and outbound Exotel request paths are implemented in source.
- **Confirmed:** There are no test files, migration files, Dockerfiles, Docker Compose files, CI files, or deployment manifests in the repository tree found.
- **Confirmed:** The README still describes a staged build plan and an intended WebSocket/AgentStream phone architecture, but the current source contains no WebSocket route.
- **Inferred:** This is a working proof-of-concept / early application rather than a production-complete voice platform. Some tools and documented tables are ahead of the current schema.

## 2. Technology Stack

| Area | Technology | Evidence and use |
|---|---|---|
| Frontend framework | React 18.3.1 | `frontend/package.json`; UI is composed from React function components and hooks. |
| Frontend language | TypeScript 5.9.3 | `frontend/package.json`, `.tsx` and `.ts` source, strict TypeScript configuration. |
| Backend framework | FastAPI 0.141.1 | `backend/requirements.txt`; routes are declared with `APIRouter` and `FastAPI`. |
| Backend language | Python | Backend source files use Python async functions, Pydantic models, and FastAPI. |
| Database | PostgreSQL via `asyncpg` 0.31.0 | `backend/app/database.py` creates an async connection pool and PostgreSQL tables/queries. |
| Database configuration | `pydantic-settings` and `.env` | `backend/app/config.py` loads settings from `backend/.env`. |
| LLM client | OpenAI Python client 3.3.1 | `backend/app/providers/llm.py` uses `AsyncOpenAI`; `llm_base_url` makes the target endpoint configurable. |
| LLM behavior | Configured OpenAI-compatible chat-completions API | `generate_response` and streaming code use `client.chat.completions.create`, tool schemas, and a configured model. The exact provider is **Unknown** because the base URL is environment-configured. |
| STT | Sarvam-compatible HTTP API | `backend/app/providers/stt.py` sends multipart WAV audio with `api-subscription-key`, model, and language fields to `settings.stt_url`. README identifies Sarvam and defaults the model to `saaras:v3`. |
| TTS | ElevenLabs 2.65.0 | `backend/app/providers/tts.py` creates an ElevenLabs client and streams MP3 output. |
| Browser TTS | Web Speech API | `frontend/src/lib/browserTts.ts`, `speechSynthesisService.ts`, and speech-to-speech mode provide fallback/local speech. |
| Telephony | Exotel HTTP API | `backend/app/providers/exotel.py` posts to Exotel's `Calls/connect.json` endpoint. |
| Website scraping | `httpx` and BeautifulSoup 4.12.3 | `backend/app/website_scraper.py` fetches configured Netkathir pages, strips scripts/styles, and stores clean text. |
| Scheduling | APScheduler 3.11.3 | `backend/app/main.py` runs the scraper at startup and schedules it every 30 days. |
| Frontend state | Zustand 5.0.15 with `persist` middleware | `frontend/src/store/useChatStore.ts` stores threads and UI state in browser storage under `netkathir-chat-v2`. |
| Styling | Tailwind CSS 3.4.19, PostCSS, Autoprefixer, custom CSS | `tailwind.config.js`, `postcss.config.js`, and `src/index.css`. |
| Icons | Lucide React 0.454.0 | Components import icons from `lucide-react`. |
| Markdown rendering | `react-markdown` and `remark-gfm` | Bot messages support Markdown/GFM rendering in `MessageBubble.tsx`. |
| PDF export | jsPDF 4.2.1 | `frontend/src/lib/exportPdf.ts` generates paginated A4 PDFs without DOM capture. |
| Class utilities | `clsx` and `tailwind-merge` | `frontend/src/lib/utils.ts` defines `cn`. |
| Build/dev tool | Vite 5.4.21 | `frontend/vite.config.ts` and scripts in `frontend/package.json`. |
| Backend server | Uvicorn 0.52.4 | README startup command is `uvicorn app.main:app --reload`. |
| Authentication | None found | No login, token validation, auth middleware, or authenticated API contract is implemented. |
| Cache | None implemented | README mentions optional Redis as future work; no Redis dependency or source integration exists. |
| Deployment | Unknown | README says Docker, but no Dockerfile or Compose file was found. |

## 3. Complete Project Structure

### Repository root

- `README.md`: setup notes, intended architecture, staged build plan, principles, intended database starting point, and error/logging guidance. Some sections describe planned or older architecture and must be checked against source.
- `package.json`: root package manifest containing only a `requirements` npm dependency. It does not define application scripts.
- `package-lock.json`: root npm lockfile associated with the root manifest. Its role in running the frontend/backend is not evident from source.
- `.gitignore`: ignores `.env`, Python virtual environments/cache, Node modules, logs, and SQLite files.
- `PROJECT_CONTEXT.md`: this generated project context document.
- `.git/`: repository metadata; not application runtime code.

### Backend

- `backend/requirements.txt`: pinned Python runtime dependencies.
- `backend/app/config.py`: defines `Settings`, loads `backend/.env`, and exposes the module-level `settings` object used throughout the backend.
- `backend/app/main.py`: creates the FastAPI application, installs permissive CORS based on `CORS_ORIGINS`, includes chat and voice routers, opens/closes the database pool, starts website scraping, schedules repeated scraping, and exposes `/api/health`.
- `backend/app/database.py`: owns the PostgreSQL pool, startup schema creation, generic query helpers, conversations, messages, JSON context, scraped website content, and keyword search.
- `backend/app/website_scraper.py`: fetches seven configured site paths, cleans HTML using BeautifulSoup, hashes content, and upserts it into `website_content`.
- `backend/app/api/chat.py`: defines normal and SSE streaming chat endpoints, request/response models, context extraction/formatting, LLM message construction, tool-call rounds, and persistence of messages/context.
- `backend/app/api/voice.py`: defines WAV upload STT testing, streaming ElevenLabs TTS testing, and outbound Exotel call initiation routes.
- `backend/app/agent/prompts.py`: contains the system prompt and agent instructions. These require plain spoken responses, prohibit invented company information, and direct company-information questions to website search.
- `backend/app/agent/tools.py`: implements and describes LLM-callable database/business tools. It includes `TOOL_SCHEMAS` and the `AVAILABLE_TOOLS` dispatch map.
- `backend/app/providers/llm.py`: configures the OpenAI-compatible async client, strips Markdown from final responses, executes up to three tool-calling rounds, and returns the cleaned answer plus current-turn messages.
- `backend/app/providers/stt.py`: posts WAV audio to the configured STT provider and returns its `transcript` field.
- `backend/app/providers/tts.py`: wraps the synchronous ElevenLabs SDK in an iterator that yields MP3 chunks and rejects empty audio.
- `backend/app/providers/exotel.py`: validates Exotel settings and sends an authenticated outbound call request.
- There is no `backend/app/agent/agent.py`, `context.py`, `voice/`, `models.py`, or migration directory despite those paths appearing in the older README structure example.

### Frontend

- `frontend/package.json`: frontend dependencies and scripts: `dev`, `build`, `preview`, and `lint`.
- `frontend/.env.example`: documents `VITE_API_URL`.
- `frontend/index.html`: Vite HTML entry point, favicon, viewport/mobile metadata, Google Fonts links, title, and `#root` mount.
- `frontend/vite.config.ts`: configures React, `@` alias, and a custom jsPDF transform that neutralizes jsPDF's optional unresolved `html2canvas` dynamic import.
- `frontend/tsconfig.json`: strict no-emit TypeScript configuration for `src`, with unused locals/parameters treated as errors.
- `frontend/tsconfig.node.json`: composite TypeScript configuration for `vite.config.ts`.
- `frontend/tailwind.config.js`: Tailwind content paths, class-based dark mode, custom palettes, fonts, shadows, animations, and gradients.
- `frontend/postcss.config.js`: Tailwind and Autoprefixer PostCSS plugins.
- `frontend/src/main.tsx`: React DOM entry point; mounts `App` under `React.StrictMode` and imports global CSS.
- `frontend/src/App.tsx`: top-level shell, theme class synchronization, global keyboard shortcuts, `ThreadNav`, and `ChatArea`.
- `frontend/src/index.css`: Tailwind directives plus global reset, colors, animations, voice orb/waveform styling, sidebar layout, safe-area support, and print styles.
- `frontend/src/types/index.ts`: TypeScript definitions for `Message`, `Thread`, scroll positions, and Zustand state/actions.
- `frontend/src/store/useChatStore.ts`: persisted Zustand store for all threads, messages, UI state, pin/reply/unread state, session IDs, and scroll positions.
- `frontend/src/hooks/useAutoScroll.ts`: smart scroll-to-tail behavior, visible-message tracking, scroll-position persistence/restoration, and IntersectionObserver handling.
- `frontend/src/components/chat/ChatArea.tsx`: main conversation view, normal text send, streaming chat integration, browser microphone recording/STT flow, message TTS playback, search, pinned-message banner, context menu, sharing, print shortcut, and speech-to-speech modal entry.
- `frontend/src/components/chat/ChatInput.tsx`: text area, Enter/Shift+Enter behavior, send button, microphone toggle, speech-to-speech button, and reply preview.
- `frontend/src/components/chat/MessageBubble.tsx`: user/bot message rendering, React Markdown/GFM, search highlighting, copy, TTS controls, share, pin indicator, timestamp, and context-menu integration.
- `frontend/src/components/chat/ThreadNav.tsx`: responsive sidebar/collapsed bar, thread creation/selection/search, rename/delete, pinning, sharing, PDF export, theme toggle, and keyboard-accessible controls.
- `frontend/src/components/chat/MessageSearch.tsx`: in-thread search, match count, next/previous navigation, and keyboard handling.
- `frontend/src/components/chat/ContextMenu.tsx`: reusable right-click menu with copy/reply/pin/forward actions supplied by `ChatArea`.
- `frontend/src/components/chat/ShareModal.tsx`: share dialog with generated local `/share/:threadId` link, clipboard copy, and WhatsApp share URL. No frontend router or share-page implementation was found.
- `frontend/src/components/chat/SpeechToSpeechMode.tsx`: full-screen voice session with microphone capture, silence detection, browser interim recognition, Sarvam final STT, streamed LLM response, sentence-level ElevenLabs TTS, browser fallback, interruption/barge-in monitoring, and local response scrolling.
- `frontend/src/lib/api.ts`: API base URL, endpoint constants, normalized fetch error handling, normal chat, STT, TTS, and SSE stream clients.
- `frontend/src/lib/audioWav.ts`: decodes browser WebM audio, downmixes to mono, encodes 16-bit PCM WAV, and validates the WAV header.
- `frontend/src/lib/browserTts.ts`: small Web Speech API playback/cancel fallback.
- `frontend/src/lib/speechSynthesisService.ts`: richer browser voice-selection service with voice discovery, language/female/natural-voice heuristics, and pause/resume/cancel support.
- `frontend/src/lib/exportPdf.ts`: pure jsPDF A4 conversation export with Markdown-like block parsing, tables/code/quotes/lists, pagination, separators, and bubble layout.
- `frontend/src/lib/utils.ts`: Tailwind class merging, speech normalization for Netkathir name variants, timestamps, clipboard fallback, share URL generation, and timeline gap constant.
- `frontend/src/assets/netkathir-logo.png`: brand image used in the app and bot message headers.
- `frontend/public/bot-icon.svg`, `favicon.svg`, `icons.svg`: public browser/brand assets.
- `frontend/README.md`: frontend quick start and feature summary.

## 4. System Architecture

The implemented architecture is a browser SPA calling an asynchronous FastAPI service. The backend uses a PostgreSQL connection pool and an OpenAI-compatible LLM client, with STT, TTS, Exotel, and website scraping integrations behind provider/modules.

```text
Browser React SPA
  |-- Zustand persisted threads/UI
  |-- ChatArea / SpeechToSpeechMode
  |-- api.ts: HTTP POST and SSE
  v
FastAPI application
  |-- /api/chat and /api/chat/stream
  |     |-- conversation history/context from PostgreSQL
  |     |-- prompts + LLM tool schemas
  |     |-- OpenAI-compatible chat completions
  |     |-- tool calls back into database/provider helpers
  |     `-- message/context persistence
  |-- /api/stt-test -> configured STT HTTP API
  |-- /api/tts-test -> ElevenLabs MP3 iterator
  |-- /api/exotel/call -> Exotel outbound call API
  |-- startup scraper -> configured Netkathir website -> PostgreSQL
  `-- /api/health
```

- **Frontend to backend:** `frontend/src/lib/api.ts` uses `VITE_API_URL`, defaulting to `http://localhost:8000`. The frontend sends JSON, multipart WAV, or consumes `text/event-stream`.
- **Backend to database:** `database.py` uses `asyncpg` and parameterized PostgreSQL SQL. The pool is initialized during FastAPI startup and closed during shutdown.
- **Backend to LLM:** `providers/llm.py` uses an OpenAI-compatible client configured with `LLM_API_KEY`, `LLM_BASE_URL`, and `LLM_MODEL`.
- **Backend to STT:** `providers/stt.py` sends WAV bytes to `STT_URL` using `STT_API_KEY`; the frontend creates valid PCM WAV data before upload.
- **Backend to TTS:** `providers/tts.py` calls ElevenLabs and returns `audio/mpeg`; the frontend uses MediaSource streaming in normal message playback and buffers a response blob in speech-to-speech mode.
- **Backend to website:** `website_scraper.py` periodically fetches configured paths from `WEBSITE_BASE_URL` and saves the cleaned content. LLM website-search tools query this content.
- **Backend to Exotel:** `providers/exotel.py` sends an authenticated outbound call request. No current source connects an Exotel audio WebSocket to STT/LLM/TTS.
- **Authentication:** None is applied to the backend routes or external-facing frontend API calls.

## 5. Application Data Flow

### Text chat, non-streaming

1. The user enters text in `ChatInput` and submits with the button or Enter.
2. `ChatArea.handleSendMessage` chooses the active thread or creates one, updates a first-message title, optionally prepends a reply reference, and stores the user message locally in Zustand.
3. `frontend/src/lib/api.ts:sendChatMessage` sends `POST /api/chat` with `{ message, session_id }`.
4. `backend/app/api/chat.py:chat` creates a UUID if needed, ensures a `conversations` row, loads up to 30 recent messages and stored JSON context, and extracts simple facts such as a name from the current message.
5. `build_context_message` converts selected context fields into an LLM system message.
6. `providers/llm.py:generate_response` builds system instructions, context, history, and the current user message.
7. The configured LLM may return tool calls. Up to three rounds are executed through `AVAILABLE_TOOLS`; tool output is added as `role=tool` messages.
8. The assistant response is cleaned of Markdown formatting and returned with the current-turn message list.
9. The backend persists normal user/assistant messages and tool context, then returns `{ reply, session_id }`.
10. The frontend stores the returned `session_id` on the local thread and appends the bot reply.

### Streaming text chat

1. `ChatArea` adds the user message and an empty bot placeholder locally.
2. `sendChatMessageStream` sends `POST /api/chat/stream` with the same message/session contract.
3. `_stream_chat_generator` loads history/context, builds messages, and runs a non-streaming tool loop first.
4. If a final text was already generated, it emits it as one SSE `chunk`; otherwise it requests a final streamed completion with tool use disabled and emits each content delta.
5. SSE events are JSON after `data:` lines: `chunk`, `error`, and `done` with `session_id`.
6. The frontend appends each chunk into the placeholder message in Zustand and stores the final session ID.
7. The backend persists the current turn and context after successful generation.
8. On an exception, the backend emits an `error` event followed by `done`; the frontend raises `ApiError` and `ChatArea` adds its fallback bot message.

### One-shot browser voice input

1. `ChatInput` invokes `ChatArea.handleStartConversation`.
2. The browser requests microphone access and starts `MediaRecorder`.
3. Stopping recording builds an `audio/webm` blob and calls `webmBlobToWav`.
4. The utility decodes audio through `AudioContext`, downmixes it to mono, encodes 16-bit PCM WAV, and validates the header.
5. `transcribeAudio` uploads the WAV as `file=recording.wav` to `POST /api/stt-test`.
6. The backend forwards it to the configured STT provider and returns `{ transcript }`.
7. The frontend normalizes common speech-recognition variants of `Netkathir`, adds the transcript as a user message, and sends it through the non-streaming `/api/chat` path.
8. The backend performs the normal database/context/LLM/tool flow.
9. The frontend adds the bot response and invokes `ChatArea.playTts`.
10. TTS first requests `/api/tts-test`; normal message playback uses MediaSource chunked MP3 playback and falls back to browser speech if unsupported or failed.

### Speech-to-speech session

1. `ChatInput` opens `SpeechToSpeechMode`.
2. On open, the component speaks a welcome sentence through ElevenLabs, falling back to the browser Speech Synthesis API.
3. The user starts continuous microphone capture. An analyser detects speech followed by 1.2 seconds of silence; a 15-second no-speech limit stops a recording.
4. Browser `SpeechRecognition` may run in parallel for interim display and fallback text; Sarvam is normally authoritative for the final transcript.
5. The recorded WebM blob is sent directly to `transcribeAudio` in the current implementation. Unlike the one-shot `ChatArea` path, this component does not call `webmBlobToWav` before upload.
6. STT failure falls back to the accumulated browser recognition text when available.
7. The final text is added to the active/local thread and sent to `/api/chat/stream`.
8. Response chunks are displayed immediately and accumulated into sentence-sized TTS units.
9. Each sentence is sent to ElevenLabs and played as a buffered blob; browser speech synthesis is the fallback.
10. Optional barge-in monitoring detects microphone energy during playback and interrupts TTS/LLM work.
11. The full bot response is added to the local thread after the stream completes, and the backend session ID is associated with the thread.

### Website knowledge refresh and retrieval

1. FastAPI startup connects to PostgreSQL.
2. A background task runs `scrape_and_save`; an APScheduler job repeats it every 30 days.
3. The scraper fetches `/`, `/services`, `/products`, `/projects`, `/blogs`, `/about`, and `/contact` relative to `WEBSITE_BASE_URL`.
4. BeautifulSoup removes `script` and `style` elements and extracts plain text.
5. The URL, title, content, SHA-256 content hash, and timestamp are upserted into `website_content`.
6. When the LLM calls `search_website_content`, PostgreSQL searches title/content with keyword `ILIKE` conditions and prioritizes contact/about/services/products URLs.
7. Up to three results are returned to the LLM, with each content field truncated to 3000 characters.

### Outbound Exotel call

1. No frontend caller is present in `frontend/src/lib/api.ts` or the inspected components.
2. An external client may send `POST /api/exotel/call` with a customer number and optional caller ID.
3. The backend validates Exotel configuration and caller data.
4. `place_call` sends an authenticated form POST to Exotel `Calls/connect.json`.
5. The JSON response is returned under `{ success, message, data }`.
6. There is no implemented inbound call webhook, AgentStream WebSocket, audio forwarding, call session storage, or STT/LLM/TTS telephone loop.

## 6. Frontend Architecture

### Entry point and routing

- `main.tsx` mounts `App` under `React.StrictMode`.
- `App.tsx` renders `ThreadNav` and `ChatArea` in a flex shell.
- **Confirmed:** No React Router or other routing package is installed. The generated `/share/<threadId>` URL is a URL string only; no share route/page is implemented.

### Pages and primary views

- There are no separate page components.
- `ChatArea` is the main conversation view, with an empty-state logo/prompt and a populated thread view.
- `SpeechToSpeechMode` is a full-screen conditional voice view.
- `ThreadNav` is the sidebar and collapsed desktop navigation.

### State management

- Zustand `useChatStore` is the single application state store.
- `persist` stores state under `netkathir-chat-v2` in browser storage.
- State includes threads, messages, active thread, sidebar/theme state, editing state, and per-thread scroll positions.
- Backend sessions are represented by optional `Thread.sessionId`; message history itself is not synchronized from backend to browser on reload.
- Message/thread IDs are generated locally with `Math.random().toString(36).substring(2, 15)`.

### API/client layer

- `api.ts` centralizes base URL and request handling for `/api/chat`, `/api/chat/stream`, `/api/stt-test`, and `/api/tts-test`.
- `ApiError` normalizes network and non-2xx responses; server `detail` is preferred where available.
- The Exotel endpoint exists server-side but has no frontend client function.

### Components and important UI flows

- Text input supports trimming, Enter submit, Shift+Enter newline, autosizing to 120px, reply preview, and voice controls.
- Threads can be created, renamed, deleted with confirmation, pinned, filtered by title, shared, opened in another tab, and exported as PDF.
- Messages support bot Markdown/GFM, code/table/list/quote rendering, copy, TTS play/pause/stop, share, right-click context menu, reply selection, pinning, and search highlighting.
- Search supports current-match navigation and keyboard Enter/Shift+Enter.
- Global shortcuts in `App` are Ctrl/Cmd+K search focus, Ctrl/Cmd+N new chat, Ctrl/Cmd+B sidebar toggle, and Escape mobile sidebar close. `ChatArea` adds Ctrl/Cmd+F search, Ctrl/Cmd+P print, Ctrl/Cmd+Shift+C copy last bot response, and arrow-key message navigation.
- Dark mode is a persisted boolean reflected as a `dark` class on `document.documentElement`.
- Print support is implemented through `@media print` rules in `index.css`; PDF export is separate and uses jsPDF.

### Hooks and utilities

- `useAutoScroll` tracks bottom state, follows new messages while appropriate, restores saved positions, and observes visible messages.
- `useChatStore` is also accessed via `getState()` in async callbacks to avoid stale thread/session state.
- `audioWav.ts` is the canonical WebM-to-WAV conversion utility for the one-shot voice path.
- `speechSynthesisService.ts` is a reusable browser voice selector, while `browserTts.ts` is a smaller fallback wrapper.

### Styling and build behavior

- Tailwind supplies utility classes and custom theme tokens; `index.css` supplies global behavior and animations.
- The UI has responsive desktop/mobile sidebar behavior, safe-area support, dark mode, green/ivory/midnight palette, and custom voice animations.
- `vite.config.ts` intentionally excludes jsPDF from dependency optimization and rewrites a jsPDF optional `html2canvas` import because `html2canvas` is not declared as a direct dependency in `frontend/package.json`.
- Strict TypeScript is enabled with `noUnusedLocals`, `noUnusedParameters`, and `noFallthroughCasesInSwitch`.

### Error handling

- API fetch/network/non-2xx errors become `ApiError`.
- Chat send paths show a backend/LLM fallback message.
- STT and Exotel backend routes convert provider failures to 502 responses.
- TTS returns 503 when ElevenLabs cannot produce the first chunk; the browser can then provide fallback speech.
- Voice mode displays an error state and allows retry; microphone and provider failures are logged to the browser console.

## 7. Backend Architecture

### Application entry point

`backend/app/main.py` creates `FastAPI(title="AI Voice Calling Agent")`, enables CORS, includes both routers, and defines lifecycle handlers.

Startup sequence:

1. `database.connect()` creates an asyncpg pool and runs `CREATE TABLE IF NOT EXISTS` schema SQL.
2. `scrape_and_save()` is started as an independent background task.
3. APScheduler starts a 30-day interval job for `scrape_and_save()`.

Shutdown sequence:

1. The scheduler is shut down.
2. The database pool is closed.

### Routes and handlers

- `GET /api/health`: returns `{"status": "ok"}`.
- `POST /api/chat`: `ChatRequest` to `ChatResponse`; normal context-aware LLM answer.
- `POST /api/chat/stream`: `ChatRequest` to `text/event-stream`; SSE chat response.
- `POST /api/stt-test`: multipart WAV upload to transcript JSON.
- `POST /api/tts-test`: JSON text to streamed `audio/mpeg`.
- `POST /api/exotel/call`: JSON customer number/caller ID to Exotel initiation result.

### Services and integrations

- `database.py`: all SQL, pool lifecycle, schema, messages, conversation context, and website retrieval.
- `providers/llm.py`: LLM client and tool loop.
- `providers/stt.py`: STT HTTP client.
- `providers/tts.py`: ElevenLabs adapter.
- `providers/exotel.py`: Exotel HTTP adapter.
- `website_scraper.py`: external website ingestion.
- `agent/prompts.py` and `agent/tools.py`: agent policy and callable capabilities.

### Middleware and configuration

- Only CORS middleware is present. It allows all HTTP methods and headers and uses comma-separated `CORS_ORIGINS` values.
- No authentication middleware, rate limiting, request logging middleware, exception middleware, or WebSocket middleware is present.
- `config.py` uses `pydantic-settings` with `backend/.env`; required settings are validated when the module is imported.

### Background jobs

- Website scrape runs once in a background task at startup.
- Website scrape repeats every 30 days through APScheduler.
- No other worker, queue, periodic cleanup job, or background task is implemented. `cleanup_old_conversations` exists as a database method but is not scheduled or called by the inspected source.

### Error handling

- Chat LLM failures are logged and converted to HTTP 502 in the normal route.
- Streaming LLM failures emit SSE error/done events rather than raising a normal HTTP error after streaming begins.
- STT/Exotel errors are logged and converted to HTTP 502.
- TTS catches failure obtaining the first chunk and returns 503; failures after streaming starts are logged and the generator ends.
- Database and scraper startup errors are not wrapped by an application-level fallback in the inspected source.

## 8. Database

### Technology and access

- **Confirmed:** PostgreSQL accessed asynchronously using `asyncpg.create_pool`.
- **Confirmed:** Schema creation is performed automatically on backend startup through one multi-statement `CREATE TABLE IF NOT EXISTS` call.
- **Confirmed:** No migration framework or migration files were found.
- **Confirmed:** The README's older `SQLite (POC) -> PostgreSQL (production)` wording does not match the current database implementation; no SQLite access is present in `database.py`.

### Tables created by current source

#### `customers`

- `customer_id TEXT PRIMARY KEY`
- `name TEXT NOT NULL`
- `phone TEXT NOT NULL`

#### `appointments`

- `id TEXT PRIMARY KEY`
- `customer_id TEXT NOT NULL REFERENCES customers(customer_id)`
- `date TEXT NOT NULL`
- `time TEXT NOT NULL`
- `status TEXT NOT NULL`

#### `conversations`

- `session_id TEXT PRIMARY KEY`
- `customer_id TEXT REFERENCES customers(customer_id)`
- `context JSONB NOT NULL DEFAULT '{}'::jsonb`
- `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
- `updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`

#### `messages`

- `id TEXT PRIMARY KEY`
- `session_id TEXT NOT NULL REFERENCES conversations(session_id) ON DELETE CASCADE`
- `role TEXT NOT NULL`
- `content TEXT NOT NULL`
- `timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()`

#### `consultations`

- `consultation_id TEXT PRIMARY KEY`
- `name TEXT NOT NULL`
- `contact TEXT NOT NULL`
- `preferred_time TEXT NOT NULL`
- `topic TEXT NOT NULL`
- `status TEXT NOT NULL DEFAULT 'requested'`

#### `consultation_slots`

- `id BIGSERIAL PRIMARY KEY`
- `date TEXT NOT NULL`
- `time TEXT NOT NULL`
- `available BOOLEAN NOT NULL DEFAULT TRUE`

#### `website_content`

- `id BIGSERIAL PRIMARY KEY`
- `url TEXT UNIQUE NOT NULL`
- `title TEXT`
- `content TEXT NOT NULL`
- `content_hash TEXT`
- `last_scraped_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
- Indexes are created on `url` and `title`; the composite messages index is `(session_id, timestamp)`.

### Relationships

- `appointments.customer_id -> customers.customer_id`.
- `conversations.customer_id -> customers.customer_id` and is nullable.
- `messages.session_id -> conversations.session_id` with cascading deletion.
- No foreign-key relationship connects consultations or website content to other tables.

### Queries and data movement

- `ensure_conversation` inserts a session if absent.
- `get_messages` reads the latest 30 messages by descending timestamp/ID, then returns them in chronological order as `{ role, content }`.
- `add_messages` inserts each non-tool and non-tool-call assistant message with a generated UUID and updates `conversations.updated_at`.
- `get_context` reads JSONB and returns a Python dictionary.
- `save_context` replaces the JSONB context and updates `updated_at`.
- `cleanup_old_conversations` deletes conversations older than the configured retention interval; because messages cascade, associated messages are deleted. The method is not invoked by current startup code.
- `save_website_content` upserts by URL.
- `get_website_content` concatenates all stored pages.
- `search_website_content` tokenizes a query, removes common stop words, builds parameterized `ILIKE` clauses, orders contact/about/services/products first, and limits results.

### Schema/tool consistency findings

- **Confirmed:** `get_service_info` queries a `services` table, `get_case_study` queries `case_studies`, and `faq_lookup` queries `faqs`.
- **Confirmed:** Those three tables are not created by `_create_schema`.
- **Inferred:** Calling those tools against a database initialized only by this repository will raise PostgreSQL undefined-table errors; the LLM tool loop does not catch arbitrary database exceptions for these calls, so this is an implementation gap.
- **Unknown:** Whether those tables are created externally by a separate database process or deployment script not included in the repository.

## 9. API Reference

### `GET /api/health`

- **Purpose:** Basic service health response.
- **Request:** No parameters/body.
- **Response:** `{ "status": "ok" }`.
- **Authentication:** None.
- **Frontend caller:** None found.
- **Implementation:** `backend/app/main.py`.

### `POST /api/chat`

- **Purpose:** Non-streaming customer-support chat.
- **Request body:**
  ```json
  {
    "message": "string",
    "session_id": "string or null"
  }
  ```
- **Response body:**
  ```json
  {
    "reply": "string",
    "session_id": "string"
  }
  ```
- **Behavior:** Creates a UUID session when `session_id` is null, loads up to 30 messages/context, invokes the LLM/tool loop, persists the turn/context, and returns the cleaned reply.
- **Authentication:** None.
- **Frontend caller:** `frontend/src/lib/api.ts:sendChatMessage`; one-shot browser voice flow in `ChatArea.tsx`.
- **Implementation:** `backend/app/api/chat.py`.

### `POST /api/chat/stream`

- **Purpose:** Server-Sent Events chat response.
- **Request body:** Same `ChatRequest` as `/api/chat`.
- **Response:** `Content-Type: text/event-stream`; each event is a JSON object after `data:`:
  - `{ "type": "chunk", "text": "..." }`
  - `{ "type": "error", "text": "..." }`
  - `{ "type": "done", "session_id": "..." }`
- **Behavior:** Tool-calling phase is non-streaming; final text is streamed only afterward. If tool-loop text already exists, it is emitted as one chunk.
- **Authentication:** None.
- **Frontend caller:** `sendChatMessageStream` from `api.ts`, used by `ChatArea.tsx` and `SpeechToSpeechMode.tsx`.
- **Implementation:** `backend/app/api/chat.py`.

### `POST /api/stt-test`

- **Purpose:** Convert uploaded speech audio to text.
- **Request:** `multipart/form-data` field `file`; route declares `audio/wav`.
- **Response:** `{ "transcript": "string" }`.
- **Backend provider input:** File bytes and filename are sent to `STT_URL` as multipart `file`, plus `model` and `language_code` form fields.
- **Authentication:** No application auth; provider API key is server-side.
- **Frontend caller:** `transcribeAudio` from `api.ts`; used by `ChatArea` and `SpeechToSpeechMode`.
- **Implementation:** `backend/app/api/voice.py` and `providers/stt.py`.

### `POST /api/tts-test`

- **Purpose:** Generate speech audio for supplied text.
- **Request body:** `{ "text": "string" }`.
- **Response:** Streaming `audio/mpeg`, with `Content-Disposition: attachment; filename=tts_test.mp3`.
- **Authentication:** No application auth; ElevenLabs API key is server-side.
- **Frontend caller:** `synthesizeSpeech` from `api.ts`; used by `ChatArea` and `SpeechToSpeechMode`.
- **Implementation:** `backend/app/api/voice.py` and `providers/tts.py`.

### `POST /api/exotel/call`

- **Purpose:** Initiate an outbound Exotel call.
- **Request body:**
  ```json
  {
    "customer_number": "string",
    "caller_id": "string or null"
  }
  ```
- **Response:** `{ "success": true, "message": "Exotel call initiated", "data": <Exotel JSON> }`.
- **Backend provider request:** Form fields `From`, `To`, `CallerId`, and `CallType=trans` to Exotel `Calls/connect.json`.
- **Authentication:** No application auth; provider uses HTTP Basic Auth with Exotel API key/token.
- **Frontend caller:** None found.
- **Implementation:** `backend/app/api/voice.py` and `providers/exotel.py`.

### WebSocket endpoints

- **Confirmed:** No WebSocket route or WebSocket implementation was found.
- **README-only intent:** The README describes a future `/ws/exotel` AgentStream architecture. It is not available in the current source.

## 10. External Services

### OpenAI-compatible LLM endpoint

- **Purpose:** Generate support responses and select/consume tools.
- **Called from:** `backend/app/providers/llm.py` and the streaming helper in `backend/app/api/chat.py`.
- **Input:** System prompt, agent instructions, optional context, recent history, current user message, tool schemas, and tool results.
- **Output:** Chat completion messages, optional tool calls, and optionally streamed text deltas.
- **Authentication/config:** `LLM_API_KEY`; URL is `LLM_BASE_URL`; model is `LLM_MODEL`.
- **Fallback/failure:** Normal route returns HTTP 502 with a configuration/service message; streaming emits an SSE error event. No alternate LLM provider is implemented.
- **Important detail:** The provider is not necessarily OpenAI; the configurable base URL means the exact service is Unknown.

### Sarvam STT-compatible API

- **Purpose:** Authoritative final transcription for browser-recorded audio.
- **Called from:** `backend/app/providers/stt.py` through `POST /api/stt-test`.
- **Input:** WAV file, `STT_MODEL`, and `STT_LANGUAGE_CODE`.
- **Output:** JSON field `transcript`.
- **Authentication/config:** `STT_API_KEY` in header `api-subscription-key`; endpoint `STT_URL`.
- **Fallback:** Speech-to-speech mode can use browser Web Speech text when Sarvam fails; one-shot `ChatArea` voice input reports the API error instead.
- **Important detail:** Default model is `saaras:v3`; default language is `en-IN`.

### ElevenLabs

- **Purpose:** Text-to-speech MP3 generation.
- **Called from:** `backend/app/providers/tts.py` through `/api/tts-test`.
- **Input:** Text, `ELEVENLABS_VOICE_ID`, `ELEVENLABS_MODEL_ID`, and output format `mp3_44100_128`.
- **Output:** Bytes or iterable MP3 chunks.
- **Authentication/config:** `ELEVENLABS_API_KEY`.
- **Fallback:** Frontend uses Web Speech API when ElevenLabs fails or browser streaming playback is unsupported.
- **Important detail:** `ChatArea` supports MediaSource chunked playback; `SpeechToSpeechMode` buffers the response into a Blob before playing it.

### Exotel

- **Purpose:** Outbound phone call initiation.
- **Called from:** `backend/app/providers/exotel.py` via `/api/exotel/call`.
- **Input:** Customer number, caller ID, configured SID, subdomain, and `CallType=trans`.
- **Output:** Exotel JSON response.
- **Authentication/config:** Exotel API key/token in HTTP Basic Auth; SID, caller ID, and subdomain are settings.
- **Fallback:** Missing settings and provider failures become HTTP 502 from the route.
- **Important detail:** There is no current telephone audio processing path.

### Netkathir website

- **Purpose:** Business-information source for the agent.
- **Called from:** Startup and scheduled `scrape_and_save` in `website_scraper.py`.
- **Input:** `WEBSITE_BASE_URL` plus fixed relative paths.
- **Output:** HTML cleaned into title/plain text and stored in PostgreSQL.
- **Authentication/config:** No website auth mechanism is implemented; the URL is configured by environment.
- **Fallback:** Individual HTTP fetch errors are printed and skipped; other scraper/database failures are not given an application fallback.

### WhatsApp web share URL

- **Purpose:** User-initiated sharing from the browser.
- **Called from:** `ShareModal.tsx` using `https://wa.me/?text=...`.
- **Input/output:** Browser opens a WhatsApp share URL containing the generated local origin `/share/<threadId>` link.
- **Authentication:** None in this code.
- **Important detail:** The target share page is not implemented by this SPA source.

### Google Fonts

- **Purpose:** Load Inter font in `frontend/index.html`.
- **Authentication:** None.
- **Failure behavior:** Browser font fallback is defined in CSS.

## 11. AI/ML Pipeline

### Text pipeline

1. **Input:** User text from the React UI or final browser transcription.
2. **Preprocessing:** `ChatArea` may prepend a reply reference; voice flows normalize common variants of Netkathir. Backend `update_context` extracts simple names and appends non-trivial messages as important facts.
3. **Prompt construction:** `SYSTEM_PROMPT`, `AGENT_INSTRUCTIONS`, optional formatted context, up to 30 stored messages, and the current user message are assembled.
4. **Model call:** OpenAI-compatible `chat.completions.create` with the configured model.
5. **Tool selection:** Up to three rounds allow tools on the first two rounds. The final round can replace messages with authoritative website-search results and disables tools in the streaming fallback call.
6. **Tool execution:** JSON arguments are decoded and dispatched through `AVAILABLE_TOOLS`; async tools are awaited.
7. **Response processing:** `clean_response` removes common Markdown markers, links, list markers, excess whitespace, and backticks.
8. **Persistence:** Current user/assistant/tool-call turn is saved, excluding tool result messages and assistant messages with tool calls from normal `messages` rows; context is saved in `conversations.context`.
9. **Output:** Clean reply plus session ID, or SSE text chunks plus a final session ID.

### Website-grounded answers

- Company/location/contact/services/products/projects/website questions are instructed to call `search_website_content`.
- Search removes common question words, performs keyword `ILIKE` matching against title/content, prioritizes contact/about/services/products pages, and returns up to three truncated records.
- The prompt explicitly says not to invent or guess company information.

### Voice pipeline

- **One-shot mode:** Microphone -> WebM -> PCM mono WAV conversion -> `/api/stt-test` -> text chat `/api/chat` -> `/api/tts-test` -> MediaSource or browser TTS.
- **Speech-to-speech mode:** Microphone -> WebM -> STT endpoint (with browser-recognition fallback) -> `/api/chat/stream` -> sentence buffering -> ElevenLabs per sentence or browser TTS -> optional barge-in monitoring.
- **Streaming:** LLM SSE chunks update the UI immediately. TTS in speech-to-speech begins per sentence when punctuation is detected; normal message TTS consumes the audio stream.

### Fallbacks and limitations

- LLM failure: user-facing backend-unavailable message.
- STT failure: browser recognition fallback only in speech-to-speech mode.
- ElevenLabs failure: Web Speech API fallback.
- Browser capability gaps: MediaSource/Web Speech checks decide fallback behavior.
- **Confirmed limitation:** Speech-to-speech does not use the shared WebM-to-WAV conversion path before its STT request, while the one-shot path does.
- **Confirmed limitation:** The final response from a tool loop is sometimes emitted as one chunk, so tool-enabled answers are not necessarily token-streamed.

## 12. Environment Variables

### Backend variables

The backend settings are loaded from `backend/.env`. No backend `.env.example` file was found. The README lists example names but includes duplicate/incomplete older entries; the authoritative names are the `Settings` fields below.

| Variable | Required? | Purpose | Used in |
|---|---|---|---|
| `WEBSITE_BASE_URL` | Required by `Settings` | Base URL for fixed website scrape paths. | `config.py`, `website_scraper.py`. |
| `LLM_API_KEY` | Required | API credential for the OpenAI-compatible LLM client. | `config.py`, `providers/llm.py`; also named in error text. |
| `LLM_MODEL` | Required | Chat-completion model identifier. | `config.py`, chat tool loop, `providers/llm.py`. |
| `LLM_BASE_URL` | Required | Base URL for the OpenAI-compatible endpoint. | `config.py`, `providers/llm.py`. |
| `STT_API_KEY` | Required | STT provider subscription key. | `config.py`, `providers/stt.py`. |
| `STT_URL` | Required | STT HTTP endpoint. | `config.py`, `providers/stt.py`. |
| `STT_MODEL` | Optional; default `saaras:v3` | STT model form field. | `config.py`, `providers/stt.py`. |
| `STT_LANGUAGE_CODE` | Optional; default `en-IN` | STT language form field. | `config.py`, `providers/stt.py`. |
| `ELEVENLABS_API_KEY` | Required | ElevenLabs SDK credential. | `config.py`, `providers/tts.py`. |
| `ELEVENLABS_VOICE_ID` | Required | ElevenLabs voice identifier. | `config.py`, `providers/tts.py`. |
| `ELEVENLABS_MODEL_ID` | Required | ElevenLabs model identifier. | `config.py`, `providers/tts.py`. |
| `DATABASE_URL` | Required | PostgreSQL connection URL. | `config.py`, `database.py`. |
| `DB_POOL_MIN_SIZE` | Optional; default `1` | asyncpg pool minimum size. | `config.py`, `database.py`. |
| `DB_POOL_MAX_SIZE` | Optional; default `10` | asyncpg pool maximum size. | `config.py`, `database.py`. |
| `CONVERSATION_RETENTION_DAYS` | Optional; default `30` | Age threshold used by `cleanup_old_conversations`. | `config.py`, `database.py`. |
| `CORS_ORIGINS` | Required | Comma-separated origins passed to FastAPI CORS middleware. | `config.py`, `main.py`. |
| `SEED_DEMO_DATA` | Optional; default `false` | Declared seeding flag. No current source reads it. | `config.py` only. |
| `EXOTEL_SID` | Optional at settings validation; required for Exotel use | Exotel account SID. | `config.py`, `providers/exotel.py`. |
| `EXOTEL_API_KEY` | Optional at settings validation; required for Exotel use | Exotel HTTP Basic Auth username/key. | `config.py`, `providers/exotel.py`. |
| `EXOTEL_API_TOKEN` | Optional at settings validation; required for Exotel use | Exotel HTTP Basic Auth password/token. | `config.py`, `providers/exotel.py`. |
| `EXOTEL_SUBDOMAIN` | Optional; default `api.exotel.com` | Exotel API host. | `config.py`, `providers/exotel.py`. |
| `EXOTEL_CALLER_ID` | Optional at settings validation; required when request has no caller ID | Default outbound caller ID. | `config.py`, `providers/exotel.py`. |
| `DEBUG` | Optional/untyped environment lookup | Enables console printing of LLM tool calls when equal to `true`. | `providers/llm.py`. |

### Frontend variables

| Variable | Required? | Purpose | Used in |
|---|---|---|---|
| `VITE_API_URL` | Optional; defaults to `http://localhost:8000` | FastAPI base URL; trailing slash is removed. | `frontend/src/lib/api.ts`; declared in `src/vite-env.d.ts` and documented in `.env.example`. |

- **Confirmed:** No secret values are present in this context document.
- **Unknown:** Actual deployment-specific values and whether backend `.env` exists locally are not determined from the tracked source.

## 13. Installation and Running

### Prerequisites

- Python with virtual-environment support.
- Node.js/npm.
- A reachable PostgreSQL database.
- Credentials and endpoints for the configured LLM, STT, and ElevenLabs services if those features are used.
- A browser that supports the required microphone/audio APIs for voice features.

Exact supported version numbers for Python, Node.js, and PostgreSQL are **Unknown**; no version manager files are present.

### Backend setup

The repository README provides this Windows flow:

```powershell
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Before startup, create `backend/.env` with the backend settings documented in Section 12. The source loads that exact path via `config.py`.

The README says to create a PostgreSQL database first:

```sql
CREATE DATABASE "voice-agent";
```

The application then creates its current tables automatically during startup. No migration command exists.

### Frontend setup

```powershell
cd frontend
npm install
npm run dev
```

The frontend README says to open `http://localhost:5173`. Set `frontend/.env` using `.env.example` when the backend is not at `http://localhost:8000`.

### Build and preview

Supported scripts from `frontend/package.json`:

```powershell
npm run build
npm run preview
npm run lint
```

- `build` runs `tsc` and then `vite build`.
- `preview` runs Vite's production preview server.
- `lint` invokes ESLint, although an ESLint configuration/package is not visible in the inspected frontend manifest; whether this command works in the current checkout is **Unknown**.

### Production backend

- **Confirmed:** Uvicorn is a declared dependency and the README supplies `uvicorn app.main:app --reload` for development.
- **Unknown:** No production process manager, worker count, container command, or hosting command is defined.

## 14. Deployment

- **Frontend hosting:** Unknown. Vite production build output is implied to be `frontend/dist`, but no hosting configuration is present.
- **Backend hosting:** Unknown. Uvicorn can serve the FastAPI app, but no deployment manifest or process configuration exists.
- **Database hosting:** PostgreSQL is required by the current code; hosting provider is Unknown.
- **Environment configuration:** Backend expects `backend/.env`; frontend expects Vite-exposed `VITE_API_URL`. No production environment examples are provided.
- **Deployment-specific files:** No Dockerfile, `docker-compose.yml`, cloud config, CI workflow, reverse-proxy config, migration tooling, or infrastructure code was found.
- **README claim:** The README says `Deploy: Docker`, but the corresponding Docker files are absent from this repository snapshot. Treat Docker deployment as intended/documented, not confirmed implemented.

## 15. Features

### Completed/implemented in source

- React/Vite single-page customer-support chat UI.
- Persisted local conversation threads and messages.
- New chat creation, automatic first-message title, rename, delete confirmation, pin-to-top, search, unread counts, and theme toggle.
- Backend session ID association per local thread.
- Non-streaming and SSE streaming text chat.
- PostgreSQL connection pooling and automatic current-schema creation.
- Conversation history limit of 30 messages for LLM requests.
- JSON conversation context with basic name extraction and important-fact retention.
- LLM function/tool schemas and dispatch loop.
- Website scraping and PostgreSQL-backed keyword retrieval.
- One-shot browser microphone capture and WebM-to-PCM-WAV conversion.
- STT API integration.
- ElevenLabs TTS integration and browser Speech Synthesis fallback.
- Speech-to-speech mode with automatic silence stop, interim browser transcript, streaming LLM text, sentence TTS, and optional barge-in monitoring.
- Bot Markdown/GFM rendering, code/table/list/quote support.
- Copy, reply, pin, forward/share context actions.
- Conversation search with match navigation/highlighting.
- Scroll restoration per thread and smart tail following.
- Print CSS and full-thread paginated PDF export.
- WhatsApp sharing URL generation and clipboard link copying.
- Health endpoint.
- Outbound Exotel call request integration.

### Partially implemented or limited

- **Phone calling:** outbound call initiation exists, but inbound/audio streaming and AgentStream/WebSocket processing do not.
- **Consultation/customer/case-study/FAQ tools:** tool functions and schemas exist, but `services`, `case_studies`, and `faqs` tables are absent from the current schema.
- **Conversation cleanup:** database cleanup method exists but no scheduled caller exists.
- **Speech-to-speech audio format:** the one-shot voice path converts WebM to WAV; speech-to-speech uploads its WebM blob directly to the WAV-oriented STT route.
- **Sharing:** share links are generated, but no share route/page or backend shared-conversation retrieval exists.
- **Streaming:** tool-call rounds are non-streaming; only the final text phase can stream.
- **Demo seeding:** a setting exists, but no seeding implementation was found.

### Clearly unfinished/TODO based on repository evidence

- The README's staged items for full Exotel AgentStream, `/ws/exotel`, concurrent phone pipelines, interruption handling on the phone channel, production database/customer/business models, and deployment are not present in current source.
- No explicit `TODO` or `FIXME` comments were found in application source during the scan.
- Exact additional unfinished work beyond the documented implementation gaps is Unknown.

## 16. Known Issues and TODOs

The following are source-supported observations, not speculative recommendations:

1. `agent/tools.py` queries `services`, `case_studies`, and `faqs`, but `database.py` never creates those tables. Those tools can fail unless an external schema exists.
2. The current backend has no WebSocket route even though the README describes `/ws/exotel` as an intended endpoint.
3. The Exotel integration only initiates outbound calls. It does not process call media, inbound webhooks, AgentStream messages, STT, LLM, TTS, or audio return to a caller.
4. `SEED_DEMO_DATA` is declared but unused.
5. `cleanup_old_conversations` is implemented but never scheduled/called by current application startup.
6. `ShareModal` creates `/share/<threadId>` links but no route or share page is implemented.
7. There is no authentication or authorization on any backend endpoint.
8. CORS uses `allow_methods=["*"]`, `allow_headers=["*"]`, and `allow_credentials=True`; access control depends entirely on the configured origins and external network boundary.
9. The speech-to-speech component uploads WebM directly while the backend route and one-shot flow are designed around WAV; behavior depends on what the configured STT provider accepts.
10. `SpeechToSpeechMode` imports and uses `synthesizeSpeech`, which buffers its response via `response.blob()`, while normal message playback handles streaming MP3 through MediaSource.
11. Normal local thread persistence does not restore backend conversation history into the UI after browser storage loss or across browsers; it only preserves a backend session ID when locally persisted.
12. No automated tests were found. Runtime correctness, provider contracts, and browser voice behavior are therefore not covered by repository tests.
13. The README includes an old sample structure containing files/directories that are absent from the actual repository; future changes must use the actual tree as authority.
14. The root `package.json` has only a `requirements` dependency and no application scripts; the relevant frontend commands are under `frontend/package.json`.
15. The frontend `lint` script references ESLint, but ESLint configuration/dependency is not visible in the inspected frontend package manifest. Whether lint works is Unknown and should be verified before relying on it.

## 17. Important Architectural Decisions

### Confirmed decisions

- The backend separates routes, agent prompts/tools, provider adapters, database access, and website scraping into distinct modules.
- The LLM is accessed through an OpenAI-compatible interface, making the endpoint configurable through `LLM_BASE_URL`.
- Tool calls are represented as explicit JSON schemas and dispatched through a name-to-function map.
- Conversation state is split between browser-local UI threads and backend PostgreSQL sessions. The frontend owns presentation/thread metadata; the backend owns LLM history/context for a session.
- PostgreSQL schema bootstrap is performed at application startup rather than through migrations.
- Website content is treated as an authoritative support-information source and refreshed on a schedule.
- The frontend uses SSE for streaming chat rather than WebSockets.
- The frontend uses layered TTS fallbacks: ElevenLabs first, browser speech second.
- The one-shot audio path deliberately normalizes browser recording output to mono 16-bit PCM WAV before STT.
- PDF export uses direct jsPDF layout rather than screenshot/DOM capture, with a Vite workaround for jsPDF's optional `html2canvas` import.

### Inferred rationale

- Provider modules are intended to make LLM/STT/TTS services replaceable without changing route or UI code.
- Limiting history to 30 messages is intended to bound LLM request size.
- Local Zustand persistence is intended to make the chat workspace survive reloads without requiring a frontend conversation-history API.
- The plain-text prompt rules and response cleaner are intended to make responses suitable for speech as well as screen display.
- The three-round tool loop is intended to allow tool selection/results before a final grounded answer.

## 18. Coding Conventions

- Backend modules use lowercase snake_case filenames, functions, variables, and settings fields.
- Backend uses async functions for FastAPI handlers, database access, LLM calls, STT calls, and scraper operations; the ElevenLabs SDK adapter remains synchronous and yields through an iterator.
- Pydantic `BaseModel` classes define API request/response contracts.
- Database SQL is kept in `database.py` and provider-specific calls are kept in provider modules.
- Frontend components use PascalCase filenames and exported function components; hooks use `use...` names.
- TypeScript uses explicit interfaces/types for component props and store contracts; strict compiler settings are enabled.
- Zustand actions update state immutably with `set` callbacks; asynchronous UI code often uses `useChatStore.getState()` or refs to avoid stale closures.
- API errors use a custom `ApiError`; backend logs provider/LLM failures and returns controlled HTTP/SSE error messages.
- Reusable Tailwind class composition goes through `cn` (`clsx` plus `tailwind-merge`).
- Frontend visual styling is primarily utility classes, with shared behavior/animations/layout in `index.css`.
- Existing source contains comments that explain non-obvious audio, scrolling, PDF, and Vite workarounds. Preserve useful rationale when modifying those areas.
- No repository-wide formatter, ESLint config, Python linter, test runner, or CI configuration was found. Formatting/linting policy beyond the visible style is Unknown.

## 19. Rules for Future Code Changes

1. Preserve the existing route/provider/database/component architecture unless a deliberate architectural change is requested.
2. Inspect the actual source and current API contract before changing or adding behavior.
3. Reuse existing utilities and components, especially `cn`, `useChatStore`, `api.ts`, `webmBlobToWav`, provider modules, and database helpers.
4. Do not duplicate chat, audio conversion, TTS fallback, context extraction, or session handling logic.
5. Keep frontend request/response and SSE event contracts synchronized with `backend/app/api`.
6. Do not invent routes, tables, environment variables, provider response shapes, or deployment commands.
7. Do not hardcode secrets, credentials, service URLs, model IDs, or environment-specific values.
8. Keep LLM tool schemas, `AVAILABLE_TOOLS`, implementation functions, and database schema synchronized.
9. Do not assume README-only architecture exists; verify WebSockets, migrations, Docker, auth, and deployment files before using them.
10. Keep changes minimal and focused; do not modify unrelated files.
11. Preserve existing working UI capabilities such as local persistence, thread selection, streaming updates, TTS fallback, and scroll restoration when changing chat behavior.
12. Remove unused imports/variables introduced by a change and respect strict TypeScript settings.
13. Use parameterized SQL and keep database mutations in the database access layer.
14. Treat external provider failures, malformed responses, aborted requests, microphone denial, empty transcripts, and empty audio as expected edge cases.
15. Maintain plain spoken output requirements when changing prompts or TTS flows.
16. Do not expose provider keys or server-only settings to the frontend.
17. Consider browser capability differences for MediaRecorder, AudioContext, MediaSource, SpeechRecognition, and speechSynthesis.
18. Before changing schema, determine whether the application needs a migration strategy; startup `CREATE TABLE IF NOT EXISTS` does not alter existing tables.
19. Check both normal and streaming chat paths when changing LLM/tool behavior because they have separate implementations.
20. Check one-shot voice and speech-to-speech paths separately because their audio conversion and TTS playback paths differ.
21. Run the narrowest applicable TypeScript/Python/build check after edits, and report unavailable checks honestly.

## 20. ChatGPT Working Instructions

When helping with this project:

1. First inspect the existing implementation and the exact file(s) involved.
2. Treat current source/configuration as authoritative; use README information only when it agrees with source or clearly label it as intended/historical.
3. Identify the current behavior before proposing a change.
4. Trace the complete contract across UI, `api.ts`, FastAPI route, provider, database, and external service as applicable.
5. Identify the root cause before applying a fix.
6. Prefer modifying an existing implementation over creating a parallel implementation.
7. Make the smallest safe change that addresses the root cause.
8. Preserve unrelated thread, voice, persistence, and streaming functionality.
9. Verify imports, dependencies, TypeScript/Python types, and provider response assumptions.
10. Check both `/api/chat` and `/api/chat/stream` when modifying agent behavior.
11. Check the current database schema before adding or using a tool/table.
12. Keep frontend and backend API contracts synchronized.
13. Never assume a file, function, route, table, environment variable, or deployment target exists without checking.
14. Do not add authentication, WebSockets, migrations, deployment infrastructure, or dependencies implicitly; ask for or document the architectural decision when required.
15. Do not expose secrets in code, logs, generated docs, or responses.
16. Clearly state which files need to change and distinguish confirmed facts, inferred behavior, and unknowns.
17. Validate changes with the narrowest available executable check and mention any missing test coverage.

## 21. Current Project Context

Quick reference for a new ChatGPT conversation:

- This repository contains a Netkathir customer-support chat/voice application named `Voice-Calling-Agent`.
- The frontend is React 18 + TypeScript + Vite + Tailwind + Zustand. Its entry point is `frontend/src/main.tsx`; the shell is `App.tsx`; the main UI is `ChatArea.tsx` and `ThreadNav.tsx`.
- The backend is Python FastAPI. Its entry point is `backend/app/main.py`; chat routes are in `backend/app/api/chat.py`; voice/STT/TTS/Exotel routes are in `backend/app/api/voice.py`.
- The real database implementation is PostgreSQL through `asyncpg`, not SQLite. Tables are created at startup in `backend/app/database.py`.
- The LLM uses an OpenAI-compatible async client configured by `LLM_API_KEY`, `LLM_BASE_URL`, and `LLM_MODEL`. It can call tools from `backend/app/agent/tools.py`.
- Website pages are scraped into `website_content` and searched by the LLM for company information. `WEBSITE_BASE_URL` is required.
- Browser text chat uses `POST /api/chat/stream` and SSE for the normal UI. The non-streaming `/api/chat` route is used by one-shot voice input.
- STT uses the configured `STT_URL`/`STT_API_KEY`; ElevenLabs TTS uses `ELEVENLABS_*` settings; browser speech is the fallback.
- `VITE_API_URL` points the frontend to FastAPI and defaults to `http://localhost:8000`.
- There is no authentication, frontend router, backend WebSocket, migration system, Docker file, deployment manifest, or automated test suite in the inspected source.
- Exotel currently only supports outbound call initiation; the README's planned `/ws/exotel` telephone pipeline is not implemented.
- Three LLM tools query tables not created by the current schema: `services`, `case_studies`, and `faqs`. Confirm external schema availability before relying on those tools.
- Do not modify source when a documentation-only task is requested. This document itself is the intended project context artifact.

## 22. Context Priority

### Facts confirmed from source code/configuration

- File structure and source modules listed in Section 3.
- React/Vite frontend and FastAPI/Python backend.
- PostgreSQL schema and asyncpg access.
- Actual routes listed in Section 9.
- Actual environment settings listed in Section 12.
- Actual provider integrations: OpenAI-compatible LLM, STT HTTP service, ElevenLabs, Exotel HTTP, and Netkathir website scraping.
- Zustand-persisted local frontend state and backend session IDs.
- No auth, no WebSocket, no migrations, no deployment files, and no tests found in the inspected repository tree.

### Behavior inferred from implementation

- The product is an early customer-support proof of concept intended to share agent behavior across web and voice channels.
- Provider modules and configurable URLs are intended to support provider replacement.
- Local persistence is intended to preserve the browser chat workspace, while PostgreSQL preserves server-side conversation context/history.
- The LLM prompt, website retrieval, and response cleaning are intended to support safe, spoken customer-support answers.

### Unknown information

- Production provider identities behind `LLM_BASE_URL` and `STT_URL` beyond the README's Sarvam description for STT.
- Actual environment values, credentials, deployment hosts, domain names, database host, and infrastructure.
- Supported Python/Node/PostgreSQL versions.
- Whether external provisioning creates the missing `services`, `case_studies`, and `faqs` tables.
- Whether the share URL is handled by infrastructure outside this repository.
- Whether the root npm package is used operationally.
- Production performance, security posture, concurrency limits, provider quotas, and real-world browser compatibility.
