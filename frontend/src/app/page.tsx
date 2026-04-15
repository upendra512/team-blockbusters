"use client";

import Providers from "@/components/Providers";
import { useShipment } from "@/context/ShipmentContext";
import IntentView from "@/components/views/IntentView";
import NegotiateView from "@/components/views/NegotiateView";
import DeliverView from "@/components/views/DeliverView";

// ── Step rail definition ──────────────────────────────────────────────────────
const STEPS = [
  { num: "01", label: "Intent",      view: 1 as const, icon: "chat_bubble"    },
  { num: "02", label: "Negotiate",   view: 2 as const, icon: "handshake"      },
  { num: "03", label: "Lock Escrow", view: 2 as const, icon: "lock"           },
  { num: "04", label: "Deliver",     view: 3 as const, icon: "local_shipping" },
  { num: "05", label: "Settle",      view: 3 as const, icon: "payments"       },
];

const VIEW_LABELS: Record<number, string> = {
  1: "Shipping Intent",
  2: "Negotiate & Escrow",
  3: "Deliver & Settle",
};
const VIEW_DESCS: Record<number, string> = {
  1: "Define your cargo requirements with the Intent AI Agent.",
  2: "Automated carrier negotiation and trustless on-chain escrow.",
  3: "Verify delivery and release funds with a single action.",
};

// ── Main shell ────────────────────────────────────────────────────────────────
function Shell() {
  const { view, goTo, intent, escrow } = useShipment();

  const unlocked = (v: 1 | 2 | 3) =>
    v === 1 || (v === 2 && !!intent) || (v === 3 && !!escrow);

  // Map step index to "done" state
  const stepDone = (i: number) => {
    if (i === 0) return view > 1 || !!intent;
    if (i === 1 || i === 2) return view > 2 || !!escrow;
    return view > 3;
  };
  const stepActive = (i: number) => {
    if (i === 0) return view === 1;
    if (i === 1 || i === 2) return view === 2;
    return view === 3;
  };

  return (
    <div className="min-h-screen bg-surface text-on-surface overflow-hidden">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <header className="fixed top-0 w-full h-16 flex items-center justify-between px-8
        bg-white/85 backdrop-blur-md border-b border-slate-100 z-50">
        <div className="flex items-center gap-8">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-primary flex items-center justify-center">
              <span className="material-symbols-outlined text-white" style={{ fontSize: 18 }}>hub</span>
            </div>
            <span className="text-lg font-bold tracking-tight text-on-surface">A2A Freight</span>
          </div>
          <nav className="hidden md:flex gap-6 text-sm">
            {["Dashboard","Shipments","Ledger","Analytics"].map((n, i) => (
              <a key={n} className={`pb-0.5 transition-colors cursor-pointer ${
                i === 0
                  ? "text-primary border-b-2 border-primary font-semibold"
                  : "text-outline hover:text-on-surface"
              }`}>{n}</a>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center bg-surface-container-low px-4 py-2 rounded-full gap-2">
            <span className="material-symbols-outlined text-outline" style={{ fontSize: 16 }}>search</span>
            <input placeholder="Search shipping IDs…"
              className="bg-transparent border-0 text-sm text-on-surface placeholder-outline w-44 focus:outline-none" />
          </div>
          <button className="p-2 hover:bg-surface-container rounded-full transition-colors">
            <span className="material-symbols-outlined text-outline" style={{ fontSize: 20 }}>notifications</span>
          </button>
          <button className="p-2 hover:bg-surface-container rounded-full transition-colors">
            <span className="material-symbols-outlined text-outline" style={{ fontSize: 20 }}>account_balance_wallet</span>
          </button>
          <div className="w-8 h-8 rounded-full bg-primary/15 flex items-center justify-center text-primary font-bold text-sm">
            U
          </div>
        </div>
      </header>

      {/* ── Sidebar ─────────────────────────────────────────────────────────── */}
      <aside className="fixed left-0 top-16 bottom-0 w-64 flex flex-col py-6
        bg-slate-50 border-r border-slate-100 z-40">
        <div className="px-6 mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center text-white">
              <span className="material-symbols-outlined" style={{ fontSize: 22 }}>hub</span>
            </div>
            <div>
              <p className="text-sm font-bold text-on-surface">Command Center</p>
              <p className="text-[10px] uppercase tracking-widest text-outline">Blockchain Ledger Active</p>
            </div>
          </div>
        </div>

        <nav className="flex flex-col gap-0.5 flex-1">
          {[
            { v: 1 as const, icon: "chat_bubble",    label: "Intent"    },
            { v: 2 as const, icon: "handshake",      label: "Negotiate" },
            { v: 2 as const, icon: "lock",           label: "Escrow"    },
            { v: 3 as const, icon: "local_shipping", label: "Deliver"   },
            { v: 3 as const, icon: "payments",       label: "Settle"    },
          ].map(({ v, icon, label }, i) => {
            const isCurrentView = view === v;
            const isLocked = !unlocked(v);
            return (
              <button key={i} onClick={() => unlocked(v) && goTo(v)}
                disabled={isLocked}
                className={`flex items-center gap-4 py-3 text-sm font-semibold uppercase tracking-wider transition-all duration-200 ${
                  isCurrentView
                    ? "bg-white text-primary ml-4 pl-4 rounded-l-full shadow-sm border-r-0"
                    : isLocked
                      ? "px-8 text-slate-300 cursor-not-allowed"
                      : "px-8 text-outline hover:text-on-surface hover:bg-surface-container-low/50"
                }`}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 20 }}>{icon}</span>
                <span>{label}</span>
                {isLocked && (
                  <span className="ml-auto material-symbols-outlined text-slate-300 mr-4" style={{ fontSize: 14 }}>lock</span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="px-5 mt-4">
          <button
            onClick={() => { window.location.reload(); }}
            className="w-full py-3 bg-primary text-white rounded-xl font-bold shadow-primary flex items-center justify-center gap-2 hover:opacity-90 active:scale-95 transition-all text-sm">
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>add</span>
            New Shipment
          </button>
        </div>
      </aside>

      {/* ── Main content ─────────────────────────────────────────────────────── */}
      <main className="ml-64 mt-16 h-[calc(100vh-64px)] flex flex-col px-8 py-7 bg-surface overflow-hidden">

        {/* View header + step rail */}
        <section className="mb-6 flex-shrink-0">
          <div className="flex justify-between items-end mb-6">
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-on-surface mb-1">
                {VIEW_LABELS[view]}
              </h1>
              <p className="text-outline text-sm">{VIEW_DESCS[view]}</p>
            </div>
            {/* Live node indicator */}
            <div className="flex items-center gap-2 bg-surface-container-low px-4 py-2 rounded-full">
              <span className="pulse-dot w-2 h-2 rounded-full bg-primary-fixed-dim flex-shrink-0" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-primary">
                Node: active_broadcast
              </span>
            </div>
          </div>

          {/* Step progress rail */}
          <div className="flex items-center relative">
            {/* Full width connector track */}
            <div className="absolute top-4 left-4 right-4 h-0.5 bg-slate-200 -z-10" />
            {STEPS.map((s, i) => {
              const done   = stepDone(i);
              const active = stepActive(i);
              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-2 relative">
                  {/* Connector fill */}
                  {i > 0 && done && (
                    <div className="absolute top-4 right-1/2 w-full h-0.5 bg-primary -z-10" />
                  )}
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold z-10
                    border-2 transition-all ${
                    done
                      ? "bg-primary border-primary text-white shadow-primary"
                      : active
                        ? "bg-white border-primary text-primary shadow-sm"
                        : "bg-white border-slate-200 text-slate-400"
                  }`}>
                    {done
                      ? <span className="material-symbols-outlined" style={{ fontSize: 14 }}>check</span>
                      : s.num}
                  </div>
                  <span className={`text-[10px] font-bold uppercase tracking-tighter whitespace-nowrap ${
                    active ? "text-primary" : done ? "text-primary/70" : "text-slate-400"
                  }`}>
                    {s.label}
                  </span>
                </div>
              );
            })}
          </div>
        </section>

        {/* View content */}
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
          {view === 1 && <IntentView />}
          {view === 2 && <NegotiateView />}
          {view === 3 && <DeliverView />}
        </div>
      </main>

      {/* Floating human desk */}
      <div className="fixed bottom-8 right-8 z-50">
        <button className="flex items-center gap-3 bg-white pl-2 pr-5 py-2 rounded-full shadow-card-md border border-slate-100 hover:shadow-card transition-shadow">
          <div className="w-10 h-10 rounded-full bg-on-surface flex items-center justify-center text-white">
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>support_agent</span>
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none mb-0.5">Human Desk</p>
            <p className="text-xs font-bold text-on-surface leading-none">Talk to an Operator</p>
          </div>
        </button>
      </div>
    </div>
  );
}

// ── Root export wrapped in providers ─────────────────────────────────────────
export default function Home() {
  return (
    <Providers>
      <Shell />
    </Providers>
  );
}
