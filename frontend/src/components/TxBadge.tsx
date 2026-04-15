"use client";

interface TxBadgeProps {
  label: string;
  txId?: string;
  explorerUrl?: string;
  appId?: number;
}

export default function TxBadge({ label, txId, explorerUrl, appId }: TxBadgeProps) {
  const short = txId ? `${txId.slice(0, 8)}...${txId.slice(-6)}` : "";
  const url = explorerUrl || (txId ? `https://lora.algokit.io/testnet/transaction/${txId}` : "#");

  return (
    <div className="flex items-center gap-2 bg-algo-card border border-algo-border rounded-lg px-3 py-2 text-sm">
      <span className="w-2 h-2 rounded-full bg-algo-green flex-shrink-0" />
      <span className="text-algo-muted">{label}:</span>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-algo-green font-mono hover:underline truncate"
      >
        {appId ? `App #${appId}` : short}
      </a>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-algo-muted hover:text-algo-green ml-auto"
        title="View on Algorand Explorer"
      >
        ↗
      </a>
    </div>
  );
}
