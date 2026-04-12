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

const STATUS_COLORS: Record<string, string> = {
  LOCKED: "text-yellow-400 border-yellow-400",
  DELIVERED: "text-blue-400 border-blue-400",
  SETTLED: "text-algo-green border-algo-green",
  REFUNDED: "text-red-400 border-red-400",
};

export default function EscrowCard({
  escrow, deliveryHash, deliveryTxId, verifyResult, stage,
}: EscrowCardProps) {
  if (!escrow) return null;

  const statusColor = STATUS_COLORS[escrow.status] || "text-algo-muted border-algo-border";
  const released = verifyResult?.released;
  const finalStatus = verifyResult
    ? (released ? "SETTLED" : "REFUNDED")
    : escrow.status;
  const finalColor = STATUS_COLORS[finalStatus] || statusColor;

  return (
    <div className="bg-algo-card border border-algo-border rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-algo-text">Escrow Contract</h3>
        <span className={`text-xs font-bold border px-2 py-1 rounded ${finalColor}`}>
          {finalStatus}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 text-sm">
        <div>
          <p className="text-algo-muted text-xs">Locked Amount</p>
          <p className="text-algo-green font-bold text-lg">{escrow.amount_algo} ALGO</p>
        </div>
        <div>
          <p className="text-algo-muted text-xs">App ID</p>
          <p className="font-mono text-algo-text">{escrow.app_id}</p>
        </div>
      </div>

      <div className="space-y-1.5">
        <TxBadge label="Deploy" txId={escrow.deploy_tx_id} />
        <TxBadge label="Fund" txId={escrow.fund_tx_id} />
        <TxBadge label="Lock Deal" txId={escrow.deal_tx_id} />
        <TxBadge label="App" appId={escrow.app_id} explorerUrl={escrow.explorer_url} />

        {deliveryTxId && (
          <TxBadge label="Delivery" txId={deliveryTxId} />
        )}

        {verifyResult?.release_tx_id && (
          <TxBadge label="Payment Released" txId={verifyResult.release_tx_id} />
        )}
        {verifyResult?.refund_tx_id && (
          <TxBadge label="Refund" txId={verifyResult.refund_tx_id} />
        )}
      </div>

      {deliveryHash && (
        <div className="text-xs">
          <p className="text-algo-muted">Delivery Hash (on-chain):</p>
          <p className="font-mono text-algo-green break-all">{deliveryHash}</p>
        </div>
      )}
    </div>
  );
}
