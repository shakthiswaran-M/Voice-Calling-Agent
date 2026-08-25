export type Sender = "user" | "agent";

export interface Message {
  id: string;
  sender: Sender;
  text: string;
}
