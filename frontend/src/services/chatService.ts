export interface ChatReply {
  text: string;
  sessionId: string;
}

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:5000";

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
    let detail = `Chat request failed (${res.status})`;
    try {
      const error = (await res.json()) as { detail?: string };
      if (error.detail) {
        detail = error.detail;
      }
    } catch {
      // Keep the status-based message when the server did not return JSON.
    }
    throw new Error(detail);
  }

  const data = await res.json();
  if (typeof data.reply !== "string" || typeof data.session_id !== "string") {
    throw new Error("The chat service returned an invalid response.");
  }

  return { text: data.reply, sessionId: data.session_id };
}