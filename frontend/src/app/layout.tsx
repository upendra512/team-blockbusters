import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "A2A Freight Commerce — Powered by Algorand",
  description: "Autonomous agent-to-agent freight negotiation and settlement on Algorand",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
