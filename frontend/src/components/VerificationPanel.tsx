"use client";

import type { VerifyReleaseResponse, DeliverResponse } from "@/lib/types";

interface VerificationPanelProps {
  delivery?: DeliverResponse;
  result?: VerifyReleaseResponse;
}

export default function VerificationPanel({ delivery, result }: VerificationPanelProps) {
  if (!delivery && !result) return null;

  return (
    <div className="bg-algo-card border border-algo-border rounded-xl p-4 space-y-4">
      <h3 className="font-semibold text-algo-text">Delivery & Verification</h3>

      {/* Delivery receipt */}
      {delivery && (
        <div className="space-y-2">
          <p className="text-xs text-algo-muted uppercase tracking-wider">Delivery Receipt</p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            {[
              ["Truck", delivery.delivery_receipt.truck_number],
              ["Driver", delivery.delivery_receipt.driver_name],
              ["Carrier", delivery.delivery_receipt.carrier_name],
              ["Weight", `${delivery.delivery_receipt.weight_kg} kg`],
              ["Distance", `${delivery.delivery_receipt.route_distance_km} km`],
              ["Price", `₹${delivery.delivery_receipt.agreed_price_inr.toFixed(0)}`],
            ].map(([label, val]) => (
              <div key={label}>
                <span className="text-algo-muted">{label}: </span>
                <span className="text-algo-text">{val}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Verification checks */}
      {result && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <p className="text-xs text-algo-muted uppercase tracking-wider">AI Verification</p>
            <span className={`text-xs font-bold px-2 py-0.5 rounded ${
              result.verification.passed
                ? "bg-algo-green/20 text-algo-green"
                : "bg-red-900/30 text-red-400"
            }`}>
              {result.verification.score}/5 checks passed
            </span>
          </div>

          <div className="space-y-1">
            {result.verification.checks.map((check, i) => (
              <div key={i} className="flex items-start gap-2 text-sm">
                <span className={check.passed ? "text-algo-green" : "text-red-400"}>
                  {check.passed ? "✓" : "✗"}
                </span>
                <div className="flex-1 min-w-0">
                  <span className="text-algo-text">{check.name}</span>
                  {!check.passed && (
                    <p className="text-xs text-red-400 truncate">
                      Expected: {check.expected} | Got: {check.actual}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className={`text-sm font-medium p-2 rounded ${
            result.verification.passed
              ? "bg-algo-green/10 text-algo-green"
              : "bg-red-900/20 text-red-400"
          }`}>
            {result.verification.summary}
          </div>
        </div>
      )}
    </div>
  );
}
