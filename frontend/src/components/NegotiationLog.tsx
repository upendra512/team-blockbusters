"use client";

import { useEffect, useRef } from "react";
import type { NegotiationMessage, LiveMarketData, CarrierQuote } from "@/lib/types";

interface NegotiationLogProps {
  messages: NegotiationMessage[];
  market?: LiveMarketData;
  quotes?: CarrierQuote[];
  isStreaming: boolean;
}

const SENDER_STYLES: Record<string, string> = {
  buyer: "bg-blue-900/40 border-blue-700 ml-4",
  seller: "bg-purple-900/40 border-purple-700 mr-4",
  system: "bg-algo-dark border-algo-border text-center",
};

const SENDER_LABEL: Record<string, string> = {
  buyer: "Buyer Agent",
  seller: "Carrier Agent",
  system: "System",
};

export default function NegotiationLog({
  messages, market, quotes, isStreaming,
}: NegotiationLogProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div className="flex flex-col h-full">
      {/* Market data bar */}
      {market && (
        <div className="flex flex-wrap gap-3 p-3 bg-algo-dark border-b border-algo-border text-xs">
          <span className="text-algo-muted">
            Route: <span className="text-algo-text">{market.origin_city} → {market.destination_city}</span>
          </span>
          <span className="text-algo-muted">
            Distance: <span className="text-algo-green">{market.distance_km} km</span>
          </span>
          <span className="text-algo-muted">
            Diesel: <span className="text-algo-green">₹{market.diesel_price_inr}/L</span>
          </span>
          <span className="text-algo-muted">
            ALGO: <span className="text-algo-green">₹{market.algo_inr_rate}</span>
          </span>
          <span className="text-algo-muted">
            Weather: <span className="text-algo-text">{market.weather_description}</span>
          </span>
        </div>
      )}

      {/* Quotes row */}
      {quotes && quotes.length > 0 && (
        <div className="flex gap-2 p-3 border-b border-algo-border overflow-x-auto">
          {quotes.map((q) => (
            <div
              key={q.carrier_id}
              className="flex-shrink-0 bg-algo-card border border-algo-border rounded-lg px-3 py-2 text-xs"
            >
              <p className="font-semibold text-algo-text">{q.carrier_name}</p>
              <p className="text-algo-green font-bold">₹{q.price_inr.toFixed(0)}</p>
              <p className="text-algo-muted">{q.eta_days}d · {q.specialization}</p>
            </div>
          ))}
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2 scrollbar-thin">
        {messages.length === 0 && !isStreaming && (
          <p className="text-algo-muted text-sm text-center py-8">
            Negotiation will appear here after shipment details are collected.
          </p>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            className={`border rounded-lg px-3 py-2 text-sm ${SENDER_STYLES[msg.sender]}`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-semibold text-algo-muted">
                {SENDER_LABEL[msg.sender]}
                {msg.carrier_id && ` (${msg.carrier_id})`}
              </span>
              {msg.offer_price_inr && (
                <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                  msg.status === "accept"
                    ? "bg-algo-green/20 text-algo-green"
                    : "bg-yellow-900/30 text-yellow-300"
                }`}>
                  ₹{msg.offer_price_inr.toFixed(0)}
                  {msg.status === "accept" && " ✓"}
                </span>
              )}
            </div>
            <p className="text-algo-text">{msg.content}</p>
          </div>
        ))}

        {isStreaming && (
          <div className="flex gap-1 justify-center py-2">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="w-2 h-2 rounded-full bg-algo-green animate-bounce"
                style={{ animationDelay: `${i * 0.15}s` }}
              />
            ))}
          </div>
        )}

        <div ref={bottomRef} />
      </div>
    </div>
  );
}
