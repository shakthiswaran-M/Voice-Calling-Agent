import { useState } from "react";
import ChatWindow from "../components/ChatWindow";
import InputBox from "../components/InputBox";
import { sendMessage } from "../services/chatService";
import type { Message } from "../types";

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isSending, setIsSending] = useState(false);

  const  handleSend = async (text: string) => {
    const userMessage: Message = {
      id: crypto.randomUUID(),
      sender: "user",
      text,
    };
    setMessages((prev) => [...prev, userMessage]);
    setIsSending(true);

    try {
      const reply = await sendMessage(text);
      const agentMessage: Message = {
        id: crypto.randomUUID(),
        sender: "agent",
        text: reply.text,
      };
      setMessages((prev) => [...prev, agentMessage]);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="chat-page">
      <ChatWindow messages={messages} />
      <InputBox onSend={handleSend} disabled={isSending} />
    </div>
  );
}
