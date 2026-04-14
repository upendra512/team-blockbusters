# A2A Freight Commerce — AlgoBharat Hack Series 3

> Autonomous agent-to-agent freight negotiation and trustless settlement on Algorand Testnet.

Built for **AlgoBharat Hack Series 3 | Round 2 | Focus Area 2: Agentic Commerce**

---

## The Problem

AI agents today can reason and act, but they lack standardized infrastructure to autonomously discover services, negotiate terms, and perform trusted payments between each other. Current commerce systems are human-centric — requiring manual approvals, phone calls, and centralized payment intermediaries. This completely blocks agents from participating in a machine-to-machine economy.

In Indian freight specifically: small manufacturers need independent truckers, currently coordinated via WhatsApp groups and phone calls. Neither party trusts the other. Payments are disputed. There is no neutral arbitrator.

---

## The Solution

A **P2P Agentic Commerce Framework** where:

- A **Buyer AI agent** (representing a shipper) describes what it needs in plain language
- **Carrier AI agents** (representing independent freight operators) compete with live-computed quotes
- Agents **negotiate autonomously** using LLM intelligence and live market data
- The agreed payment is **locked in a smart contract escrow** on Algorand — neither side can cheat
- After delivery, **5 programmatic checks** verify the receipt and automatically release or refund funds

No human approvals. No centralized payment gateway. Blockchain is the only trust mechanism.

---

## Live Demo Flow

```
User types: "I want to ship 20kg clothing from Mumbai to Delhi"
        ↓
Intent Agent extracts: pincodes, weight, dimensions, budget
        ↓
Live data fetched in parallel:
  • Road distance  → OpenRouteService API (1,363 km live)
  • Diesel price   → PPAC India (₹89.62/litre)
  • Route weather  → Open-Meteo API (live)
  • ALGO/INR rate  → CoinGecko API (live)
        ↓
3 Carrier agents compute dynamic quotes (price = distance × weight × fuel adjustment)
        ↓
Buyer agent opens at 18% below cheapest quote
Carrier agents counter using Llama 3.3 70B (Groq) — up to 5 rounds
        ↓
Agreement reached → Convert INR → ALGO at live rate
        ↓
[On-chain] CommerceEscrow contract deployed on Algorand Testnet
[On-chain] Buyer locks ALGO in escrow → TX visible on explorer
        ↓
Carrier agent submits delivery receipt
[On-chain] Delivery hash stored on-chain → TX visible on explorer
        ↓
AI verifier runs 5 programmatic checks:
  ✓ Truck number format (Indian RTO)
  ✓ Pickup timestamp after escrow lock
  ✓ Route distance matches OpenRouteService ±15%
  ✓ Origin/destination pincodes match
  ✓ Agreed price matches escrow ±1%
        ↓
All pass → [On-chain] release_payment() → ALGO sent to carrier
Any fail → [On-chain] refund_buyer() → ALGO returned
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Next.js Frontend (port 3000)                                   │
│  Chat Interface | Live Negotiation Log | Escrow + TX Explorer   │
└──────────────────────────┬──────────────────────────────────────┘
                           │ HTTP / SSE
┌──────────────────────────▼──────────────────────────────────────┐
│  FastAPI Backend (port 8001)                                    │
│                                                                  │
│  Intent Agent ──── Groq (Llama 3.3 70B) ──── Chat extraction   │
│  Buyer Agent  ──── Live data + LLM ────────── Negotiation       │
│  Seller Agents ─── 3 carriers, dynamic quotes                   │
│  Negotiation ──── SSE stream to frontend                        │
│  Verification ─── 5 programmatic checks (no LLM)               │
│  Algorand Client ─ Deploy, fund, call smart contract            │
└──────────────────────────┬──────────────────────────────────────┘
          ┌────────────────┴─────────────────────┐
          │ Live External APIs                    │ Algorand Testnet
          │                                       │
          │ • OpenRouteService  (road distance)   │ CommerceEscrow Contract
          │ • Open-Meteo        (weather, free)   │   create_deal()
          │ • CoinGecko         (ALGO/INR, free)  │   submit_delivery()
          │ • India Post        (pincode lookup)  │   release_payment()
          │ • PPAC India        (diesel price)    │   refund_buyer()
          └───────────────────────────────────────┘
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Smart Contract | Algorand Python (algopy v3) + PuyA compiler + AlgoKit |
| Blockchain | Algorand Testnet via AlgoNode (free) |
| Backend | FastAPI + Python 3.12 |
| LLM / AI | Groq API — Llama 3.3 70B Versatile (free tier) |
| Agent Framework | Custom async agents with SSE streaming |
| Frontend | Next.js 14 + Tailwind CSS |
| Live Data | OpenRouteService · Open-Meteo · CoinGecko · India Post |

---

## Project Structure

```
algo_hack/
├── projects/algo_hack/
│   ├── smart_contracts/
│   │   └── escrow/
│   │       └── contract.py          # CommerceEscrow ARC4 contract
│   ├── backend/
│   │   ├── main.py                  # FastAPI routes + SSE
│   │   ├── algorand_client.py       # On-chain interactions
│   │   ├── negotiation.py           # Negotiation orchestrator
│   │   ├── verification.py          # Delivery verification
│   │   ├── agents/
│   │   │   ├── intent_agent.py      # Chat → ShipmentIntent
│   │   │   ├── buyer_agent.py       # Buyer pricing strategy
│   │   │   └── seller_agent.py      # 3 carrier agents
│   │   └── services/
│   │       ├── route_service.py     # OpenRouteService distance
│   │       ├── weather_service.py   # Open-Meteo weather
│   │       ├── coingecko_service.py # ALGO/INR live rate
│   │       ├── fuel_service.py      # Diesel price
│   │       └── pincode_service.py   # India Post pincode lookup
│   └── pyproject.toml
└── frontend/
    └── src/
        ├── app/page.tsx             # Main demo page
        └── components/
            ├── ChatInterface.tsx    # Intent agent chat
            ├── NegotiationLog.tsx   # Live negotiation feed
            ├── EscrowCard.tsx       # On-chain TX links
            └── VerificationPanel.tsx
```

---

## Smart Contract

**`CommerceEscrow`** — ARC4 contract on Algorand, written in Algorand Python

| Method | Caller | Action |
|--------|--------|--------|
| `create_deal(seller, service_hash, payment)` | Buyer | Locks ALGO in contract (atomic with payment txn) |
| `submit_delivery(delivery_hash)` | Seller | Stores SHA-256 of delivery receipt on-chain |
| `release_payment()` | Buyer | Inner txn sends ALGO to seller |
| `refund_buyer()` | Buyer | Inner txn returns ALGO to buyer |
| `get_status()` | Anyone | Returns status code (1=LOCKED, 2=DELIVERED, 3=SETTLED, 4=REFUNDED) |

---

## Setup & Run

### Prerequisites
- Python 3.12+, Poetry
- Node.js 18+
- AlgoKit CLI: `pip install algokit`
- API Keys: [Groq](https://console.groq.com) (free) · [OpenRouteService](https://openrouteservice.org) (free)

### Step 1 — Clone & generate wallets
```bash
git clone https://github.com/upendra512/team-blockbusters
cd team-blockbusters/projects/algo_hack

# Create Python venv with Python 3.12
python3.12 -m venv .venv

# Install dependencies
.venv/Scripts/pip install -r backend/requirements.txt
.venv/Scripts/pip install algokit-utils algorand-python puyapy

# Generate 4 testnet wallets
.venv/Scripts/python backend/setup_wallets.py
```

### Step 2 — Configure `.env`
```bash
cp backend/.env.example .env
# Fill in the generated mnemonics + API keys
```

```env
ALGORAND_ALGOD_URL=https://testnet-api.algonode.cloud
ALGORAND_ALGOD_TOKEN=

BUYER_MNEMONIC=<25-word mnemonic>
SELLER_A_MNEMONIC=<25-word mnemonic>
SELLER_B_MNEMONIC=<25-word mnemonic>
SELLER_C_MNEMONIC=<25-word mnemonic>

GROQ_API_KEY=gsk_...
OPENROUTESERVICE_API_KEY=eyJ...
```

### Step 3 — Fund wallets
Go to **https://bank.testnet.algorand.network/** and fund:
- Buyer address with **10 ALGO**
- Each carrier address with **5 ALGO**

### Step 4 — Build smart contract
```bash
cd projects/algo_hack
VIRTUAL_ENV=.venv .venv/Scripts/puyapy smart_contracts/escrow/contract.py \
  --out-dir smart_contracts/artifacts/escrow
```

### Step 5 — Start backend
```bash
cd projects/algo_hack
.venv/Scripts/python -m uvicorn backend.main:app --port 8001
```

### Step 6 — Start frontend
```bash
cd frontend
npm install
npm run dev
```

Open **http://localhost:3000**

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/chat/message` | Intent agent chat |
| POST | `/api/freight/quotes` | Fetch live carrier quotes |
| GET | `/api/freight/negotiate/stream` | SSE negotiation stream |
| POST | `/api/freight/escrow/create` | Deploy + lock escrow on-chain |
| POST | `/api/freight/escrow/{id}/deliver` | Carrier submits delivery |
| POST | `/api/freight/escrow/{id}/verify-release` | Verify + release/refund |
| GET | `/api/freight/escrow/{id}/status` | Poll contract state |
| GET | `/api/setup/wallets` | View wallet addresses for funding |

---

## Why Algorand

- **Fast finality** — transactions confirmed in ~3.5 seconds, ideal for agent interactions
- **Low fees** — 0.001 ALGO per transaction, viable for micro-payments
- **ARC4 smart contracts** — typed ABI with atomic group transactions for secure escrow
- **AlgoNode** — free public testnet access, no infrastructure needed
- **On-chain transparency** — every step (lock, deliver, release) has a verifiable TX ID on Algorand Explorer

---

## Team

**Team Blockbusters** — AlgoBharat Hack Series 3, Round 2

---

*Built on Algorand Testnet. All transactions verifiable at [testnet.algoexplorer.io](https://testnet.algoexplorer.io)*
