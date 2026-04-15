"use client";

import { ReactNode } from "react";
import { Toaster } from "react-hot-toast";
import { ShipmentProvider } from "@/context/ShipmentContext";

export default function Providers({ children }: { children: ReactNode }) {
  return (
    <ShipmentProvider>
      {children}
      <Toaster
        position="top-right"
        gutter={8}
        toastOptions={{
          duration: 4500,
          style: {
            background: "#ffffff",
            color: "#0b1c30",
            border: "1px solid #e2e8f0",
            borderRadius: "14px",
            fontSize: "13px",
            fontWeight: 500,
            boxShadow: "0 8px 24px rgba(0,0,0,0.10)",
            padding: "12px 16px",
          },
          success: { iconTheme: { primary: "#006c47", secondary: "#fff" } },
          error:   { iconTheme: { primary: "#ba1a1a", secondary: "#fff" } },
          loading: { iconTheme: { primary: "#006591", secondary: "#fff" } },
        }}
      />
    </ShipmentProvider>
  );
}
