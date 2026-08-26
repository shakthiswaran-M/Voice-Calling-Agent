export interface ChatReply {
  text: string;
  sessionId: string;
}

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

export async function sendMessage(
  message: string,
  sessionId?: string,
): Promise<ChatReply> {
  const res = await fetch(`${API_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, session_id: sessionId }),
  });

  if (!res.ok) {
    throw new Error(`Chat request failed: ${res.status}`);
  }

  const data = await res.json();
  return { text: data.reply, sessionId: data.session_id };
}