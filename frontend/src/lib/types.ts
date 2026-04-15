export interface ShipmentIntent {
  user_type: string;
  origin_pincode: string;
  destination_pincode: string;
  weight_kg: number;
  length_cm: number;
  width_cm: number;
  height_cm: number;
  package_type: string;
  pickup_date: string;
  max_budget_inr: number;
  delivery_priority: "cheapest" | "balanced" | "fastest";
}

export interface LiveMarketData {
  distance_km: number;
  diesel_price_inr: number;
  weather_description: string;
  origin_city: string;
  destination_city: string;
  algo_inr_rate: number;
}

export interface CarrierQuote {
  carrier_id: string;
  carrier_name: string;
  price_inr: number;
  eta_days: number;
  specialization: string;
  price_per_km_ton: number;
  wallet_address: string;
}

export interface NegotiationMessage {
  round: number;
  sender: "buyer" | "seller" | "system";
  carrier_id?: string;
  offer_price_inr?: number;
  content: string;
  status: "offer" | "counter" | "accept" | "info";
}

export interface NegotiationResult {
  agreed: boolean;
  final_price_inr: number;
  final_price_algo: number;
  winning_carrier: CarrierQuote;
  rounds: number;
  messages: NegotiationMessage[];
}

export interface EscrowInfo {
  app_id: number;
  app_address: string;
  amount_micro_algo: number;
  amount_algo: number;
  deploy_tx_id: string;
  fund_tx_id: string;
  deal_tx_id: string;
  explorer_url: string;
  status: string;
}

export interface DeliveryReceipt {
  truck_number: string;
  driver_name: string;
  carrier_name: string;
  pickup_timestamp: string;
  origin_pincode: string;
  destination_pincode: string;
  weight_kg: number;
  route_distance_km: number;
  estimated_delivery: string;
  agreed_price_inr: number;
}

export interface DeliverResponse {
  delivery_receipt: DeliveryReceipt;
  delivery_hash: string;
  tx_id: string;
  explorer_url: string;
}

export interface VerificationCheck {
  name: string;
  passed: boolean;
  expected: string;
  actual: string;
}

export interface VerificationResult {
  passed: boolean;
  score: number;
  checks: VerificationCheck[];
  summary: string;
}

export interface VerifyReleaseResponse {
  verification: VerificationResult;
  released: boolean;
  release_tx_id?: string;
  refund_tx_id?: string;
  explorer_url?: string;
}

export type AppStage =
  | "chat"
  | "quotes"
  | "negotiating"
  | "negotiated"
  | "escrowing"
  | "escrowed"
  | "delivering"
  | "delivered"
  | "verifying"
  | "settled"
  | "refunded";
