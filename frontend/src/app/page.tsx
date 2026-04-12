"use client";

import { useState, useCallback, useRef } from "react";
import { v4 as uuidv4 } from "uuid";
import ChatInterface from "@/components/ChatInterface";
import NegotiationLog from "@/components/NegotiationLog";
import EscrowCard from "@/components/EscrowCard";
import VerificationPanel from "@/components/VerificationPanel";
import type {
  ShipmentIntent, LiveMarketData, CarrierQuote,
  NegotiationMessage, NegotiationResult,
  EscrowInfo, DeliverResponse, VerifyReleaseResponse,
  AppStage,
} from "@/lib/types";
import {
  startNegotiationStream, createEscrow,
  submitDelivery, verifyAndRelease,
} from "@/lib/api";

export default function Home() {
  const sessionId = useRef(uuidv4()).current;
  const [stage, setStage] = useState<AppStage>("chat");
  const [intent, setIntent] = useState<ShipmentIntent | null>(null);
  const [market, setMarket] = useState<LiveMarketData | null>(null);
  const [quotes, setQuotes] = useState<CarrierQuote[]>([]);
  const [negMessages, setNegMessages] = useState<NegotiationMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [negResult, setNegResult] = useState<NegotiationResult | null>(null);
  const [escrow, setEscrow] = useState<EscrowInfo | null>(null);
  const [delivery, setDelivery] = useState<DeliverResponse | null>(null);
  const [verifyResult, setVerifyResult] = useState<VerifyReleaseResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // ── Intent collected ────────────────────────────────────────────────────────
  const handleIntentCollected = useCallback((i: ShipmentIntent) => {
    setIntent(i);
    setStage("quotes");
  }, []);

  // ── Start Negotiation (SSE) ──────────────────────────────────────────────────
  const handleStartNegotiation = useCallback(() => {
    if (!intent) return;
    setStage("negotiating");
    setIsStreaming(true);
    setNegMessages([]);
    setError(null);

    let finalMessages: NegotiationMessage[] = [];
    let finalMarket: LiveMarketData | null = null;
    let finalQuotes: CarrierQuote[] = [];

    startNegotiationStream(
      intent,
      (m) => { setMarket(m); finalMarket = m; },
      (q) => { setQuotes(q); finalQuotes = q; },
      (msg) => {
        setNegMessages((prev) => [...prev, msg]);
        finalMessages.push(msg);
      },
      () => {
        setIsStreaming(false);
        setStage("negotiated");

        // Build NegotiationResult from accumulated messages
        const lastAccept = [...finalMessages].reverse().find(
          (m) => m.status === "accept" && m.offer_price_inr
        );
        const finalPrice = lastAccept?.offer_price_inr ?? finalQuotes[0]?.price_inr ?? 0;
        const algoRate = finalMarket?.algo_inr_rate ?? 18.5;
        const finalAlgo = finalPrice / algoRate;
        const winnerCarrierId = finalMessages.find((m) => m.carrier_id)?.carrier_id;
        const winner = finalQuotes.find((q) => q.carrier_id === winnerCarrierId) ?? finalQuotes[0];

        setNegResult({
          agreed: true,
          final_price_inr: finalPrice,
          final_price_algo: Math.round(finalAlgo * 10000) / 10000,
          winning_carrier: winner,
          rounds: finalMessages.filter((m) => m.sender !== "system").length,
          messages: finalMessages,
        });
      },
      (e) => {
        setIsStreaming(false);
        setError("Negotiation stream error. Check backend connection.");
        setStage("quotes");
      },
    );
  }, [intent]);

  // ── Lock Escrow ───────────────────────────────────────────────────────────
  const handleLockEscrow = useCallback(async () => {
    if (!intent || !negResult) return;
    setStage("escrowing");
    setLoading(true);
    setError(null);
    try {
      const info = await createEscrow(sessionId, negResult, intent);
      setEscrow(info);
      setStage("escrowed");
    } catch (e: any) {
      setError(e.message || "Failed to create escrow");
      setStage("negotiated");
    } finally {
      setLoading(false);
    }
  }, [intent, negResult, sessionId]);

  // ── Submit Delivery ───────────────────────────────────────────────────────
  const handleDeliver = useCallback(async () => {
    if (!intent || !negResult || !escrow) return;
    setStage("delivering");
    setLoading(true);
    setError(null);
    try {
      const res = await submitDelivery(
        escrow.app_id,
        negResult.winning_carrier.carrier_id,
        intent,
        negResult,
      );
      setDelivery(res);
      setStage("delivered");
    } catch (e: any) {
      setError(e.message || "Failed to submit delivery");
      setStage("escrowed");
    } finally {
      setLoading(false);
    }
  }, [intent, negResult, escrow]);

  // ── Verify & Release ──────────────────────────────────────────────────────
  const handleVerifyRelease = useCallback(async () => {
    if (!intent || !negResult || !escrow || !delivery || !market) return;
    setStage("verifying");
    setLoading(true);
    setError(null);
    try {
      const res = await verifyAndRelease(
        escrow.app_id,
        delivery.delivery_receipt,
        intent,
        negResult,
        market,
      );
      setVerifyResult(res);
      setStage(res.released ? "settled" : "refunded");
      if (escrow) setEscrow({ ...escrow, status: res.released ? "SETTLED" : "REFUNDED" });
    } catch (e: any) {
      setError(e.message || "Failed to verify/release");
      setStage("delivered");
    } finally {
      setLoading(false);
    }
  }, [intent, negResult, escrow, delivery, market]);

  // ── Step labels ───────────────────────────────────────────────────────────
  const stepDone = (s: AppStage) => {
    const order: AppStage[] = [
      "chat", "quotes", "negotiating", "negotiated",
      "escrowing", "escrowed", "delivering", "delivered",
      "verifying", "settled",
    ];
    return order.indexOf(stage) > order.indexOf(s);
  };

  return (
    <div className="min-h-screen bg-algo-dark text-algo-text flex flex-col">
      {/* Header */}
      <header className="border-b border-algo-border px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-algo-text">A2A Freight Commerce</h1>
          <p className="text-xs text-algo-muted">Autonomous agent-to-agent shipping negotiation</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs bg-algo-card border border-algo-border px-3 py-1.5 rounded-full text-algo-muted">
            Algorand Testnet
          </span>
          <span className="w-2 h-2 rounded-full bg-algo-green animate-pulse" />
        </div>
      </header>

      {/* Progress steps */}
      <div className="border-b border-algo-border px-6 py-3">
        <div className="flex items-center gap-1 text-xs overflow-x-auto">
          {[
            { key: "chat", label: "1. Intent" },
            { key: "quotes", label: "2. Negotiate" },
            { key: "escrowed", label: "3. Lock Escrow" },
            { key: "delivered", label: "4. Deliver" },
            { key: "settled", label: "5. Settle" },
          ].map(({ key, label }, i) => (
            <div key={key} className="flex items-center gap-1 flex-shrink-0">
              <span className={`px-2 py-1 rounded ${
                stage === key || stepDone(key as AppStage)
                  ? "bg-algo-green/20 text-algo-green"
                  : "text-algo-muted"
              }`}>
                {label}
              </span>
              {i < 4 && <span className="text-algo-border">›</span>}
            </div>
          ))}
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="mx-4 mt-3 p-3 bg-red-900/30 border border-red-700 rounded-lg text-sm text-red-400">
          {error}
          <button onClick={() => setError(null)} className="ml-2 text-red-300 hover:text-red-100">✕</button>
        </div>
      )}

      {/* Main layout */}
      <div className="flex-1 flex gap-0 overflow-hidden">
        {/* Left: Chat */}
        <div className="w-[380px] flex-shrink-0 border-r border-algo-border flex flex-col" style={{ height: "calc(100vh - 116px)" }}>
          <ChatInterface
            sessionId={sessionId}
            onIntentCollected={handleIntentCollected}
            disabled={stage !== "chat"}
          />
        </div>

        {/* Center: Negotiation */}
        <div className="flex-1 flex flex-col border-r border-algo-border overflow-hidden" style={{ height: "calc(100vh - 116px)" }}>
          {/* Negotiation log */}
          <div className="flex-1 overflow-hidden">
            <NegotiationLog
              messages={negMessages}
              market={market ?? undefined}
              quotes={quotes.length > 0 ? quotes : undefined}
              isStreaming={isStreaming}
            />
          </div>

          {/* Action buttons */}
          <div className="border-t border-algo-border p-3 flex flex-wrap gap-2">
            <button
              onClick={handleStartNegotiation}
              disabled={stage !== "quotes" || loading}
              className="px-4 py-2 bg-blue-700 hover:bg-blue-600 text-white rounded-lg text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {stage === "negotiating" ? "Negotiating..." : "Start Negotiation"}
            </button>

            <button
              onClick={handleLockEscrow}
              disabled={stage !== "negotiated" || loading}
              className="px-4 py-2 bg-yellow-700 hover:bg-yellow-600 text-white rounded-lg text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {stage === "escrowing" ? "Locking..." : `Lock Escrow${negResult ? ` (${negResult.final_price_algo} ALGO)` : ""}`}
            </button>

            <button
              onClick={handleDeliver}
              disabled={stage !== "escrowed" || loading}
              className="px-4 py-2 bg-purple-700 hover:bg-purple-600 text-white rounded-lg text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {stage === "delivering" ? "Delivering..." : "Carrier Delivers"}
            </button>

            <button
              onClick={handleVerifyRelease}
              disabled={stage !== "delivered" || loading}
              className="px-4 py-2 bg-algo-green hover:bg-algo-green/90 text-algo-dark rounded-lg text-sm font-bold disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {stage === "verifying" ? "Verifying..." : "Verify & Release"}
            </button>
          </div>
        </div>

        {/* Right: Escrow + Verification */}
        <div className="w-[340px] flex-shrink-0 flex flex-col gap-3 p-3 overflow-y-auto scrollbar-thin" style={{ height: "calc(100vh - 116px)" }}>
          {/* Shipment summary */}
          {intent && (
            <div className="bg-algo-card border border-algo-border rounded-xl p-3 text-sm space-y-1">
              <p className="text-xs text-algo-muted uppercase tracking-wider mb-2">Shipment</p>
              <p><span className="text-algo-muted">From:</span> {intent.origin_pincode} ({intent.user_type})</p>
              <p><span className="text-algo-muted">To:</span> {intent.destination_pincode}</p>
              <p><span className="text-algo-muted">Weight:</span> {intent.weight_kg} kg</p>
              <p><span className="text-algo-muted">Type:</span> {intent.package_type}</p>
              <p><span className="text-algo-muted">Budget:</span> ₹{intent.max_budget_inr}</p>
            </div>
          )}

          {/* Agreement summary */}
          {negResult && (
            <div className="bg-algo-card border border-algo-green/40 rounded-xl p-3 text-sm">
              <p className="text-xs text-algo-muted uppercase tracking-wider mb-2">Agreement</p>
              <p className="text-algo-green font-bold text-lg">₹{negResult.final_price_inr.toFixed(0)}</p>
              <p className="text-algo-muted text-xs">{negResult.final_price_algo} ALGO at live rate</p>
              <p className="text-algo-text mt-1">{negResult.winning_carrier.carrier_name}</p>
              <p className="text-algo-muted text-xs">{negResult.winning_carrier.eta_days} days · {negResult.winning_carrier.specialization}</p>
            </div>
          )}

          <EscrowCard
            escrow={escrow ?? undefined}
            deliveryHash={delivery?.delivery_hash}
            deliveryTxId={delivery?.tx_id}
            verifyResult={verifyResult ?? undefined}
            stage={stage}
          />

          <VerificationPanel
            delivery={delivery ?? undefined}
            result={verifyResult ?? undefined}
          />

          {/* Final status */}
          {(stage === "settled" || stage === "refunded") && (
            <div className={`rounded-xl p-4 text-center font-bold text-lg ${
              stage === "settled"
                ? "bg-algo-green/10 border border-algo-green text-algo-green"
                : "bg-red-900/20 border border-red-700 text-red-400"
            }`}>
              {stage === "settled" ? "✓ Payment Settled on Algorand" : "⚠ Buyer Refunded"}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
