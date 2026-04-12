"""
Run this once to generate 4 testnet wallets (buyer + 3 carriers).
Then fund each address at https://bank.testnet.algorand.network/

Usage:
    cd projects/algo_hack
    poetry run python backend/setup_wallets.py
"""
import algosdk


def generate_wallet(label: str) -> tuple[str, str]:
    private_key, address = algosdk.account.generate_account()
    phrase = algosdk.mnemonic.from_private_key(private_key)
    print(f"\n{'='*60}")
    print(f"  {label}")
    print(f"  Address : {address}")
    print(f"  Mnemonic: {phrase}")
    print(f"  Fund at : https://bank.testnet.algorand.network/")
    return phrase, address


if __name__ == "__main__":
    print("\nGenerating A2A Freight Demo Wallets")
    print("Add the mnemonics to projects/algo_hack/.env\n")

    buyer_mn, buyer_addr = generate_wallet("BUYER (Shipper Agent)")
    sa_mn, sa_addr = generate_wallet("SELLER_A — SpeedFreight India (carrier_a)")
    sb_mn, sb_addr = generate_wallet("SELLER_B — EcoLogistics (carrier_b)")
    sc_mn, sc_addr = generate_wallet("SELLER_C — TrustFreight (carrier_c)")

    print(f"\n{'='*60}")
    print(".env contents (copy to projects/algo_hack/.env):\n")
    print(f"BUYER_MNEMONIC={buyer_mn}")
    print(f"SELLER_A_MNEMONIC={sa_mn}")
    print(f"SELLER_B_MNEMONIC={sb_mn}")
    print(f"SELLER_C_MNEMONIC={sc_mn}")
    print(f"\nALGORAND_ALGOD_URL=https://testnet-api.algonode.cloud")
    print(f"ALGORAND_ALGOD_TOKEN=")
    print(f"\nGEMINI_API_KEY=<your-key-from-aistudio.google.com>")
    print(f"OPENROUTESERVICE_API_KEY=<your-key-from-openrouteservice.org>")
    print(f"OPENWEATHERMAP_API_KEY=<your-key-from-openweathermap.org>")
    print(f"\nFund all 4 addresses with testnet ALGO before running the demo.")
    print(f"Each needs at least 5 ALGO. Buyer needs at least 10 ALGO.\n")
