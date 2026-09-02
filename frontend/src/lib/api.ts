// src/lib/api.ts
//
// Thin client around the FastAPI backend. Base URL is configurable via
// VITE_API_URL (see .env.example) so each dev / environment can point at
// their own backend without touching code.

export const API_BASE_URL =
  (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ||
  'http://localhost:8000';

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
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message,
        session_id: sessionId ?? null,
      }),
    });
  } catch (err) {
    throw new ApiError(
      'Could not reach the backend. Is the FastAPI server running?'
    );
  }

  if (!res.ok) {
    let detail = `Chat request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body?.detail) detail = body.detail;
    } catch {
      // ignore — use default detail
    }
    throw new ApiError(detail, res.status);
  }

  return res.json();
}

/** Quick backend health check, e.g. for a connection indicator. */
export async function checkHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/health`);
    return res.ok;
  } catch {
    return false;
  }
}

/** Send recorded audio to the backend and get back the transcribed text. */
export async function transcribeAudio(audioBlob: Blob): Promise<string> {
  const formData = new FormData();
  formData.append('file', audioBlob, 'recording.wav');

  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}/api/stt-test`, {
      method: 'POST',
      body: formData,
    });
  } catch (err) {
    throw new ApiError('Could not reach the backend for speech-to-text.');
  }

  if (!res.ok) {
    throw new ApiError(`STT request failed (${res.status})`, res.status);
  }

  const data = await res.json();
  return data.transcript as string;
}

/** Send text to the backend and get back playable speech audio. */
export async function synthesizeSpeech(text: string): Promise<Blob> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}/api/tts-test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
  } catch (err) {
    throw new ApiError('Could not reach the backend for text-to-speech.');
  }

  if (!res.ok) {
    throw new ApiError(`TTS request failed (${res.status})`, res.status);
  }

  return res.blob();
}