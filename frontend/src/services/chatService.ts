export interface ChatReply {
  text: string;
}

/**
 * Sends the user's message to the backend and returns the agent's reply.
 * Replace the mock body with a real fetch() call to your chat API, e.g.:
 *
 *   const res = await fetch("/api/chat", {
 *     method: "POST",
 *     headers: { "Content-Type": "application/json" },
 *     body: JSON.stringify({ message }),
 *   });
 *   const data = await res.json();
 *   return { text: data.reply };
 */
export async function sendMessage(message: string): Promise<ChatReply> {
  await new Promise((resolve) => setTimeout(resolve, 500));
  return { text: `You said: "${message}"` };
}
