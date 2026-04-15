"use client";

import { useState, useCallback, useRef } from "react";
import { v4 as uuidv4 } from "uuid";
import toast from "react-hot-toast";
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

// ── Progress step definition ──────────────────────────────────────────────────
const STEPS: { key: AppStage; label: string }[] = [
  { key: "chat",      label: "Intent"   },
  { key: "quotes",    label: "Negotiate"},
  { key: "escrowed",  label: "Escrow"   },
  { key: "delivered", label: "Deliver"  },
  { key: "settled",   label: "Settle"   },
];

const STAGE_ORDER: AppStage[] = [
  "chat","quotes","negotiating","negotiated",
  "escrowing","escrowed","delivering","delivered",
  "verifying","settled",
];

function getStepIndex(stage: AppStage) {
  // Map to the nearest progress step
  const map: Record<AppStage, number> = {
    chat: 0, quotes: 1, negotiating: 1, negotiated: 1,
    escrowing: 2, escrowed: 2, delivering: 3, delivered: 3,
    verifying: 4, settled: 4, refunded: 4,
  };
  return map[stage] ?? 0;
}

export default function Home() {
  const sessionId = useRef(uuidv4()).current;
  const [stage, setStage]           = useState<AppStage>("chat");
  const [intent, setIntent]         = useState<ShipmentIntent | null>(null);
  const [market, setMarket]         = useState<LiveMarketData | null>(null);
  const [quotes, setQuotes]         = useState<CarrierQuote[]>([]);
  const [negMessages, setNegMessages] = useState<NegotiationMessage[]>([]);
  const [isStreaming, setIsStreaming]  = useState(false);
  const [negResult, setNegResult]   = useState<NegotiationResult | null>(null);
  const [escrow, setEscrow]         = useState<EscrowInfo | null>(null);
  const [delivery, setDelivery]     = useState<DeliverResponse | null>(null);
  const [verifyResult, setVerifyResult] = useState<VerifyReleaseResponse | null>(null);
  const [loading, setLoading]       = useState(false);

  const activeStep = getStepIndex(stage);

  // ── Intent collected ────────────────────────────────────────────────────────
  const handleIntentCollected = useCallback((i: ShipmentIntent) => {
    setIntent(i);
    setStage("quotes");
    toast.success("Shipment details collected!", { icon: "📦" });
  }, []);

  // ── Start Negotiation ───────────────────────────────────────────────────────
  const handleStartNegotiation = useCallback(() => {
    if (!intent) return;
    setStage("negotiating");
    setIsStreaming(true);
    setNegMessages([]);

    let finalMessages: NegotiationMessage[] = [];
    let finalMarket:   LiveMarketData | null = null;
    let finalQuotes:   CarrierQuote[]        = [];

    const id = toast.loading("Fetching live quotes & starting negotiation…");

    startNegotiationStream(
      intent,
      (m) => { setMarket(m);  finalMarket  = m; },
      (q) => { setQuotes(q);  finalQuotes  = q; },
      (msg) => {
        setNegMessages((prev) => [...prev, msg]);
        finalMessages.push(msg);
      },
      () => {
        setIsStreaming(false);
        setStage("negotiated");
        toast.success("Agreement reached! Ready to lock escrow.", { id, icon: "🤝" });

        const lastAccept = [...finalMessages].reverse()
          .find((m) => m.status === "accept" && m.offer_price_inr);
        const finalPrice   = lastAccept?.offer_price_inr ?? finalQuotes[0]?.price_inr ?? 0;
        const algoRate     = finalMarket?.algo_inr_rate ?? 18.5;
        const finalAlgo    = finalPrice / algoRate;
        const winnerCarrierId = finalMessages.find((m) => m.carrier_id)?.carrier_id;
        const winner       = finalQuotes.find((q) => q.carrier_id === winnerCarrierId) ?? finalQuotes[0];

        setNegResult({
          agreed: true,
          final_price_inr: finalPrice,
          final_price_algo: Math.round(finalAlgo * 10000) / 10000,
          winning_carrier: winner,
          rounds: finalMessages.filter((m) => m.sender !== "system").length,
          messages: finalMessages,
        });
      },
      () => {
        setIsStreaming(false);
        setStage("quotes");
        toast.error("Negotiation stream failed. Check backend connection.", { id });
      },
    );
  }, [intent]);

  // ── Lock Escrow ─────────────────────────────────────────────────────────────
  const handleLockEscrow = useCallback(async () => {
    if (!intent || !negResult) return;
    setStage("escrowing");
    setLoading(true);

    const id = toast.loading("Deploying escrow contract on Algorand…");

    try {
      const info = await createEscrow(sessionId, negResult, intent);
      setEscrow(info);
      setStage("escrowed");
      toast.success(
        `Escrow locked — ${info.amount_algo} ALGO secured on-chain.`,
        { id, icon: "🔒", duration: 5000 }
      );
    } catch (e: any) {
      setStage("negotiated");
      toast.error(e.message || "Failed to create escrow.", { id });
    } finally {
      setLoading(false);
    }
  }, [intent, negResult, sessionId]);

  // ── Carrier Delivers ────────────────────────────────────────────────────────
  const handleDeliver = useCallback(async () => {
    if (!intent || !negResult || !escrow) return;
    setStage("delivering");
    setLoading(true);

    const id = toast.loading("Carrier agent submitting delivery receipt…");

    try {
      const res = await submitDelivery(
        escrow.app_id, negResult.winning_carrier.carrier_id, intent, negResult,
      );
      setDelivery(res);
      setStage("delivered");
      toast.success("Delivery receipt stored on-chain.", { id, icon: "🚚" });
    } catch (e: any) {
      setStage("escrowed");
      toast.error(e.message || "Failed to submit delivery.", { id });
    } finally {
      setLoading(false);
    }
  }, [intent, negResult, escrow]);

  // ── Verify & Release ────────────────────────────────────────────────────────
  const handleVerifyRelease = useCallback(async () => {
    if (!intent || !negResult || !escrow || !delivery || !market) return;
    setStage("verifying");
    setLoading(true);

    const id = toast.loading("Running AI verification checks…");

    try {
      const res = await verifyAndRelease(
        escrow.app_id, delivery.delivery_receipt, intent, negResult, market,
      );
      setVerifyResult(res);
      const settled = res.released;
      setStage(settled ? "settled" : "refunded");
      if (escrow) setEscrow({ ...escrow, status: settled ? "SETTLED" : "REFUNDED" });

      if (settled) {
        toast.success("Payment released! Funds transferred to carrier.", {
          id, icon: "✅", duration: 6000,
        });
      } else {
        toast.error("Verification failed — buyer refunded.", { id, duration: 6000 });
      }
    } catch (e: any) {
      setStage("delivered");
      toast.error(e.message || "Verification failed.", { id });
    } finally {
      setLoading(false);
    }
  }, [intent, negResult, escrow, delivery, market]);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col">

      {/* ── Top bar ──────────────────────────────────────────────────────────── */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-zinc-800/70 bg-zinc-950/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="flex items-center gap-3">
          {/* Algorand-style logo mark */}
          <div className="w-8 h-8 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center flex-shrink-0">
            <div className="w-3 h-3 rounded-full bg-emerald-400" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-zinc-100 leading-none">A2A Freight Commerce</h1>
            <p className="text-[11px] text-zinc-500 mt-0.5">Autonomous agent-to-agent shipping negotiation</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-zinc-900 border border-zinc-800 text-[11px] text-zinc-400">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Algorand Testnet
          </div>
        </div>
      </header>

      {/* ── Progress stepper ─────────────────────────────────────────────────── */}
      <div className="px-6 py-5 border-b border-zinc-800/70 bg-zinc-900/30">
        <div className="flex items-center justify-between max-w-lg mx-auto">
          {STEPS.map((step, i) => {
            const done   = activeStep > i;
            const active = activeStep === i;
            return (
              <div key={step.key} className="flex items-center flex-1 last:flex-none">
                {/* Circle */}
                <div className="flex flex-col items-center gap-1.5 flex-shrink-0">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ring-2 ring-offset-2 ring-offset-zinc-900 ${
                    done
                      ? "bg-emerald-500 text-zinc-950 ring-emerald-500/40"
                      : active
                        ? "bg-emerald-500/15 text-emerald-400 ring-emerald-500/40 border border-emerald-500/50"
                        : "bg-zinc-800 text-zinc-600 ring-transparent border border-zinc-700"
                  }`}>
                    {done ? (
                      <svg width="10" height="10" viewBox="0 0 12 10" fill="currentColor">
                        <path d="M1 5l3.5 3.5L11 1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none"/>
                      </svg>
                    ) : (
                      i + 1
                    )}
                  </div>
                  <span className={`text-[10px] font-medium transition-colors ${
                    active ? "text-emerald-400" : done ? "text-zinc-400" : "text-zinc-600"
                  }`}>
                    {step.label}
                  </span>
                </div>
                {/* Connector line */}
                {i < STEPS.length - 1 && (
                  <div className="flex-1 h-px mx-2 mt-[-10px] transition-all duration-500 bg-zinc-800 relative overflow-hidden rounded-full">
                    {done && (
                      <div className="absolute inset-0 bg-emerald-500/50 rounded-full" />
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Main 3-column layout ─────────────────────────────────────────────── */}
      <div className="flex-1 flex overflow-hidden" style={{ height: "calc(100vh - 130px)" }}>

        {/* Left — Chat */}
        <div className="w-[360px] flex-shrink-0 border-r border-zinc-800/70 flex flex-col overflow-hidden">
          <ChatInterface
            sessionId={sessionId}
            onIntentCollected={handleIntentCollected}
            disabled={stage !== "chat"}
          />
        </div>

        {/* Center — Negotiation */}
        <div className="flex-1 flex flex-col border-r border-zinc-800/70 overflow-hidden">
          <div className="flex-1 overflow-hidden">
            <NegotiationLog
              messages={negMessages}
              market={market ?? undefined}
              quotes={quotes.length > 0 ? quotes : undefined}
              isStreaming={isStreaming}
            />
          </div>

          {/* Action buttons */}
          <div className="border-t border-zinc-800/70 px-4 py-3 bg-zinc-900/50 flex flex-wrap gap-2">
            <ActionBtn
              label="Start Negotiation"
              loadingLabel="Negotiating…"
              isLoading={stage === "negotiating"}
              disabled={stage !== "quotes" || loading}
              onClick={handleStartNegotiation}
              variant="blue"
            />
            <ActionBtn
              label={`Lock Escrow${negResult ? ` · ${negResult.final_price_algo} ALGO` : ""}`}
              loadingLabel="Deploying…"
              isLoading={stage === "escrowing"}
              disabled={stage !== "negotiated" || loading}
              onClick={handleLockEscrow}
              variant="amber"
            />
            <ActionBtn
              label="Carrier Delivers"
              loadingLabel="Submitting…"
              isLoading={stage === "delivering"}
              disabled={stage !== "escrowed" || loading}
              onClick={handleDeliver}
              variant="sky"
            />
            <ActionBtn
              label="Verify & Release"
              loadingLabel="Verifying…"
              isLoading={stage === "verifying"}
              disabled={stage !== "delivered" || loading}
              onClick={handleVerifyRelease}
              variant="emerald"
            />
          </div>
        </div>

        {/* Right — Details panel */}
        <div className="w-[320px] flex-shrink-0 overflow-y-auto scrollbar-thin bg-zinc-950 p-4 space-y-3">

          {/* Shipment summary */}
          {intent && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
              <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest mb-3">Shipment</p>
              <div className="space-y-2 text-xs">
                <Row label="Origin"  value={`${intent.origin_pincode} (${intent.user_type})`} />
                <Row label="Dest."   value={intent.destination_pincode} />
                <Row label="Weight"  value={`${intent.weight_kg} kg`} />
                <Row label="Type"    value={intent.package_type} />
                <Row label="Budget"  value={`₹${intent.max_budget_inr}`} highlight />
              </div>
            </div>
          )}

          {/* Agreement card */}
          {negResult && (
            <div className="bg-zinc-900 border border-emerald-500/25 rounded-2xl p-4">
              <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest mb-3">Agreement</p>
              <div className="flex items-end justify-between mb-2">
                <div>
                  <p className="text-2xl font-bold text-zinc-100 leading-none">
                    ₹{negResult.final_price_inr.toFixed(0)}
                  </p>
                  <p className="text-xs text-emerald-400 mt-1">
                    {negResult.final_price_algo} ALGO at live rate
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-semibold text-zinc-200">{negResult.winning_carrier.carrier_name}</p>
                  <p className="text-[11px] text-zinc-500 mt-0.5">
                    {negResult.winning_carrier.eta_days}d · {negResult.winning_carrier.specialization}
                  </p>
                </div>
              </div>
              <div className="text-[10px] text-zinc-600">
                {negResult.rounds} negotiation rounds
              </div>
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

          {/* Final settlement banner */}
          {(stage === "settled" || stage === "refunded") && (
            <div className={`rounded-2xl p-4 text-center space-y-1 border ${
              stage === "settled"
                ? "bg-emerald-500/8 border-emerald-500/25"
                : "bg-red-500/8 border-red-500/25"
            }`}>
              <p className={`text-lg font-bold ${
                stage === "settled" ? "text-emerald-400" : "text-red-400"
              }`}>
                {stage === "settled" ? "Payment Settled" : "Buyer Refunded"}
              </p>
              <p className="text-xs text-zinc-500">
                {stage === "settled"
                  ? "Funds released to carrier on Algorand"
                  : "Funds returned to buyer on Algorand"}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Small reusable components ─────────────────────────────────────────────────

function Row({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-zinc-600">{label}</span>
      <span className={`font-medium truncate ${highlight ? "text-emerald-400" : "text-zinc-200"}`}>
        {value}
      </span>
    </div>
  );
}

const BUTTON_VARIANTS = {
  blue:    "bg-blue-600   hover:bg-blue-500   text-white",
  amber:   "bg-amber-600  hover:bg-amber-500  text-white",
  sky:     "bg-sky-600    hover:bg-sky-500    text-white",
  emerald: "bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold",
} as const;

function ActionBtn({
  label, loadingLabel, isLoading, disabled, onClick, variant,
}: {
  label: string; loadingLabel: string; isLoading: boolean;
  disabled: boolean; onClick: () => void;
  variant: keyof typeof BUTTON_VARIANTS;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || isLoading}
      className={`
        flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold
        transition-all active:scale-95 disabled:opacity-35 disabled:cursor-not-allowed
        ${BUTTON_VARIANTS[variant]}
      `}
    >
      {isLoading && (
        <svg className="animate-spin w-3 h-3" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z"/>
        </svg>
      )}
      {isLoading ? loadingLabel : label}
    </button>
  );
}
