export interface ChatReply {
  text: string;
  sessionId: string;
}

export async function sendMessage(
  message: string,
  sessionId?: string,
): Promise<ChatReply> {
  const res = await fetch("http://localhost:8000/api/chat", {
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