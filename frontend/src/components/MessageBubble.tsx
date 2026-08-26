import type { Message } from "../types";

interface MessageBubbleProps {
  message: Message;
}

export default function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.sender === "user";

  return (
    <div className={`message-row ${isUser ? "message-row--user" : "message-row--agent"}`}>
      <div
        className={`message-bubble ${
          isUser ? "message-bubble--user" : "message-bubble--agent"
        }`}
      >
        {message.text}
      </div>
    </div>
  );
}
