import type {
  ShipmentIntent, CarrierQuote, LiveMarketData,
  NegotiationResult, EscrowInfo, DeliverResponse,
  VerifyReleaseResponse, NegotiationMessage,
} from "./types";

const BASE = "/api";
// SSE bypasses the Next.js rewrite proxy directly to avoid response buffering issues.
const SSE_BASE =
  typeof window !== "undefined"
    ? (process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000") + "/api"
    : "/api";

export async function sendChatMessage(message: string, sessionId: string) {
  const res = await fetch(`${BASE}/chat/message`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, session_id: sessionId }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<{
    reply: string;
    session_id: string;
    shipment_ready: boolean;
    shipment_intent?: ShipmentIntent;
  }>;
}

export async function fetchQuotes(intent: ShipmentIntent) {
  const res = await fetch(`${BASE}/freight/quotes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(intent),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<{
    quotes: CarrierQuote[];
    market_data: LiveMarketData;
    buyer_analysis: string;
  }>;
}

export function startNegotiationStream(
  intent: ShipmentIntent,
  onMarket: (m: LiveMarketData) => void,
  onQuotes: (q: CarrierQuote[]) => void,
  onMessage: (m: NegotiationMessage) => void,
  onDone: () => void,
  onError: (e: Event) => void,
): EventSource {
  const params = new URLSearchParams({
    origin_pincode: intent.origin_pincode,
    destination_pincode: intent.destination_pincode,
    weight_kg: String(intent.weight_kg),
    max_budget_inr: String(intent.max_budget_inr),
    pickup_date: intent.pickup_date,
    length_cm: String(intent.length_cm),
    width_cm: String(intent.width_cm),
    height_cm: String(intent.height_cm),
    package_type: intent.package_type,
    user_type: intent.user_type,
    delivery_priority: intent.delivery_priority ?? "cheapest",
  });

  const es = new EventSource(`${SSE_BASE}/freight/negotiate/stream?${params}`);
  es.addEventListener("market", (e) => onMarket(JSON.parse(e.data)));
  es.addEventListener("quotes", (e) => onQuotes(JSON.parse(e.data)));
  es.addEventListener("message", (e) => onMessage(JSON.parse(e.data)));
  es.addEventListener("done", () => { es.close(); onDone(); });
  es.onerror = (e) => { es.close(); onError(e); };
  return es;
}

export async function createEscrow(
  sessionId: string,
  negotiationResult: NegotiationResult,
  shipmentIntent: ShipmentIntent,
): Promise<EscrowInfo> {
  const res = await fetch(`${BASE}/freight/escrow/create`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      session_id: sessionId,
      negotiation_result: negotiationResult,
      shipment_intent: shipmentIntent,
    }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function submitDelivery(
  appId: number,
  carrierId: string,
  shipmentIntent: ShipmentIntent,
  negotiationResult: NegotiationResult,
): Promise<DeliverResponse> {
  const res = await fetch(`${BASE}/freight/escrow/${appId}/deliver`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      app_id: appId,
      carrier_id: carrierId,
      shipment_intent: shipmentIntent,
      negotiation_result: negotiationResult,
    }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function verifyAndRelease(
  appId: number,
  deliveryReceipt: DeliverResponse["delivery_receipt"],
  shipmentIntent: ShipmentIntent,
  negotiationResult: NegotiationResult,
  marketData: LiveMarketData,
): Promise<VerifyReleaseResponse> {
  const res = await fetch(`${BASE}/freight/escrow/${appId}/verify-release`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      app_id: appId,
      delivery_receipt: deliveryReceipt,
      shipment_intent: shipmentIntent,
      negotiation_result: negotiationResult,
      market_data: marketData,
    }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
