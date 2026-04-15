"""Delete all zombie escrow apps to recover locked min-balance ALGO."""
import sys
sys.path.insert(0, ".")
from backend.algorand_client import get_algod_client, get_buyer_account, delete_escrow

client = get_algod_client()
buyer_addr, _ = get_buyer_account()
info = client.account_info(buyer_addr)
apps = info.get("created-apps", [])
bal = info["amount"] / 1e6
min_bal = info["min-balance"] / 1e6

print(f"Balance:    {bal:.4f} ALGO")
print(f"Min-locked: {min_bal:.4f} ALGO")
print(f"Spendable:  {bal - min_bal:.4f} ALGO")
print(f"Zombie apps to delete: {len(apps)}")

for a in apps:
    app_id = a["id"]
    try:
        tx = delete_escrow(app_id)
        print(f"  OK Deleted app {app_id}  TX: {tx}")
    except Exception as e:
        print(f"  SKIP app {app_id}: {str(e)[:80]}")

info2 = client.account_info(buyer_addr)
bal2 = info2["amount"] / 1e6
min2 = info2["min-balance"] / 1e6
print(f"\nAfter cleanup:")
print(f"  Balance:   {bal2:.4f} ALGO")
print(f"  Spendable: {bal2 - min2:.4f} ALGO  (+{(bal2-min2)-(bal-min_bal):.4f} recovered)")
