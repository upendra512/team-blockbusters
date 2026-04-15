"use client";

import { useState, useRef, useEffect, KeyboardEvent } from "react";
import toast from "react-hot-toast";
import { useShipment } from "@/context/ShipmentContext";
import { sendChatMessage } from "@/lib/api";
import type { ShipmentIntent } from "@/lib/types";

interface Msg { role: "user" | "assistant"; content: string; }

// Live-extract partial intent fields from chat history
function extractDraft(msgs: Msg[]): Partial<ShipmentIntent> {
  const text = msgs.filter((m) => m.role === "user").map((m) => m.content).join(" ");
  const pins = text.match(/\b[1-9][0-9]{5}\b/g) ?? [];
  const kgs  = text.match(/(\d+(?:\.\d+)?)\s*kg/i);
  const biz  = /business|commercial|b2b/i.test(text);
  const bugdet = text.match(/₹\s*(\d+)|(\d+)\s*(?:rs|inr|rupees)/i);
  return {
    origin_pincode:      pins[0],
    destination_pincode: pins[1],
    weight_kg:           kgs  ? parseFloat(kgs[1]) : undefined,
    user_type:           biz  ? "business" : undefined,
    max_budget_inr:      budgetFromText(text),
  };
}
function budgetFromText(t: string): number | undefined {
  const m = t.match(/budget[^₹\d]*₹?\s*(\d+)/i) || t.match(/(\d+)\s*(?:rs|inr)/i);
  return m ? parseInt(m[1]) : undefined;
}

// Live ALGO/INR from CoinGecko
async function fetchAlgoRate(): Promise<number> {
  try {
    const r = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=algorand&vs_currencies=inr",
      { next: { revalidate: 60 } }
    );
    const d = await r.json();
    return d.algorand.inr;
  } catch { return 49.48; }
}

export default function IntentView() {
  const { sessionId, setIntent, goTo } = useShipment();
  const [msgs, setMsgs]     = useState<Msg[]>([{
    role: "assistant",
    content: "Greetings. I am your Intent Agent — a blockchain-verified AI.\n\nDescribe your cargo: what you need to ship, from where to where. I'll extract the details and prepare your shipment for autonomous negotiation.",
  }]);
  const [input, setInput]   = useState("");
  const [busy, setBusy]     = useState(false);
  const [ready, setReady]   = useState(false);
  const [collected, setCollected] = useState<ShipmentIntent | null>(null);
  const [algoRate, setAlgoRate]   = useState<number | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => { fetchAlgoRate().then(setAlgoRate); }, []);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs]);

  const draft = extractDraft(msgs);

  const send = async () => {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    setMsgs((p) => [...p, { role: "user", content: text }]);
    setBusy(true);
    try {
      const res = await sendChatMessage(text, sessionId);
      setMsgs((p) => [...p, { role: "assistant", content: res.reply }]);
      if (res.shipment_ready && res.shipment_intent) {
        setCollected(res.shipment_intent);
        setReady(true);
        toast.success("All shipment details captured!", { icon: "📦" });
      }
    } catch {
      setMsgs((p) => [...p, { role: "assistant", content: "Connection error. Please retry." }]);
    } finally { setBusy(false); }
  };

  const proceed = () => {
    if (!collected) return;
    setIntent(collected);
    toast.success("Proceeding to automated negotiation…", { icon: "🤝" });
    goTo(2);
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  };

  const intent = collected ?? draft;
  const fields: [string, string | undefined][] = [
    ["Origin Pincode",      intent.origin_pincode],
    ["Destination Pincode", intent.destination_pincode],
    ["Weight",              intent.weight_kg ? `${intent.weight_kg} kg` : undefined],
    ["Type",                intent.user_type],
    ["Max Budget",          intent.max_budget_inr ? `₹${intent.max_budget_inr}` : undefined],
    ["Pickup Date",         intent.pickup_date],
    ["Package",             intent.package_type],
  ];

  return (
    <div className="flex-1 grid grid-cols-12 gap-6 min-h-0">

      {/* ── Left: Chat ─────────────────────────────────────────────────────── */}
      <div className="col-span-8 flex flex-col bento overflow-hidden">

        {/* Chat header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100/70 bg-surface-container-low/30">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
              <span className="material-symbols-outlined" style={{ fontSize: 20 }}>smart_toy</span>
            </div>
            <div>
              <p className="text-sm font-bold text-on-surface leading-tight">Intent Agent 01</p>
              <p className="text-[10px] text-primary font-semibold">Verified Blockchain Identity</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 bg-surface-container px-3 py-1.5 rounded-full">
            <span className="pulse-dot w-2 h-2 rounded-full bg-primary-fixed-dim flex-shrink-0" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-primary">
              Active
            </span>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6 scrollbar-thin">
          {msgs.map((m, i) => (
            <div key={i} className={`flex gap-3 ${m.role === "user" ? "flex-row-reverse" : ""}`}>
              {/* Avatar */}
              <div className={`w-8 h-8 rounded-xl flex-shrink-0 flex items-center justify-center mt-0.5 ${
                m.role === "user"
                  ? "bg-on-surface text-surface-container-lowest"
                  : "bg-primary/10 text-primary"
              }`}>
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                  {m.role === "user" ? "person" : "auto_awesome"}
                </span>
              </div>
              {/* Bubble */}
              <div className={`max-w-[78%] space-y-1 ${m.role === "user" ? "items-end" : ""}`}>
                <div className={`px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
                  m.role === "user"
                    ? "bg-on-surface text-surface rounded-tr-sm text-white"
                    : "bg-surface-container-low text-on-surface rounded-tl-sm border border-slate-100/80"
                }`}>
                  {m.content}
                </div>
              </div>
            </div>
          ))}

          {/* Typing indicator */}
          {busy && (
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center text-primary flex-shrink-0">
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>auto_awesome</span>
              </div>
              <div className="bg-surface-container-low border border-slate-100/80 rounded-2xl rounded-tl-sm px-4 py-3">
                <div className="flex gap-1 items-center h-5">
                  {[0,1,2].map((i) => (
                    <div key={i} className="typing-dot w-1.5 h-1.5 rounded-full bg-outline"
                      style={{ animationDelay: `${i*0.2}s` }} />
                  ))}
                </div>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="px-6 py-5 border-t border-slate-100/70 bg-surface-container-lowest">
          {/* Suggestions */}
          {!ready && (
            <div className="flex items-center gap-3 mb-4 flex-wrap">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Quick:</span>
              {[
                "Ship 20kg clothing Mumbai→Delhi",
                "20kg electronics, ₹800 budget",
                "Business shipment to 110001",
              ].map((s) => (
                <button key={s} onClick={() => setInput(s)}
                  className="text-[11px] font-medium text-primary hover:underline">
                  "{s}"
                </button>
              ))}
            </div>
          )}

          {ready ? (
            <button onClick={proceed}
              className="w-full py-3.5 bg-on-surface text-surface-container-lowest font-bold rounded-2xl text-sm flex items-center justify-center gap-2 hover:opacity-90 active:scale-[0.99] transition-all shadow-card-md">
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>arrow_forward</span>
              Proceed to Automated Negotiation
            </button>
          ) : (
            <div className="flex gap-3">
              <input
                value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={onKey}
                disabled={busy}
                placeholder="Describe your shipment requirements…"
                className="flex-1 bg-surface-container-low rounded-2xl px-5 py-3.5 text-sm text-on-surface placeholder-outline border-0 focus:ring-2 focus:ring-primary/25 outline-none disabled:opacity-50"
              />
              <button onClick={send} disabled={!input.trim() || busy}
                className="w-12 h-12 bg-primary text-white rounded-2xl flex items-center justify-center shadow-primary disabled:opacity-40 hover:opacity-90 active:scale-95 transition-all">
                <span className="material-symbols-outlined" style={{ fontSize: 20 }}>send</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Right: Info cards ──────────────────────────────────────────────── */}
      <div className="col-span-4 flex flex-col gap-5 overflow-y-auto scrollbar-thin">

        {/* Draft Snapshot */}
        <div className="bento p-5">
          <div className="flex items-center gap-2 mb-4">
            <span className="material-symbols-outlined text-primary" style={{ fontSize: 18 }}>description</span>
            <h3 className="text-xs font-bold text-on-surface uppercase tracking-widest">Draft Snapshot</h3>
          </div>
          <div className="space-y-2.5">
            {fields.map(([label, val]) => (
              <div key={label} className="flex justify-between items-center py-1.5 border-b border-slate-50 last:border-0">
                <span className="text-xs text-outline">{label}</span>
                {val ? (
                  <span className="text-xs font-bold text-on-surface">{val}</span>
                ) : (
                  <div className="flex gap-0.5 items-center">
                    {[0,1,2].map((i) => (
                      <div key={i} className="w-1 h-1 rounded-full bg-slate-300 animate-pulse"
                        style={{ animationDelay: `${i*0.2}s` }} />
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
          {ready && (
            <div className="mt-4 flex items-center gap-2 bg-primary/8 border border-primary/20 rounded-xl px-3 py-2">
              <span className="material-symbols-outlined text-primary" style={{ fontSize: 16 }}>check_circle</span>
              <span className="text-xs font-semibold text-primary">All details captured</span>
            </div>
          )}
        </div>

        {/* Freight Index */}
        <div className="bg-on-surface rounded-2xl p-5 text-surface shadow-card-md">
          <div className="flex items-center gap-2 mb-4">
            <span className="material-symbols-outlined text-primary-fixed-dim" style={{ fontSize: 18 }}>query_stats</span>
            <h3 className="text-xs font-bold uppercase tracking-widest text-surface-container">
              Live Freight Index
            </h3>
          </div>
          <div className="space-y-3">
            <IndexRow icon="currency_bitcoin" label="ALGO / INR"
              value={algoRate ? `₹${algoRate.toFixed(2)}` : "Loading…"}
              change="+2.1%" positive />
            <IndexRow icon="local_gas_station" label="Diesel India"
              value="₹89.62 / L" change="→ 0.0%" />
            <IndexRow icon="route" label="Natl. Freight Index"
              value="142.3" change="+0.8%" positive />
            <IndexRow icon="trending_up" label="MUM–DEL Corridor"
              value="₹6.8/km" change="−1.2%" />
          </div>
          <div className="mt-4 pt-4 border-t border-white/10 flex items-center gap-2">
            <div className="pulse-dot w-1.5 h-1.5 rounded-full bg-primary-fixed-dim" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-surface-container">
              Live · Updated 12s ago
            </span>
          </div>
        </div>

        {/* Network status */}
        <div className="bento p-5">
          <div className="flex items-center gap-2 mb-3">
            <span className="material-symbols-outlined text-primary" style={{ fontSize: 18 }}>hub</span>
            <h3 className="text-xs font-bold uppercase tracking-widest text-on-surface">Network</h3>
          </div>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-outline">Algorand Testnet</span>
              <span className="text-primary font-bold flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-primary inline-block" /> Active
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-outline">Groq (LLM)</span>
              <span className="text-primary font-bold">Llama 3.3-70B</span>
            </div>
            <div className="flex justify-between">
              <span className="text-outline">Carriers online</span>
              <span className="font-bold text-on-surface">3 / 3</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function IndexRow({ icon, label, value, change, positive }: {
  icon: string; label: string; value: string; change: string; positive?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <span className="material-symbols-outlined text-surface-container-high" style={{ fontSize: 15 }}>{icon}</span>
        <span className="text-xs text-surface-container">{label}</span>
      </div>
      <div className="text-right">
        <p className="text-xs font-bold text-surface">{value}</p>
        <p className={`text-[10px] ${positive ? "text-primary-fixed-dim" : "text-surface-container"}`}>{change}</p>
      </div>
    </div>
  );
}
