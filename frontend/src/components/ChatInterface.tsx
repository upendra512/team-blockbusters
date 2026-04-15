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
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Sorry, I encountered an error. Please try again." },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  return (
    <div className="flex flex-col h-full bg-zinc-950">
      {/* Panel header */}
      <div className="px-5 py-4 border-b border-zinc-800/70">
        <div className="flex items-center gap-2 mb-0.5">
          {/* Agent indicator dot */}
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <h2 className="text-sm font-semibold text-zinc-100">Intent Agent</h2>
        </div>
        <p className="text-xs text-zinc-500 ml-4">Describe your shipment in plain language</p>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-5 space-y-4 scrollbar-thin">
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            {/* Avatar dot for assistant */}
            {msg.role === "assistant" && (
              <div className="w-6 h-6 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex-shrink-0 mt-0.5 mr-2 flex items-center justify-center">
                <span className="text-[9px] text-emerald-400 font-bold">AI</span>
              </div>
            )}
            <div
              className={`max-w-[82%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                msg.role === "user"
                  ? "bg-sky-600/20 text-zinc-100 border border-sky-600/30 rounded-br-md"
                  : "bg-zinc-900 text-zinc-200 border border-zinc-800 rounded-bl-md"
              }`}
            >
              {msg.content}
            </div>
          </div>
        ))}

        {/* Typing indicator */}
        {loading && (
          <div className="flex justify-start items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex-shrink-0 flex items-center justify-center">
              <span className="text-[9px] text-emerald-400 font-bold">AI</span>
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl rounded-bl-md px-4 py-3">
              <div className="flex gap-1 items-center h-4">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="w-1.5 h-1.5 rounded-full bg-zinc-500 animate-bounce"
                    style={{ animationDelay: `${i * 0.18}s` }}
                  />
                ))}
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      <div className="px-4 pb-4 pt-3 border-t border-zinc-800/70">
        {disabled && (
          <p className="text-xs text-emerald-400 mb-2 flex items-center gap-1.5">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
              <path d="M10.28 2.28L4 8.56 1.72 6.28A1 1 0 00.28 7.72l3 3a1 1 0 001.44 0l7-7a1 1 0 00-1.44-1.44z"/>
            </svg>
            Shipment details collected. Proceed to negotiation.
          </p>
        )}
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder={disabled ? "Details collected ✓" : "Describe your shipment…"}
            disabled={loading || disabled}
            className="flex-1 bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-emerald-500/60 focus:ring-1 focus:ring-emerald-500/20 disabled:opacity-40 transition-all"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || loading || disabled}
            className="px-4 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold rounded-xl text-sm disabled:opacity-30 disabled:cursor-not-allowed transition-all active:scale-95"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
