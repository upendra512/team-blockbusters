"use client";

import { useState, useRef, useEffect, KeyboardEvent } from "react";
import type { ShipmentIntent } from "@/lib/types";
import { sendChatMessage } from "@/lib/api";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface ChatInterfaceProps {
  sessionId: string;
  onIntentCollected: (intent: ShipmentIntent) => void;
  disabled?: boolean;
}

export default function ChatInterface({
  sessionId, onIntentCollected, disabled,
}: ChatInterfaceProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content:
        "Hello! I'm your AI freight booking assistant. Tell me what you need to ship and I'll help you find the best carrier rates.\n\nExample: \"I need to ship 20kg of clothing from Mumbai to Delhi\"",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || loading || disabled) return;

    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: text }]);
    setLoading(true);

    try {
      const res = await sendChatMessage(text, sessionId);
      setMessages((prev) => [...prev, { role: "assistant", content: res.reply }]);

      if (res.shipment_ready && res.shipment_intent) {
        onIntentCollected(res.shipment_intent);
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Sorry, I encountered an error. Please try again." },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-algo-border">
        <h2 className="font-semibold text-algo-text">Intent Agent</h2>
        <p className="text-xs text-algo-muted">Describe your shipment requirement</p>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-thin">
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[85%] rounded-xl px-4 py-2 text-sm whitespace-pre-wrap ${
                msg.role === "user"
                  ? "bg-algo-green/20 text-algo-text border border-algo-green/30"
                  : "bg-algo-card border border-algo-border text-algo-text"
              }`}
            >
              {msg.content}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-algo-card border border-algo-border rounded-xl px-4 py-2">
              <div className="flex gap-1">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="w-1.5 h-1.5 rounded-full bg-algo-muted animate-bounce"
                    style={{ animationDelay: `${i * 0.15}s` }}
                  />
                ))}
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="p-3 border-t border-algo-border">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder={disabled ? "Shipment details collected ✓" : "Type your message..."}
            disabled={loading || disabled}
            className="flex-1 bg-algo-dark border border-algo-border rounded-lg px-3 py-2 text-sm text-algo-text placeholder-algo-muted focus:outline-none focus:border-algo-green disabled:opacity-50"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || loading || disabled}
            className="px-4 py-2 bg-algo-green text-algo-dark font-semibold rounded-lg text-sm disabled:opacity-40 hover:bg-algo-green/90 transition-colors"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
