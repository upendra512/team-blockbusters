# A2A Freight Commerce — Setup Guide

## Overview
Autonomous P2P freight negotiation and settlement on Algorand Testnet.
Buyer AI agent ↔ Carrier AI agents · Live market data · On-chain escrow.

---

## Prerequisites
- Python 3.12+, Poetry
- Node.js 18+
- AlgoKit CLI: `pip install algokit`
- API Keys: Gemini, OpenRouteService, OpenWeatherMap (all free tier)

---

## Step 1 — Generate & Fund Wallets

```bash
cd projects/algo_hack
poetry install
poetry run python backend/setup_wallets.py
```

Copy the `.env` output to `projects/algo_hack/.env`.
Fund all 4 addresses at: https://bank.testnet.algorand.network/

---

## Step 2 — Build Smart Contract

```bash
cd projects/algo_hack
poetry run python -m smart_contracts build
```

This compiles `smart_contracts/escrow/contract.py` → generates:
- `smart_contracts/artifacts/escrow/CommerceEscrow.approval.teal`
- `smart_contracts/artifacts/escrow/CommerceEscrow.clear.teal`
- `smart_contracts/artifacts/escrow/CommerceEscrow.arc56.json`

---

## Step 3 — Install Backend Dependencies

```bash
cd projects/algo_hack
pip install -r backend/requirements.txt
```

Or add to poetry:
```bash
poetry add fastapi uvicorn sse-starlette google-generativeai httpx algosdk pydantic-settings
```

---

## Step 4 — Start Backend

```bash
cd projects/algo_hack
uvicorn backend.main:app --reload --port 8000
```

Verify: http://localhost:8000/api/health
Check wallets: http://localhost:8000/api/setup/wallets

---

## Step 5 — Start Frontend

```bash
cd frontend
npm install
npm run dev
```

Open: http://localhost:3000

---

## Demo Flow

1. **Chat** — Type "I want to ship 20kg of clothing from Mumbai to Delhi"
2. **Answer questions** — Intent agent asks for pincodes, dimensions, budget
3. **Start Negotiation** — Live quotes fetched; AI agents negotiate in real time
4. **Lock Escrow** — Agreed ALGO amount locked in smart contract on Algorand Testnet
5. **Carrier Delivers** — Carrier agent submits delivery receipt hash on-chain
6. **Verify & Release** — 5 programmatic checks run; payment auto-released to carrier

---

## Live Data Sources

| Data | Source | Auth |
|------|--------|------|
| Road distance | OpenRouteService + Nominatim | Free API key |
| Indian diesel price | Public fuel data | None (cached fallback) |
| Route weather | OpenWeatherMap | Free API key |
| ALGO/INR rate | CoinGecko | None |
| Pincode → city | India Post API | None |
