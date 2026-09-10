// src/lib/api.ts
//
// Thin client around the FastAPI backend. Base URL is configurable via
// VITE_API_URL (see .env.example) so each dev / environment can point at
// their own backend without touching code.

export const API_BASE_URL =
  (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ||
  `${window.location.protocol}//${window.location.hostname}:8000`;

const ENDPOINTS = {
  chat: '/api/chat',
  stt: '/api/stt-test',
  tts: '/api/tts-test',
} as const;

/** User-facing messages shown when the backend cannot be reached. */
const NETWORK_ERROR_MESSAGES = {
  chat: 'Could not reach the backend. Is the FastAPI server running?',
  stt: 'Could not reach the backend for speech-to-text.',
  tts: 'Could not reach the backend for text-to-speech.',
} as const;

export class ApiError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export interface ChatResponse {
  reply: string;
  session_id: string;
}

export interface SharedConversation {
  session_id: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
}

interface SttResponse {
  transcript: string;
}

/**
 * Single request wrapper for every backend call: normalizes network failures
 * and non-2xx responses into a consistent `ApiError` with a user-facing
 * message (server `detail` is preferred when present).
 */
async function request(
  url: string,
  init: RequestInit,
  networkErrorMessage: string,
): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch {
    throw new ApiError(networkErrorMessage);
  }

  if (!res.ok) {
    let detail = `Request failed (${res.status})`;
    try {
      const body = (await res.json()) as { detail?: string };
      if (body?.detail) detail = body.detail;
    } catch {
      // ignore — keep the status-based message
    }
    throw new ApiError(detail, res.status);
  }

  return res;
}

/**
 * Send a chat message to the backend agent.
 *
 * `sessionId` should be `undefined` for the first message in a thread —
 * the backend will create one and return it in the response. Pass that
 * same id on every subsequent call for that thread so the backend keeps
 * conversation history / context for it.
 */
export async function sendChatMessage(
  message: string,
  sessionId?: string | null
): Promise<ChatResponse> {
  const res = await request(
    `${API_BASE_URL}${ENDPOINTS.chat}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message,
        session_id: sessionId ?? null,
      }),
    },
    NETWORK_ERROR_MESSAGES.chat
  );
  return (await res.json()) as ChatResponse;
}

/** Send recorded audio to the backend and get back the transcribed text. */
export async function transcribeAudio(audioBlob: Blob, signal?: AbortSignal): Promise<string> {
  const formData = new FormData();
  formData.append('file', audioBlob, 'recording.wav');

  const res = await request(
    `${API_BASE_URL}${ENDPOINTS.stt}`,
    { method: 'POST', body: formData, signal },
    NETWORK_ERROR_MESSAGES.stt
  );
  const data = (await res.json()) as SttResponse;
  return data.transcript;
}

/** Send text to the backend and get back a streaming ElevenLabs response. */
export async function synthesizeSpeech(text: string, signal?: AbortSignal): Promise<Response> {
  return request(
    `${API_BASE_URL}${ENDPOINTS.tts}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
      signal,
    },
    NETWORK_ERROR_MESSAGES.tts
  );
}

// ── Streaming chat ──

export interface StreamChunk {
  type: 'chunk' | 'done' | 'error';
  text?: string;
  session_id?: string;
}

/**
 * Stream a chat message via SSE. Calls `onChunk` for each incremental
 * text piece and resolves with the final session_id when the stream ends.
 */
export async function sendChatMessageStream(
  message: string,
  onChunk: (text: string) => void,
  sessionId?: string | null,
  signal?: AbortSignal,
): Promise<string> {
  const res = await fetch(`${API_BASE_URL}/api/chat/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, session_id: sessionId ?? null }),
    signal,
  });

  if (!res.ok) {
    let detail = `Request failed (${res.status})`;
    try {
      const body = (await res.json()) as { detail?: string };
      if (body?.detail) detail = body.detail;
    } catch { /* ignore */ }
    throw new ApiError(detail, res.status);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new ApiError('No response body');

  const decoder = new TextDecoder();
  let buffer = '';
  let finalSessionId = sessionId || '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // Parse SSE lines
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const jsonStr = line.slice(6).trim();
      if (!jsonStr) continue;
      try {
        const event = JSON.parse(jsonStr) as StreamChunk;
        if (event.type === 'chunk' && event.text) {
          onChunk(event.text);
        } else if (event.type === 'done') {
          finalSessionId = event.session_id || finalSessionId;
        } else if (event.type === 'error') {
          throw new ApiError(event.text || 'Stream error');
        }
      } catch (e) {
        if (e instanceof ApiError) throw e;
        // ignore malformed JSON lines
      }
    }
  }

  return finalSessionId;
}

/** Load a conversation exposed through a public share link. */
export async function getSharedConversation(sessionId: string): Promise<SharedConversation> {
  const res = await request(
    `${API_BASE_URL}/api/share/${encodeURIComponent(sessionId)}`,
    { method: 'GET' },
    'Could not reach the backend for this shared conversation.',
  );
  return (await res.json()) as SharedConversation;
}