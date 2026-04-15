"use client";

import type { EscrowInfo, VerifyReleaseResponse } from "@/lib/types";
import TxBadge from "./TxBadge";

interface EscrowCardProps {
  escrow?: EscrowInfo;
  deliveryHash?: string;
  deliveryTxId?: string;
  verifyResult?: VerifyReleaseResponse;
  stage: string;
}

const STATUS_CONFIG: Record<string, { dot: string; text: string; ring: string }> = {
  LOCKED:    { dot: "bg-amber-400",  text: "text-amber-400",  ring: "ring-amber-500/30" },
  DELIVERED: { dot: "bg-sky-400",    text: "text-sky-400",    ring: "ring-sky-500/30"   },
  SETTLED:   { dot: "bg-emerald-400",text: "text-emerald-400",ring: "ring-emerald-500/30"},
  REFUNDED:  { dot: "bg-red-400",    text: "text-red-400",    ring: "ring-red-500/30"   },
};

export default function EscrowCard({
  escrow, deliveryHash, deliveryTxId, verifyResult, stage,
}: EscrowCardProps) {
  if (!escrow) return null;

  const finalStatus = verifyResult
    ? (verifyResult.released ? "SETTLED" : "REFUNDED")
    : escrow.status;
  const cfg = STATUS_CONFIG[finalStatus] ?? STATUS_CONFIG.LOCKED;

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-4">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-zinc-100">Escrow Contract</h3>
        <div className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-zinc-800 ring-1 ${cfg.ring}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
          <span className={cfg.text}>{finalStatus}</span>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-zinc-950/60 rounded-xl px-3 py-2.5">
          <p className="text-xs text-zinc-500 mb-0.5">Locked Amount</p>
          <p className="text-emerald-400 font-bold text-base tabular-nums">{escrow.amount_algo} ALGO</p>
        </div>
        <div className="bg-zinc-950/60 rounded-xl px-3 py-2.5">
          <p className="text-xs text-zinc-500 mb-0.5">App ID</p>
          <p className="font-mono text-zinc-200 text-sm">{escrow.app_id}</p>
        </div>
      </div>

      {/* Transaction badges */}
      <div className="space-y-1.5">
        <TxBadge label="Deploy"  txId={escrow.deploy_tx_id} />
        <TxBadge label="Fund"    txId={escrow.fund_tx_id} />
        <TxBadge label="Lock"    txId={escrow.deal_tx_id} />
        <TxBadge label="App"     appId={escrow.app_id} explorerUrl={escrow.explorer_url} />
        {deliveryTxId && <TxBadge label="Delivery" txId={deliveryTxId} />}
        {verifyResult?.release_tx_id && <TxBadge label="Released" txId={verifyResult.release_tx_id} />}
        {verifyResult?.refund_tx_id  && <TxBadge label="Refund"   txId={verifyResult.refund_tx_id}  />}
      </div>

      {/* Delivery hash */}
      {deliveryHash && (
        <div className="bg-zinc-950/60 rounded-xl px-3 py-2.5">
          <p className="text-xs text-zinc-500 mb-1">Delivery Hash (on-chain)</p>
          <p className="font-mono text-emerald-400 text-[10px] break-all leading-relaxed">{deliveryHash}</p>
        </div>
      )}
    </div>
  );
}
