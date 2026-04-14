# A2A Freight Commerce — AlgoBharat Hack Series 3

> Autonomous AI agents discover, negotiate, escrow, and settle freight deals on Algorand — zero human intervention after intent.

**AlgoBharat Hack Series 3 | Round 2 | Focus Area 2: Agentic Commerce**
**Problem Statement 7: A2A Agentic Commerce Framework**

---

## The Problem

AI agents today can reason and act, but they have no standardized infrastructure to autonomously **discover services, negotiate terms, and perform trusted payments with each other**. Every commerce system today is human-centric — manual approvals, phone calls, centralized intermediaries. This blocks agents from participating in a machine-to-machine economy.

In Indian freight: small manufacturers need independent truckers. Currently done over WhatsApp groups and phone calls. No trust, no standard pricing, frequent payment disputes. No neutral arbitrator exists between strangers.

**This is exactly the gap A2A commerce solves.**

---

## What is A2A Commerce?

**A2A (Agent-to-Agent)** commerce means AI agents transact autonomously on behalf of their principals — without a human approving each step.

In our system:

| Who | Role | What they do autonomously |
|-----|------|--------------------------|
| **Intent Agent** | Extracts human's shipping need via chat | Collects all shipment parameters, validates pincodes |
| **Buyer Agent** | Represents the shipper | Fetches live market data, computes fair price, opens negotiation, decides when to accept |
| **Carrier Agents (×3)** | Represent independent freight operators | Compute dynamic quotes from live diesel prices, negotiate using LLM, decide minimum price |
| **Verification Agent** | Neutral arbiter | Runs 5 programmatic checks on delivery receipt |
| **Settlement Agent** | Executes on-chain | Calls `release_payment()` or `refund_buyer()` on Algorand — no human needed |

> **The human types their shipment need once. After that, every decision, negotiation round, blockchain transaction, and settlement is driven by agents.**

---

## The A2A Flow

```
Human: "Ship 20kg clothing from Mumbai to Delhi, budget ₹1000"
                        ↓
            ┌───────────────────────┐
            │    INTENT AGENT       │  ← Extracts: pincodes, weight,
            │  (Groq Llama 3.3 70B) │    dimensions, pickup date, budget
            └───────────┬───────────┘
                        ↓
        ┌───────────────────────────────┐
        │        BUYER AGENT            │
        │  Fetches live data:           │
        │  • Route: 1363km (ORS API)    │
        │  • Diesel: ₹89.62/L (live)   │
        │  • Weather: Clear (Open-Meteo)│
        │  • ALGO: ₹49.48 (CoinGecko)  │
        │  Computes fair price: ₹680   │
        │  Opening offer: ₹615 (-18%)  │
        └──────────┬────────────────────┘
                   │ A2A negotiation
     ┌─────────────┼──────────────────────┐
     ▼             ▼                      ▼
CARRIER A      CARRIER B             CARRIER C
SpeedFreight   EcoLogistics          TrustFreight
₹856           ₹702                  ₹990
     │             │  (cheapest → negotiates)
     └─────────────┼──────────────────────┘
                   │
        ┌──────────▼──────────┐
        │  NEGOTIATION ENGINE │
        │  Round 1: Buy ₹615  │
        │  Round 2: Sel ₹702  │
        │  Round 3: Buy ₹650  │
        │  Round 4: Sel ₹672  │
        │  Round 5: AGREED ₹660│
        └──────────┬──────────┘
                   │
        ┌──────────▼──────────────────────────┐
        │  ALGORAND SMART CONTRACT ESCROW      │
        │  ₹660 → 13.33 ALGO (live rate)      │
        │  Buyer Agent signs + submits TX      │  ← On-chain
        │  Funds LOCKED in CommerceEscrow      │
        └──────────┬──────────────────────────┘
                   │
        ┌──────────▼──────────────────────────┐
        │  CARRIER AGENT delivers              │
        │  Submits delivery receipt hash       │  ← On-chain
        │  SHA256 stored immutably on Algorand │
        └──────────┬──────────────────────────┘
                   │
        ┌──────────▼──────────────────────────┐
        │  VERIFICATION AGENT (5 checks)       │
        │  ✓ Truck number: valid RTO format    │
        │  ✓ Pickup time: after escrow lock    │
        │  ✓ Distance: matches ORS ±15%        │
        │  ✓ Pincodes: match agreed shipment   │
        │  ✓ Price: matches escrow ±1%         │
        └──────────┬──────────────────────────┘
                   │ All pass
        ┌──────────▼──────────────────────────┐
        │  SETTLEMENT AGENT                    │
        │  Calls release_payment() on-chain    │  ← On-chain
        │  13.33 ALGO → Carrier wallet         │
        │  TX visible on Algorand Explorer     │
        └─────────────────────────────────────┘
```

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│  Next.js Frontend (port 3000)                                    │
│  Chat Panel | Live A2A Negotiation Feed | Escrow + TX Links      │
└───────────────────────────┬──────────────────────────────────────┘
                            │ HTTP / Server-Sent Events (SSE)
┌───────────────────────────▼──────────────────────────────────────┐
│  FastAPI Backend (port 8001)                                     │
│                                                                   │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │
│  │  Intent Agent   │  │  Buyer Agent    │  │ Carrier Agents  │  │
│  │  Groq LLM chat  │  │  Live data +    │  │  ×3, dynamic    │  │
│  │  extraction     │  │  LLM strategy   │  │  quotes + LLM   │  │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘  │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │  Negotiation Orchestrator (SSE streaming to frontend)       │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                                                                   │
│  ┌─────────────────────────┐  ┌──────────────────────────────┐  │
│  │  Verification Agent     │  │  Algorand Client              │  │
│  │  5 programmatic checks  │  │  deploy · lock · verify · pay │  │
│  └─────────────────────────┘  └──────────────────────────────┘  │
└───────────────────────────┬──────────────────────────────────────┘
           ┌────────────────┴────────────────────┐
           │ Live Data APIs                       │ Algorand Testnet
           │                                      │
           │ OpenRouteService → road distance      │ CommerceEscrow Contract
           │ Open-Meteo       → weather (free)     │   create_deal()
           │ CoinGecko        → ALGO/INR rate      │   submit_delivery()
           │ India Post       → pincode validation │   release_payment()
           │ PPAC India       → diesel price       │   refund_buyer()
           └──────────────────────────────────────┘
```

---

## Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| Smart Contract | Algorand Python (algopy v3) + AlgoKit | ARC4, typed ABI, atomic grouped txns |
| Blockchain | Algorand Testnet via AlgoNode | 3.5s finality, low fees, transparent |
| Backend | FastAPI + Python 3.12 | Async, SSE streaming, same language as contracts |
| LLM / Agents | Groq API — Llama 3.3 70B (free tier) | Fast inference for real-time negotiation |
| Frontend | Next.js 14 + Tailwind CSS | Real-time SSE feed, clean demo UI |
| Route Data | OpenRouteService | Live road distance between Indian pincodes |
| Weather | Open-Meteo (no key needed) | Route weather for ETA risk assessment |
| Crypto Rate | CoinGecko (no key needed) | Live INR→ALGO conversion for escrow |

---

## Smart Contract: `CommerceEscrow`

ARC4 contract on Algorand — the trust backbone of A2A commerce.

```python
class CommerceEscrow(ARC4Contract):
    # Global state: buyer, seller, amount, service_hash, delivery_hash, status

    def create_deal(seller, service_hash, payment: PaymentTransaction) → UInt64
    # Buyer agent calls this atomically with payment → funds locked

    def submit_delivery(delivery_hash: String) → None
    # Carrier agent submits SHA-256 of delivery receipt → stored on-chain

    def release_payment() → None
    # Buyer/settlement agent triggers inner txn → ALGO sent to carrier

    def refund_buyer() → None
    # If verification fails → ALGO returned to buyer
```

**Status codes:** 1=LOCKED · 2=DELIVERED · 3=SETTLED · 4=REFUNDED

Every state transition is an on-chain transaction visible on Algorand Explorer.

---

## Why Algorand for A2A Commerce

- **3.5s finality** — agents can't wait minutes per transaction
- **Atomic group transactions** — payment + contract call happen together, or neither does
- **Transparent on-chain state** — any agent can read escrow status via API
- **Low fees (0.001 ALGO)** — viable for micro-payments between agents
- **ARC4 ABI** — typed, discoverable contract interface agents can call programmatically
- **No trusted third party** — the smart contract IS the arbiter, not a company

---

## Project Structure

```
algo_hack/
├── README.md
├── SETUP.md
├── projects/algo_hack/
│   ├── smart_contracts/
│   │   └── escrow/contract.py          ← CommerceEscrow ARC4 contract
│   └── backend/
│       ├── main.py                      ← FastAPI routes + SSE
│       ├── algorand_client.py           ← On-chain deploy/call/read
│       ├── negotiation.py               ← A2A negotiation orchestrator
│       ├── verification.py              ← 5-check delivery verifier
│       ├── agents/
│       │   ├── intent_agent.py          ← Chat → ShipmentIntent
│       │   ├── buyer_agent.py           ← Buyer pricing + negotiation
│       │   └── seller_agent.py          ← 3 carrier agents (dynamic quotes)
│       └── services/
│           ├── route_service.py         ← OpenRouteService distance
│           ├── weather_service.py       ← Open-Meteo weather
│           ├── coingecko_service.py     ← ALGO/INR live rate
│           ├── fuel_service.py          ← Diesel price
│           └── pincode_service.py       ← India Post lookup
└── frontend/src/
    ├── app/page.tsx                     ← Main demo page
    └── components/
        ├── ChatInterface.tsx            ← Human → Intent Agent chat
        ├── NegotiationLog.tsx           ← Live A2A negotiation feed
        ├── EscrowCard.tsx               ← On-chain TX links + status
        └── VerificationPanel.tsx        ← 5-check verification results
```

---

## Setup & Run

### Prerequisites
- Python 3.12, Node.js 18+
- Free API keys: [Groq](https://console.groq.com) · [OpenRouteService](https://openrouteservice.org)

### 1. Generate wallets
```bash
cd projects/algo_hack
python3.12 -m venv .venv
.venv/Scripts/pip install py-algorand-sdk
.venv/Scripts/python backend/setup_wallets.py
```

### 2. Configure `.env`
```env
ALGORAND_ALGOD_URL=https://testnet-api.algonode.cloud
BUYER_MNEMONIC=<25-word mnemonic>
SELLER_A_MNEMONIC=<25-word mnemonic>
SELLER_B_MNEMONIC=<25-word mnemonic>
SELLER_C_MNEMONIC=<25-word mnemonic>
GROQ_API_KEY=gsk_...
OPENROUTESERVICE_API_KEY=eyJ...
```

### 3. Fund wallets on Algorand Testnet
Visit **https://bank.testnet.algorand.network/**
- Buyer: 10 ALGO · Each carrier: 5 ALGO

### 4. Build smart contract
```bash
VIRTUAL_ENV=.venv .venv/Scripts/puyapy \
  smart_contracts/escrow/contract.py \
  --out-dir smart_contracts/artifacts/escrow
```

### 5. Start backend
```bash
.venv/Scripts/python -m uvicorn backend.main:app --port 8001
```

### 6. Start frontend
```bash
cd ../../frontend && npm install && npm run dev
```

Open **http://localhost:3000**

---

## API Reference

| Method | Endpoint | Agent | Description |
|--------|----------|-------|-------------|
| POST | `/api/chat/message` | Intent Agent | Extract shipment details from natural language |
| POST | `/api/freight/quotes` | Buyer Agent | Fetch live quotes from all carrier agents |
| GET | `/api/freight/negotiate/stream` | Buyer + Carrier Agents | SSE stream of A2A negotiation |
| POST | `/api/freight/escrow/create` | Settlement Agent | Deploy contract + lock ALGO on-chain |
| POST | `/api/freight/escrow/{id}/deliver` | Carrier Agent | Submit delivery receipt hash on-chain |
| POST | `/api/freight/escrow/{id}/verify-release` | Verification Agent | Run checks + release or refund on-chain |
| GET | `/api/freight/escrow/{id}/status` | Any | Poll current on-chain contract state |

---

## Team Blockbusters
AlgoBharat Hack Series 3 · Round 2 · Focus Area 2: Agentic Commerce

*All transactions verifiable on [Algorand Testnet Explorer](https://testnet.algoexplorer.io)*
