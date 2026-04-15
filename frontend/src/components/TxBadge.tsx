"use client";

interface TxBadgeProps {
  label: string;
  txId?: string;
  explorerUrl?: string;
  appId?: number;
}

export default function TxBadge({ label, txId, explorerUrl, appId }: TxBadgeProps) {
  const short = txId ? `${txId.slice(0, 8)}…${txId.slice(-6)}` : "";
  const url = explorerUrl || (txId ? `https://lora.algokit.io/testnet/transaction/${txId}` : "#");
  const display = appId ? `App #${appId}` : short;

  return (
    <div className="flex items-center gap-2.5 bg-zinc-900/60 border border-zinc-800 rounded-xl px-3 py-2 text-xs group hover:border-zinc-700 transition-colors">
      {/* Live dot */}
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" />
      {/* Label */}
      <span className="text-zinc-500 font-medium flex-shrink-0">{label}</span>
      {/* TX link */}
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-emerald-400 font-mono truncate hover:text-emerald-300 transition-colors"
      >
        {display}
      </a>
      {/* Arrow — always visible */}
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="ml-auto text-zinc-600 hover:text-emerald-400 transition-colors flex-shrink-0"
        title="View on Algorand Explorer"
      >
        <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M2 10L10 2M10 2H4M10 2v6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </a>
    </div>
  );
}
