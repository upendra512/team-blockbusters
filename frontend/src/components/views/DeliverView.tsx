"use client";

import { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { useShipment } from "@/context/ShipmentContext";
import { submitDelivery, verifyAndRelease } from "@/lib/api";
import TxLink from "@/components/shared/TxLink";

type Phase = "loading" | "delivering" | "delivered" | "verifying" | "settled" | "refunded";

interface LogEntry { time: string; icon: string; text: string; color: string; }

export default function DeliverView() {
  const ctx = useShipment();
  const { intent, negResult, escrow, market, delivery, verifyResult } = ctx;

  const started = useRef(false);
  const [phase, setPhase] = useState<Phase>(delivery ? "delivered" : "loading");
  const [logs, setLogs]   = useState<LogEntry[]>([]);

  const addLog = (icon: string, text: string, color = "text-on-surface") => {
    const time = new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    setLogs((p) => [...p, { time, icon, text, color }]);
  };

  // Auto-submit delivery on mount
  useEffect(() => {
    if (started.current || delivery || !escrow || !intent || !negResult) return;
    started.current = true;

    addLog("inventory", `Shipment assigned to ${negResult.winning_carrier.carrier_name}`, "text-primary");
    addLog("lock", `${escrow.amount_algo} ALGO locked in Contract #${escrow.app_id}`, "text-outline");

    const run = async () => {
      setPhase("delivering");
      const toastId = toast.loading(`${negResult.winning_carrier.carrier_name} submitting delivery receipt…`);

      await new Promise((r) => setTimeout(r, 1800));
      addLog("local_shipping", "Carrier agent preparing delivery receipt…", "text-outline");
      await new Promise((r) => setTimeout(r, 1200));

      try {
        const res = await submitDelivery(
          escrow.app_id, negResult.winning_carrier.carrier_id, intent, negResult,
        );
        ctx.setDelivery(res);
        setPhase("delivered");
        toast.success("Delivery receipt stored on-chain", { id: toastId, icon: "📦" });
        addLog("check_circle", `Receipt submitted: ${res.delivery_receipt.truck_number} · ${res.delivery_receipt.driver_name}`, "text-primary");
        addLog("route", `Route: ${res.delivery_receipt.origin_pincode} → ${res.delivery_receipt.destination_pincode} (${res.delivery_receipt.route_distance_km} km)`, "text-outline");
      } catch (e: any) {
        toast.error(e.message || "Delivery submission failed", { id: toastId });
        setPhase("loaded" as Phase);
        addLog("error", "Delivery submission failed", "text-error");
      }
    };
    run();
  }, [escrow, intent, negResult]);

  // Rebuild logs from existing data (if returning to this view)
  useEffect(() => {
    if (!started.current && delivery && negResult && escrow) {
      setLogs([
        { time: "--", icon: "inventory",     text: `Assigned to ${negResult.winning_carrier.carrier_name}`,  color: "text-primary" },
        { time: "--", icon: "lock",          text: `${escrow.amount_algo} ALGO locked`,                       color: "text-outline" },
        { time: "--", icon: "check_circle",  text: `Receipt: ${delivery.delivery_receipt.truck_number}`,      color: "text-primary" },
      ]);
    }
  }, []);

  const handleVerifyRelease = async () => {
    if (!delivery || !intent || !negResult || !escrow || !market) return;
    setPhase("verifying");
    addLog("verified_user", "Running AI verification (5 programmatic checks)…", "text-tertiary");
    const toastId = toast.loading("Verifying delivery & releasing funds…");

    try {
      const res = await verifyAndRelease(
        escrow.app_id, delivery.delivery_receipt, intent, negResult, market,
      );
      ctx.setVerifyResult(res);

      if (res.released) {
        setPhase("settled");
        ctx.setEscrow({ ...escrow, status: "SETTLED" });
        toast.success(`Payment released! ${escrow.amount_algo} ALGO → ${negResult.winning_carrier.carrier_name}`, {
          id: toastId, icon: "✅", duration: 6000,
        });
        addLog("payments", `Payment released: ${escrow.amount_algo} ALGO sent to carrier`, "text-primary");
        res.verification.checks.forEach((c) => {
          addLog(c.passed ? "check_small" : "close", c.name, c.passed ? "text-primary" : "text-error");
        });
      } else {
        setPhase("refunded");
        ctx.setEscrow({ ...escrow, status: "REFUNDED" });
        toast.error("Verification failed: buyer refunded", { id: toastId, duration: 6000 });
        addLog("undo", `Refund issued: ${escrow.amount_algo} ALGO → buyer`, "text-error");
      }
    } catch (e: any) {
      setPhase("delivered");
      toast.error(e.message || "Verification failed", { id: toastId });
    }
  };

  const receipt = ctx.delivery?.delivery_receipt;
  const qrValue = escrow
    ? `https://lora.algokit.io/testnet/application/${escrow.app_id}`
    : "A2A Freight Commerce";
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(qrValue)}&size=200x200&color=0b1c30&bgcolor=ffffff&qzone=2`;

  const settled  = phase === "settled";
  const refunded = phase === "refunded";

  return (
    <div className="flex-1 grid grid-cols-12 gap-6 min-h-0">

      {/* ── Left: Shipment Details ────────────────────────────────────────── */}
      <div className="col-span-3 flex flex-col gap-4 overflow-y-auto scrollbar-thin">
        <div className="bento p-5">
          <div className="flex items-center gap-2 mb-4">
            <span className="material-symbols-outlined text-primary" style={{ fontSize: 18 }}>package_2</span>
            <h3 className="text-xs font-bold uppercase tracking-widest text-on-surface">Shipment</h3>
          </div>
          {intent && receipt && (
            <div className="space-y-3 text-xs">
              <Field label="Origin"     value={`${receipt.origin_pincode}`} />
              <Field label="Destination" value={`${receipt.destination_pincode}`} />
              <Field label="Weight"     value={`${receipt.weight_kg} kg`} />
              <Field label="Distance"   value={`${receipt.route_distance_km} km`} />
              <Field label="Carrier"    value={receipt.carrier_name} highlight />
              <Field label="Truck"      value={receipt.truck_number} mono />
              <Field label="Driver"     value={receipt.driver_name} />
              <Field label="Price"      value={`₹${receipt.agreed_price_inr.toFixed(0)}`} highlight />
            </div>
          )}
          {!receipt && (
            <div className="space-y-3">
              {[1,2,3,4,5,6].map((i) => (
                <div key={i} className="flex justify-between animate-pulse">
                  <div className="h-3 w-16 bg-slate-200 rounded" />
                  <div className="h-3 w-20 bg-slate-100 rounded" />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Escrow status */}
        {escrow && (
          <div className={`rounded-2xl p-4 border ${
            settled  ? "bg-primary/8 border-primary/25" :
            refunded ? "bg-error/5 border-error/20" :
                       "bg-surface-container border-slate-100"
          }`}>
            <p className="text-[10px] font-bold uppercase tracking-widest text-outline mb-2">Escrow</p>
            <p className={`font-bold text-lg ${settled ? "text-primary" : refunded ? "text-error" : "text-on-surface"}`}>
              {escrow.amount_algo} ALGO
            </p>
            <p className="text-xs text-outline mt-1">
              {settled ? "Released to carrier" : refunded ? "Refunded to buyer" : `Status: ${escrow.status}`}
            </p>
          </div>
        )}

        {/* TX links */}
        {ctx.verifyResult?.release_tx_id && (
          <div className="bento p-4 space-y-1.5">
            <TxLink label="Payment" txId={ctx.verifyResult.release_tx_id} />
          </div>
        )}
        {ctx.verifyResult?.refund_tx_id && (
          <div className="bento p-4 space-y-1.5">
            <TxLink label="Refund" txId={ctx.verifyResult.refund_tx_id} />
          </div>
        )}
      </div>

      {/* ── Center: QR Code ───────────────────────────────────────────────── */}
      <div className="col-span-5 flex flex-col items-center gap-5 overflow-y-auto scrollbar-thin pb-4">
        <div className="bento p-8 flex flex-col items-center gap-5 w-full max-w-sm mx-auto">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-outline text-center mb-1">
              Dynamic Proof of Possession
            </p>
            <h2 className="text-lg font-bold text-on-surface text-center">On-Chain Verification</h2>
          </div>

          {/* QR code */}
          <div className={`p-4 rounded-2xl border-2 transition-all ${
            phase === "delivered" || settled || refunded
              ? "border-primary/30"
              : "border-slate-200"
          }`}>
            {escrow ? (
              <img
                src={qrUrl} alt="Algorand Contract QR"
                className="w-48 h-48 rounded-xl"
              />
            ) : (
              <div className="w-48 h-48 bg-slate-100 rounded-xl flex items-center justify-center">
                <span className="material-symbols-outlined text-slate-300" style={{ fontSize: 48 }}>qr_code_2</span>
              </div>
            )}
          </div>

          <div className="text-center space-y-1">
            <p className="text-xs font-semibold text-on-surface">
              {escrow ? `Contract #${escrow.app_id}` : "Awaiting contract…"}
            </p>
            <p className="text-[10px] text-outline">Scan to verify on Algorand Explorer</p>
            {ctx.delivery && (
              <p className="text-[10px] font-mono text-outline break-all px-2">
                {ctx.delivery.delivery_hash.slice(0, 24)}…
              </p>
            )}
          </div>

          {/* Phase status badge */}
          <div className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold w-full justify-center ${
            settled  ? "bg-primary/10 text-primary" :
            refunded ? "bg-error/10 text-error" :
            phase === "delivered" ? "bg-tertiary-container/60 text-on-tertiary-container" :
            "bg-surface-container text-outline"
          }`}>
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
              {settled ? "verified" : refunded ? "undo" : phase === "delivered" ? "inventory_2" : "hourglass_top"}
            </span>
            {settled  ? "Payment Settled on Algorand" :
             refunded ? "Buyer Refunded on Algorand" :
             phase === "delivered" ? "Delivery Confirmed" :
             phase === "verifying" ? "Verifying…" :
             "Awaiting delivery…"}
          </div>
        </div>

        {/* Verification checks */}
        {ctx.verifyResult && (
          <div className="bento p-5 w-full max-w-sm mx-auto">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-bold uppercase tracking-widest text-on-surface">Verification</p>
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                ctx.verifyResult.verification.passed
                  ? "bg-primary/10 text-primary"
                  : "bg-error/10 text-error"
              }`}>
                {ctx.verifyResult.verification.score}/5 passed
              </span>
            </div>
            {/* Score bar */}
            <div className="h-1.5 bg-slate-100 rounded-full mb-3 overflow-hidden">
              <div
                className={`h-full rounded-full ${ctx.verifyResult.verification.passed ? "bg-primary" : "bg-error"}`}
                style={{ width: `${(ctx.verifyResult.verification.score / 5) * 100}%`, transition: "width 0.6s ease" }}
              />
            </div>
            {/* All 5 checks — scrollable via parent column */}
            <div className="space-y-1.5">
              {ctx.verifyResult.verification.checks.map((c, i) => (
                <div key={i} className={`flex items-center gap-2 text-xs px-3 py-1.5 rounded-xl ${
                  c.passed ? "bg-primary/6" : "bg-error/6"
                }`}>
                  <span className={`material-symbols-outlined ${c.passed ? "text-primary" : "text-error"}`} style={{ fontSize: 14 }}>
                    {c.passed ? "check_circle" : "cancel"}
                  </span>
                  <span className={c.passed ? "text-on-surface" : "text-error"}>{c.name}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* CTA Button */}
        <button
          onClick={handleVerifyRelease}
          disabled={phase !== "delivered"}
          className={`w-full max-w-sm py-4 font-bold rounded-2xl flex items-center justify-center gap-2.5 transition-all active:scale-[0.99] shadow-primary text-base ${
            phase === "delivered"
              ? "bg-primary text-white hover:opacity-90 cursor-pointer"
              : settled || refunded
                ? "bg-slate-100 text-slate-400 cursor-default"
                : "bg-slate-200 text-slate-400 cursor-not-allowed"
          }`}
        >
          {phase === "verifying" ? (
            <>
              <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              Running Verification…
            </>
          ) : settled ? (
            <>
              <span className="material-symbols-outlined" style={{ fontSize: 20 }}>verified</span>
              Settlement Complete
            </>
          ) : refunded ? (
            <>
              <span className="material-symbols-outlined" style={{ fontSize: 20 }}>undo</span>
              Buyer Refunded
            </>
          ) : (
            <>
              <span className="material-symbols-outlined" style={{ fontSize: 20 }}>payments</span>
              Verify & Release Funds
            </>
          )}
        </button>
      </div>

      {/* ── Right: Carrier Logs ───────────────────────────────────────────── */}
      <div className="col-span-4 flex flex-col bento overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100/70">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary" style={{ fontSize: 18 }}>terminal</span>
            <h3 className="text-xs font-bold uppercase tracking-widest text-on-surface">Live Carrier Logs</h3>
            {(phase === "delivering" || phase === "verifying") && (
              <span className="ml-auto pulse-dot w-1.5 h-1.5 rounded-full bg-primary" />
            )}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3 scrollbar-thin font-mono">
          {logs.length === 0 && (
            <p className="text-xs text-outline text-center py-8">Logs will appear here…</p>
          )}
          {logs.map((log, i) => (
            <div key={i} className="flex gap-2 text-xs">
              <span className="text-slate-400 flex-shrink-0 text-[10px] font-mono pt-0.5">{log.time}</span>
              <span className={`material-symbols-outlined flex-shrink-0 ${log.color}`} style={{ fontSize: 14 }}>{log.icon}</span>
              <span className={`leading-relaxed ${log.color}`}>{log.text}</span>
            </div>
          ))}
          {(phase === "delivering" || phase === "verifying") && (
            <div className="flex gap-2 text-xs text-outline animate-pulse">
              <span className="text-[10px] font-mono pt-0.5">--</span>
              <span>Processing…</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, highlight, mono }: {
  label: string; value: string; highlight?: boolean; mono?: boolean;
}) {
  return (
    <div className="flex justify-between items-start gap-2 py-1.5 border-b border-slate-50 last:border-0">
      <span className="text-outline flex-shrink-0">{label}</span>
      <span className={`text-right truncate max-w-[60%] ${
        highlight ? "font-bold text-primary" :
        mono      ? "font-mono text-on-surface" :
                    "font-medium text-on-surface"
      }`}>
        {value}
      </span>
    </div>
  );
}
