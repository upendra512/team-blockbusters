"use client";

import {
  createContext, useContext, useState,
  useRef, useCallback, ReactNode,
} from "react";
import { v4 as uuidv4 } from "uuid";
import type {
  ShipmentIntent, LiveMarketData, CarrierQuote,
  NegotiationMessage, NegotiationResult,
  EscrowInfo, DeliverResponse, VerifyReleaseResponse,
} from "@/lib/types";

// ── Types ────────────────────────────────────────────────────────────────────

interface ShipmentCtx {
  // Navigation
  view: 1 | 2 | 3;
  goTo: (v: 1 | 2 | 3) => void;

  // Session
  sessionId: string;

  // View 1 — Intent
  intent: ShipmentIntent | null;
  setIntent: (i: ShipmentIntent) => void;

  // View 2 — Negotiate + Escrow
  market: LiveMarketData | null;
  setMarket: (m: LiveMarketData) => void;
  quotes: CarrierQuote[];
  setQuotes: (q: CarrierQuote[]) => void;
  negMessages: NegotiationMessage[];
  addNegMessage: (m: NegotiationMessage) => void;
  negResult: NegotiationResult | null;
  setNegResult: (r: NegotiationResult) => void;
  escrow: EscrowInfo | null;
  setEscrow: (e: EscrowInfo) => void;

  // View 3 — Deliver + Settle
  delivery: DeliverResponse | null;
  setDelivery: (d: DeliverResponse) => void;
  verifyResult: VerifyReleaseResponse | null;
  setVerifyResult: (r: VerifyReleaseResponse) => void;
}

// ── Context ───────────────────────────────────────────────────────────────────

const Ctx = createContext<ShipmentCtx | null>(null);

export function ShipmentProvider({ children }: { children: ReactNode }) {
  const sessionId = useRef(uuidv4()).current;

  const [view, setView]               = useState<1 | 2 | 3>(1);
  const [intent, setIntent]           = useState<ShipmentIntent | null>(null);
  const [market, setMarket]           = useState<LiveMarketData | null>(null);
  const [quotes, setQuotes]           = useState<CarrierQuote[]>([]);
  const [negMessages, setNegMessages] = useState<NegotiationMessage[]>([]);
  const [negResult, setNegResult]     = useState<NegotiationResult | null>(null);
  const [escrow, setEscrow]           = useState<EscrowInfo | null>(null);
  const [delivery, setDelivery]       = useState<DeliverResponse | null>(null);
  const [verifyResult, setVerifyResult] = useState<VerifyReleaseResponse | null>(null);

  const addNegMessage = useCallback(
    (m: NegotiationMessage) => setNegMessages((p) => [...p, m]),
    [],
  );

  return (
    <Ctx.Provider value={{
      view, goTo: setView,
      sessionId,
      intent, setIntent,
      market, setMarket,
      quotes, setQuotes,
      negMessages, addNegMessage,
      negResult, setNegResult,
      escrow, setEscrow,
      delivery, setDelivery,
      verifyResult, setVerifyResult,
    }}>
      {children}
    </Ctx.Provider>
  );
}

export function useShipment() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useShipment must be inside ShipmentProvider");
  return ctx;
}
