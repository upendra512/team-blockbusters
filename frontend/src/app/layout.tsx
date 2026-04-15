import type { Metadata } from "next";
import { Toaster } from "react-hot-toast";
import "./globals.css";

export const metadata: Metadata = {
  title: "A2A Freight Commerce — Powered by Algorand",
  description: "Autonomous agent-to-agent freight negotiation and settlement on Algorand",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <Toaster
          position="top-right"
          gutter={10}
          toastOptions={{
            duration: 4000,
            style: {
              background: "#18181b",
              color: "#f4f4f5",
              border: "1px solid #3f3f46",
              borderRadius: "12px",
              fontSize: "13px",
              padding: "10px 14px",
            },
            success: {
              iconTheme: { primary: "#34d399", secondary: "#18181b" },
            },
            error: {
              iconTheme: { primary: "#f87171", secondary: "#18181b" },
            },
            loading: {
              iconTheme: { primary: "#38bdf8", secondary: "#18181b" },
            },
          }}
        />
      </body>
    </html>
  );
}
