"use client";

import type { VerifyReleaseResponse, DeliverResponse } from "@/lib/types";

interface VerificationPanelProps {
  delivery?: DeliverResponse;
  result?: VerifyReleaseResponse;
}

export default function VerificationPanel({ delivery, result }: VerificationPanelProps) {
  if (!delivery && !result) return null;

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-5">
      <h3 className="text-sm font-semibold text-zinc-100">Delivery & Verification</h3>

      {/* Delivery receipt */}
      {delivery && (
        <div>
          <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest mb-3">
            Delivery Receipt
          </p>
          <div className="grid grid-cols-2 gap-y-2 gap-x-4 text-xs">
            {[
              ["Truck",    delivery.delivery_receipt.truck_number],
              ["Driver",   delivery.delivery_receipt.driver_name],
              ["Carrier",  delivery.delivery_receipt.carrier_name],
              ["Weight",   `${delivery.delivery_receipt.weight_kg} kg`],
              ["Distance", `${delivery.delivery_receipt.route_distance_km} km`],
              ["Price",    `₹${delivery.delivery_receipt.agreed_price_inr.toFixed(0)}`],
            ].map(([label, val]) => (
              <div key={label} className="flex flex-col gap-0.5">
                <span className="text-zinc-600">{label}</span>
                <span className="text-zinc-200 font-medium">{val}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Divider between sections */}
      {delivery && result && <div className="divider-glow" />}

      {/* Verification checks */}
      {result && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest">
              AI Verification
            </p>
            <span className={`text-xs font-bold px-2.5 py-1 rounded-full ring-1 ${
              result.verification.passed
                ? "bg-emerald-500/10 text-emerald-400 ring-emerald-500/30"
                : "bg-red-500/10 text-red-400 ring-red-500/30"
            }`}>
              {result.verification.score}/5
            </span>
          </div>

          {/* Score bar */}
          <div className="h-1 bg-zinc-800 rounded-full mb-4 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-700 ${
                result.verification.passed ? "bg-emerald-500" : "bg-red-500"
              }`}
              style={{ width: `${(result.verification.score / 5) * 100}%` }}
            />
          </div>

          <div className="space-y-2">
            {result.verification.checks.map((check, i) => (
              <div key={i} className={`flex items-start gap-2.5 text-xs rounded-xl px-3 py-2 ${
                check.passed
                  ? "bg-emerald-500/5 border border-emerald-500/15"
                  : "bg-red-500/5 border border-red-500/15"
              }`}>
                {/* Check icon */}
                <div className={`w-4 h-4 rounded-full flex-shrink-0 flex items-center justify-center mt-0.5 ${
                  check.passed ? "bg-emerald-500/20" : "bg-red-500/20"
                }`}>
                  <span className={`text-[10px] font-bold ${check.passed ? "text-emerald-400" : "text-red-400"}`}>
                    {check.passed ? "✓" : "✗"}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`font-medium ${check.passed ? "text-zinc-200" : "text-zinc-300"}`}>
                    {check.name}
                  </p>
                  {!check.passed && (
                    <p className="text-red-400/80 text-[10px] mt-0.5 truncate">
                      Expected: {check.expected}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Summary */}
          <div className={`mt-3 text-xs font-medium px-3 py-2.5 rounded-xl ${
            result.verification.passed
              ? "bg-emerald-500/10 text-emerald-300 border border-emerald-500/20"
              : "bg-red-500/10 text-red-300 border border-red-500/20"
          }`}>
            {result.verification.summary}
          </div>
        </div>
      )}
    </div>
  );
}
