"use client";

interface TxLinkProps {
  label: string;
  txId?: string;
  explorerUrl?: string;
  appId?: number;
}

export default function TxLink({ label, txId, explorerUrl, appId }: TxLinkProps) {
  const short = txId ? `${txId.slice(0, 10)}…${txId.slice(-6)}` : "";
  const url = explorerUrl
    || (appId  ? `https://lora.algokit.io/testnet/application/${appId}` : "")
    || (txId   ? `https://lora.algokit.io/testnet/transaction/${txId}`  : "#");

  return (
    <div className="flex items-center gap-2 bg-surface-container-low rounded-xl px-3 py-2 text-xs">
      <span className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" />
      <span className="text-on-surface-variant font-medium flex-shrink-0">{label}</span>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-primary font-mono truncate hover:underline ml-auto"
      >
        {appId ? `App #${appId}` : short}
      </a>
      <a href={url} target="_blank" rel="noopener noreferrer"
        className="text-outline hover:text-primary flex-shrink-0 transition-colors"
      >
        <span className="material-symbols-outlined" style={{ fontSize: 14 }}>open_in_new</span>
      </a>
    </div>
  );
}
