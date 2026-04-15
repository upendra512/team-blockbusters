"use client";

import { useEffect, useRef } from "react";
import type { NegotiationMessage, LiveMarketData, CarrierQuote } from "@/lib/types";

interface NegotiationLogProps {
  messages: NegotiationMessage[];
  market?: LiveMarketData;
  quotes?: CarrierQuote[];
  isStreaming: boolean;
}

// Ocean Blue for carrier (replacing purple), deeper blue for buyer
const MESSAGE_STYLES: Record<string, { wrap: string; label: string; badge: string }> = {
  buyer: {
    wrap:  "bg-blue-950/40 border-blue-800/50 mr-6",
    label: "text-blue-400",
    badge: "bg-blue-900/60 text-blue-300",
  },
  seller: {
    wrap:  "bg-sky-950/40 border-sky-800/50 ml-6",
    label: "text-sky-400",
    badge: "bg-sky-900/60 text-sky-300",
  },
  system: {
    wrap:  "bg-zinc-900/50 border-zinc-800/60 mx-2",
    label: "text-zinc-500",
    badge: "bg-zinc-800 text-zinc-400",
  },
};

const SENDER_LABEL: Record<string, string> = {
  buyer:  "Buyer Agent",
  seller: "Carrier Agent",
  system: "System",
};

export default function NegotiationLog({ messages, market, quotes, isStreaming }: NegotiationLogProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div className="flex flex-col h-full bg-zinc-950">

      {/* Live market data ticker */}
      {market && (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 px-5 py-3 bg-zinc-900/60 border-b border-zinc-800/70 text-xs">
          <span className="text-zinc-500 font-medium">
            {market.origin_city}
            <span className="text-zinc-600 mx-1">→</span>
            {market.destination_city}
          </span>
          <Stat label="Distance"  value={`${market.distance_km} km`} />
          <Stat label="Diesel"    value={`₹${market.diesel_price_inr}/L`} />
          <Stat label="ALGO"      value={`₹${market.algo_inr_rate}`} />
          <Stat label="Weather"   value={market.weather_description} subtle />
        </div>
      )}

      {/* Quote cards */}
      {quotes && quotes.length > 0 && (
        <div className="flex gap-2.5 px-4 py-3 border-b border-zinc-800/70 overflow-x-auto">
          {quotes.map((q) => (
            <div
              key={q.carrier_id}
              className="flex-shrink-0 bg-zinc-900 border border-zinc-800 hover:border-zinc-700 rounded-2xl px-4 py-2.5 text-xs transition-colors cursor-default"
            >
              <p className="font-semibold text-zinc-100 mb-0.5">{q.carrier_name}</p>
              <p className="text-emerald-400 font-bold text-sm">₹{q.price_inr.toFixed(0)}</p>
              <p className="text-zinc-500 mt-0.5">{q.eta_days}d · {q.specialization}</p>
            </div>
          ))}
        </div>
      )}

      {/* Message feed */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2.5 scrollbar-thin">
        {messages.length === 0 && !isStreaming && (
          <div className="flex flex-col items-center justify-center h-full gap-3 py-16 text-center">
            <div className="w-10 h-10 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center">
              <svg width="18" height="18" fill="none" stroke="#52525b" strokeWidth="1.5" viewBox="0 0 24 24">
                <path d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <div>
              <p className="text-zinc-400 text-sm font-medium">No negotiations yet</p>
              <p className="text-zinc-600 text-xs mt-1">Complete the intent step, then click Start Negotiation</p>
            </div>
          </div>
        )}

        {messages.map((msg, i) => {
          const style = MESSAGE_STYLES[msg.sender] ?? MESSAGE_STYLES.system;
          const isAccept = msg.status === "accept";

          return (
            <div key={i} className={`border rounded-2xl px-4 py-3 text-sm ${style.wrap}`}>
              <div className="flex items-center justify-between mb-2">
                <span className={`text-xs font-semibold ${style.label}`}>
                  {SENDER_LABEL[msg.sender]}
                  {msg.carrier_id && (
                    <span className="text-zinc-600 font-normal ml-1">({msg.carrier_id})</span>
                  )}
                </span>
                {msg.offer_price_inr && (
                  <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                    isAccept
                      ? "bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/30"
                      : "bg-amber-500/10 text-amber-400"
                  }`}>
                    ₹{msg.offer_price_inr.toFixed(0)}
                    {isAccept && (
                      <span className="ml-1 text-emerald-400">✓</span>
                    )}
                  </span>
                )}
              </div>
              <p className="text-zinc-300 leading-relaxed">{msg.content}</p>
            </div>
          );
        })}

        {/* Streaming indicator */}
        {isStreaming && (
          <div className="flex items-center gap-2 px-4 py-3">
            <div className="flex gap-1">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-bounce"
                  style={{ animationDelay: `${i * 0.18}s` }}
                />
              ))}
            </div>
            <span className="text-xs text-zinc-500">Agents negotiating…</span>
          </div>
        )}

        <div ref={bottomRef} />
      </div>
    </div>
  );
}

function Stat({ label, value, subtle }: { label: string; value: string; subtle?: boolean }) {
  return (
    <span className="text-zinc-600">
      {label}:{" "}
      <span className={subtle ? "text-zinc-500" : "text-emerald-400 font-medium"}>
        {value}
      </span>
    </span>
  );
}
