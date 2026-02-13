import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { useState, useRef, useEffect, type FormEvent } from "react";

interface Message {
  role: "user" | "assistant";
  content: string;
  toolStatus?: string;
}

interface SSEEvent {
  content?: string;
  error?: string;
  type?: string;
  name?: string;
  args?: Record<string, unknown>;
}

function parseSSELine(line: string): SSEEvent | null {
  if (!line.startsWith("data: ")) return null;
  const data = line.slice(6);
  if (data === "[DONE]") return null;
  try {
    return JSON.parse(data) as SSEEvent;
  } catch {
    return null;
  }
}

function ToolStatusIndicator({ status, hasContent }: { status: string; hasContent: boolean }) {
  if (!hasContent) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground italic">
        <span className="inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
        {status}
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 text-muted-foreground italic text-xs mb-2 pb-2 border-b border-border">
      <span>Searched the web</span>
    </div>
  );
}

function MessageBubble({
  msg,
  isLast,
  isLoading,
}: {
  msg: Message;
  isLast: boolean;
  isLoading: boolean;
}) {
  const isUser = msg.role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <Card
        className={`max-w-[80%] ${
          isUser ? "bg-primary text-primary-foreground" : "bg-muted"
        }`}
      >
        <CardContent className="p-3 text-sm">
          {msg.toolStatus && <ToolStatusIndicator status={msg.toolStatus} hasContent={!!msg.content} />}
          <div className="whitespace-pre-wrap">
            {msg.content ||
              (!msg.toolStatus && isLoading && isLast ? "..." : "")}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export function Chat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [threadId, setThreadId] = useState(() => crypto.randomUUID());
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const newChat = () => {
    setMessages([]);
    setThreadId(crypto.randomUUID());
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;

    const userMessage: Message = { role: "user", content: trimmed };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput("");
    setIsLoading(true);

    const assistantMessage: Message = { role: "assistant", content: "" };
    setMessages([...newMessages, assistantMessage]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed, threadId }),
      });

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let accumulated = "";
      let toolStatus = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = decoder.decode(value, { stream: true });
        const lines = text.split("\n");

        for (const line of lines) {
          const event = parseSSELine(line);
          if (!event) continue;

          if (event.error) {
            accumulated += `\n[Error: ${event.error}]`;
            toolStatus = "";
          } else if (event.type === "tool_call") {
            toolStatus = `Searching: "${event.args?.query ?? event.name}"`;
          } else if (event.type === "tool_result") {
            toolStatus = "Generating response...";
          } else if (event.content) {
            accumulated += event.content;
          }

          setMessages([
            ...newMessages,
            { role: "assistant", content: accumulated, toolStatus },
          ]);
        }
      }
    } catch (error) {
      const errMsg =
        error instanceof Error ? error.message : "Unknown error";
      setMessages([
        ...newMessages,
        { role: "assistant", content: `Error: ${errMsg}` },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-[600px]">
      <div className="flex justify-end p-2 border-b">
        <Button variant="outline" size="sm" onClick={newChat} disabled={isLoading}>
          New Chat
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto space-y-3 p-4">
        {messages.length === 0 && (
          <p className="text-muted-foreground text-center mt-8">
            Send a message to start chatting.
          </p>
        )}
        {messages.map((msg, i) => (
          <MessageBubble
            key={i}
            msg={msg}
            isLast={i === messages.length - 1}
            isLoading={isLoading}
          />
        ))}
        <div ref={messagesEndRef} />
      </div>
      <form onSubmit={sendMessage} className="flex gap-2 p-4 border-t">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type a message..."
          disabled={isLoading}
        />
        <Button type="submit" disabled={isLoading || !input.trim()}>
          {isLoading ? "..." : "Send"}
        </Button>
      </form>
    </div>
  );
}
