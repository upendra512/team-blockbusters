"use client";

import { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { useShipment } from "@/context/ShipmentContext";
import { startNegotiationStream, createEscrow } from "@/lib/api";
import TxLink from "@/components/shared/TxLink";
import type { CarrierQuote, LiveMarketData, NegotiationMessage, NegotiationResult } from "@/lib/types";

type Phase = "init" | "streaming" | "negotiated" | "creating" | "locked";

const ESCROW_STEPS = [
  { icon: "cloud_upload",  text: "Deploying smart contract to Algorand…" },
  { icon: "account_balance", text: "Funding contract address…" },
  { icon: "lock",          text: "Locking deal on-chain…" },
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// CO2 estimate: kg per km per ton
const CO2_FACTOR: Record<string, number> = {
  express:  0.38,
  economy:  0.21,
  premium:  0.44,
};

export default function NegotiateView() {
  const ctx = useShipment();
  const { intent, sessionId } = ctx;

  const started  = useRef(false);
  const msgsRef  = useRef<NegotiationMessage[]>([]);
  const marketRef = useRef<LiveMarketData | null>(null);
  const quotesRef = useRef<CarrierQuote[]>([]);

  const [phase, setPhase]         = useState<Phase>("init");
  const [localQuotes, setLocalQuotes] = useState<CarrierQuote[]>([]);
  const [localMarket, setLocalMarket] = useState<LiveMarketData | null>(null);
  const [localMsgs, setLocalMsgs]   = useState<NegotiationMessage[]>([]);
  const [escrowStep, setEscrowStep] = useState(-1);
  const msgBottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    msgBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [localMsgs]);

  // Reset started ref on unmount so user can retry by navigating away and back
  useEffect(() => {
    return () => { started.current = false; };
  }, []);

  // Auto-start on mount
  useEffect(() => {
    if (started.current || !intent) return;
    started.current = true;
    setPhase("streaming");

    const toastId = toast.loading("Fetching live carrier quotes…");

    const es = startNegotiationStream(
      intent,
      (m) => { marketRef.current = m; ctx.setMarket(m); setLocalMarket(m); },
      (q) => {
        quotesRef.current = q; ctx.setQuotes(q); setLocalQuotes(q);
        toast.success(`${q.length} carriers evaluated`, { id: toastId, icon: "📊" });
      },
      (msg) => {
        msgsRef.current.push(msg); ctx.addNegMessage(msg);
        setLocalMsgs((p) => [...p, msg]);
      },
      async () => {
        // Build result
        const msgs   = msgsRef.current;
        const mkt    = marketRef.current!;
        const qts    = quotesRef.current;
        const last   = [...msgs].reverse().find((m) => m.status === "accept" && m.offer_price_inr);
        const price  = last?.offer_price_inr ?? qts[0]?.price_inr ?? 0;
        const rate   = mkt.algo_inr_rate ?? 18.5;
        const winner = qts.find((q) => q.carrier_id === msgs.find((m) => m.carrier_id)?.carrier_id) ?? qts[0];

        const result: NegotiationResult = {
          agreed: true, final_price_inr: price,
          final_price_algo: Math.round((price / rate) * 10000) / 10000,
          winning_carrier: winner,
          rounds: msgs.filter((m) => m.sender !== "system").length,
          messages: msgs,
        };
        ctx.setNegResult(result);
        setPhase("negotiated");
        toast.success(`Deal agreed at ₹${price.toFixed(0)}`, { icon: "🤝" });

        // Auto-trigger escrow after short delay
        await sleep(1200);
        await runEscrow(result);
      },
      () => {
        toast.error("Stream error. Click Retry to try again.", { id: toastId });
        started.current = false; // allow retry
        setPhase("init");
      },
    );
    return () => es.close();
  }, [intent]);

  async function runEscrow(result: NegotiationResult) {
    if (!intent) return;
    setPhase("creating");
    const toastId = toast.loading("Deploying escrow contract on Algorand…");

    // Show steps with delays while real API call runs
    const escrowPromise = createEscrow(sessionId, result, intent);
    setEscrowStep(0);
    await sleep(1300); setEscrowStep(1);
    await sleep(1300); setEscrowStep(2);

    try {
      const info = await escrowPromise;
      ctx.setEscrow(info);
      setEscrowStep(3); // done
      setPhase("locked");
      toast.success(`${info.amount_algo} ALGO locked on Algorand!`, { id: toastId, icon: "🔒", duration: 5000 });
    } catch (e: any) {
      toast.error(e.message || "Escrow failed", { id: toastId });
      setPhase("negotiated");
      setEscrowStep(-1);
    }
  }

  // Greenest carrier
  const greenest = localQuotes.reduce<CarrierQuote | null>((best, q) => {
    const factor = CO2_FACTOR[q.specialization] ?? 0.3;
    const bestFactor = best ? (CO2_FACTOR[best.specialization] ?? 0.3) : Infinity;
    return factor < bestFactor ? q : best;
  }, null);

  const escrow = ctx.escrow;
  const negResult = ctx.negResult;

  return (
    <div className="flex-1 grid grid-cols-2 gap-6 min-h-0">

      {/* ── Side A: Carrier Negotiation ─────────────────────────────────────── */}
      <div className="flex flex-col gap-5 overflow-y-auto scrollbar-thin">

        {/* Carrier cards */}
        <div className="bento p-5">
          <div className="flex items-center gap-2 mb-4">
            <span className="material-symbols-outlined text-primary" style={{ fontSize: 18 }}>local_shipping</span>
            <h3 className="text-xs font-bold uppercase tracking-widest text-on-surface">
              Carrier Evaluation
            </h3>
            {phase === "streaming" && (
              <span className="ml-auto text-[10px] font-bold text-tertiary uppercase tracking-widest flex items-center gap-1">
                <span className="pulse-dot w-1.5 h-1.5 rounded-full bg-tertiary" /> Live
              </span>
            )}
          </div>

          {/* Retry button — shown when SSE failed */}
          {phase === "init" && localQuotes.length === 0 && (
            <button
              onClick={() => { started.current = false; setPhase("init"); /* trigger re-mount by forcing re-render */ window.location.reload(); }}
              className="w-full mb-3 py-2.5 bg-primary text-white rounded-xl text-sm font-semibold flex items-center justify-center gap-2 hover:opacity-90 active:scale-95 transition-all"
            >
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>refresh</span>
              Retry Negotiation
            </button>
          )}

          <div className="space-y-3">
            {localQuotes.length === 0
              ? [1,2,3].map((i) => <SkeletonCarrierCard key={i} />)
              : localQuotes.map((q) => (
                <CarrierCard
                  key={q.carrier_id}
                  quote={q}
                  isWinner={negResult?.winning_carrier.carrier_id === q.carrier_id}
                  isGreenest={greenest?.carrier_id === q.carrier_id}
                  market={localMarket}
                />
              ))
            }
          </div>
        </div>

        {/* Greenest Choice banner */}
        {greenest && localMarket && (
          <div className="rounded-2xl border border-primary/25 bg-primary/6 p-5">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center text-primary flex-shrink-0">
                <span className="material-symbols-outlined" style={{ fontSize: 20 }}>eco</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-widest text-primary mb-0.5">
                  Greenest Choice Identified
                </p>
                <p className="font-bold text-on-surface">{greenest.carrier_name}</p>
                <p className="text-xs text-outline mt-1">
                  {(
                    ((CO2_FACTOR.express - CO2_FACTOR.economy) * localMarket.distance_km * (ctx.intent?.weight_kg ?? 20) / 1000)
                  ).toFixed(0)} kg CO₂ saved vs express shipping over {localMarket.distance_km} km
                </p>
              </div>
              <span className="text-xs font-bold text-primary px-2.5 py-1 rounded-full bg-primary/10">
                Low-CO₂
              </span>
            </div>
          </div>
        )}

        {/* Negotiation log */}
        <div className="bento p-5 flex flex-col min-h-0 max-h-64">
          <div className="flex items-center gap-2 mb-3">
            <span className="material-symbols-outlined text-primary" style={{ fontSize: 18 }}>forum</span>
            <h3 className="text-xs font-bold uppercase tracking-widest text-on-surface">Negotiation Log</h3>
          </div>
          <div className="overflow-y-auto scrollbar-thin space-y-2 flex-1">
            {localMsgs.length === 0 && (
              <p className="text-xs text-outline text-center py-4">Waiting for agent messages…</p>
            )}
            {localMsgs.map((m, i) => (
              <NegMsg key={i} msg={m} />
            ))}
            <div ref={msgBottomRef} />
          </div>
        </div>
      </div>

      {/* ── Side B: Escrow Contract ──────────────────────────────────────────── */}
      <div className="flex flex-col gap-5 overflow-y-auto scrollbar-thin">

        {/* Dark escrow card */}
        <div className="bg-on-surface rounded-2xl p-6 text-surface shadow-card-md flex-shrink-0">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
              <span className="material-symbols-outlined text-primary-fixed-dim" style={{ fontSize: 22 }}>
                {phase === "locked" ? "lock" : "account_balance"}
              </span>
            </div>
            <div>
              <p className="font-bold text-surface leading-tight">Escrow Contract</p>
              <p className="text-[10px] text-surface-container font-medium">
                Algorand Testnet · ARC4 Smart Contract
              </p>
            </div>
          </div>

          {/* Steps */}
          <div className="space-y-3 mb-5">
            {ESCROW_STEPS.map((s, i) => {
              const done    = escrowStep > i;
              const active  = escrowStep === i;
              return (
                <div key={i} className={`flex items-center gap-3 p-3 rounded-xl transition-all ${
                  done   ? "bg-primary/15"  :
                  active ? "bg-white/8" : "opacity-30"
                }`}>
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${
                    done ? "bg-primary-fixed-dim" : active ? "bg-white/20" : "bg-white/10"
                  }`}>
                    {done ? (
                      <span className="material-symbols-outlined text-on-surface" style={{ fontSize: 14 }}>check</span>
                    ) : active ? (
                      <div className="w-3 h-3 border-2 border-white/60 border-t-white rounded-full animate-spin" />
                    ) : (
                      <span className="material-symbols-outlined text-surface-container" style={{ fontSize: 14 }}>{s.icon}</span>
                    )}
                  </div>
                  <span className={`text-xs font-medium ${done ? "text-primary-fixed-dim" : "text-surface-container"}`}>
                    {s.text}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Locked state */}
          {phase === "locked" && escrow && (
            <div className="bg-primary/20 border border-primary/40 rounded-2xl p-4 space-y-3">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary-fixed-dim" style={{ fontSize: 20 }}>lock</span>
                <span className="font-bold text-primary-fixed-dim">Funds Locked</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <p className="text-surface-container">Amount</p>
                  <p className="font-bold text-primary-fixed-dim text-base">{escrow.amount_algo} ALGO</p>
                </div>
                <div>
                  <p className="text-surface-container">App ID</p>
                  <p className="font-mono text-surface">{escrow.app_id}</p>
                </div>
              </div>
            </div>
          )}

          {/* Waiting / failed state */}
          {phase !== "locked" && phase !== "creating" && escrowStep < 0 && (
            <div className="text-center py-4 space-y-3">
              <span className="text-xs text-surface-container">
                {phase === "streaming" ? "Waiting for negotiation to complete…" :
                 phase === "negotiated" ? "Agreement reached, preparing escrow..." : "Waiting..."}
              </span>
              {/* Retry button — shown after a failed escrow attempt */}
              {phase === "negotiated" && negResult && (
                <button
                  onClick={() => runEscrow(negResult)}
                  className="w-full py-2.5 bg-primary/20 hover:bg-primary/30 text-primary-fixed-dim rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all"
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 14 }}>refresh</span>
                  Retry Lock Escrow
                </button>
              )}
            </div>
          )}
        </div>

        {/* TX links */}
        {escrow && (
          <div className="bento p-5 space-y-2">
            <div className="flex items-center gap-2 mb-3">
              <span className="material-symbols-outlined text-primary" style={{ fontSize: 18 }}>receipt_long</span>
              <h3 className="text-xs font-bold uppercase tracking-widest text-on-surface">Transactions</h3>
            </div>
            <TxLink label="Deploy"    txId={escrow.deploy_tx_id} />
            <TxLink label="Fund"      txId={escrow.fund_tx_id} />
            <TxLink label="Lock Deal" txId={escrow.deal_tx_id} />
            <TxLink label="Contract"  appId={escrow.app_id} explorerUrl={escrow.explorer_url} />
          </div>
        )}

        {/* Agreement summary */}
        {negResult && (
          <div className="bento p-5">
            <div className="flex items-center gap-2 mb-3">
              <span className="material-symbols-outlined text-primary" style={{ fontSize: 18 }}>handshake</span>
              <h3 className="text-xs font-bold uppercase tracking-widest text-on-surface">Agreement</h3>
            </div>
            <div className="space-y-2 text-xs">
              <Row label="Agreed Price" value={`₹${negResult.final_price_inr.toFixed(0)}`} bold />
              <Row label="Escrow (ALGO)" value={`${negResult.final_price_algo} ALGO`} bold />
              <Row label="Carrier" value={negResult.winning_carrier.carrier_name} />
              <Row label="ETA" value={`${negResult.winning_carrier.eta_days} days`} />
              <Row label="Rounds" value={String(negResult.rounds)} />
            </div>
          </div>
        )}

        {/* Proceed button */}
        {phase === "locked" && (
          <button
            onClick={() => { ctx.goTo(3); toast.success("Proceeding to delivery…", { icon: "🚚" }); }}
            className="w-full py-4 bg-primary text-white font-bold rounded-2xl flex items-center justify-center gap-2 hover:opacity-90 active:scale-[0.99] transition-all shadow-primary"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>local_shipping</span>
            Proceed to Delivery
          </button>
        )}
      </div>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────

function CarrierCard({ quote, isWinner, isGreenest, market }: {
  quote: CarrierQuote; isWinner: boolean; isGreenest: boolean;
  market: LiveMarketData | null;
}) {
  return (
    <div className={`rounded-2xl p-4 border transition-all ${
      isWinner
        ? "bg-primary/8 border-primary/30"
        : "bg-surface-container-low/50 border-slate-100"
    }`}>
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <p className="text-sm font-bold text-on-surface">{quote.carrier_name}</p>
            {isGreenest && (
              <span className="text-[9px] font-bold uppercase bg-primary/10 text-primary px-1.5 py-0.5 rounded-full flex items-center gap-1">
                <span className="material-symbols-outlined" style={{ fontSize: 10 }}>eco</span> Green
              </span>
            )}
            {isWinner && (
              <span className="text-[9px] font-bold uppercase bg-on-surface text-surface px-1.5 py-0.5 rounded-full">
                Selected
              </span>
            )}
          </div>
          <p className="text-xs text-outline">{quote.eta_days}d · {quote.specialization}</p>
        </div>
        <div className="text-right">
          <p className={`font-bold text-lg ${isWinner ? "text-primary" : "text-on-surface"}`}>
            ₹{quote.price_inr.toFixed(0)}
          </p>
          {market && (
            <p className="text-[10px] text-outline">
              ₹{quote.price_per_km_ton.toFixed(1)}/km·t
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function SkeletonCarrierCard() {
  return (
    <div className="rounded-2xl p-4 bg-surface-container-low/50 border border-slate-100 animate-pulse">
      <div className="flex justify-between">
        <div className="space-y-2">
          <div className="h-4 w-28 bg-slate-200 rounded" />
          <div className="h-3 w-20 bg-slate-100 rounded" />
        </div>
        <div className="h-6 w-16 bg-slate-200 rounded" />
      </div>
    </div>
  );
}

function NegMsg({ msg }: { msg: NegotiationMessage }) {
  const isSystem = msg.sender === "system";
  const isBuyer  = msg.sender === "buyer";
  return (
    <div className={`flex gap-2 text-xs ${isSystem ? "justify-center" : isBuyer ? "" : "flex-row-reverse"}`}>
      {!isSystem && (
        <div className={`w-6 h-6 rounded-lg flex-shrink-0 flex items-center justify-center text-[9px] font-bold ${
          isBuyer ? "bg-tertiary-container text-on-tertiary-container" : "bg-primary/10 text-primary"
        }`}>
          {isBuyer ? "B" : "C"}
        </div>
      )}
      <div className={`max-w-[80%] px-3 py-2 rounded-xl ${
        isSystem
          ? "bg-slate-100 text-outline"
          : isBuyer
            ? "bg-tertiary-container/60 text-on-tertiary-container rounded-tl-sm"
            : "bg-surface-container text-on-surface rounded-tr-sm"
      }`}>
        {msg.offer_price_inr && (
          <span className={`font-bold mr-1.5 ${msg.status === "accept" ? "text-primary" : ""}`}>
            ₹{msg.offer_price_inr.toFixed(0)}
            {msg.status === "accept" && " ✓"}
          </span>
        )}
        {msg.content}
      </div>
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex justify-between py-1 border-b border-slate-50 last:border-0">
      <span className="text-outline">{label}</span>
      <span className={bold ? "font-bold text-on-surface" : "text-on-surface"}>{value}</span>
    </div>
  );
}
