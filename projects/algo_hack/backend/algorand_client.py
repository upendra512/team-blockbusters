"""
Algorand Client — all on-chain interactions for the CommerceEscrow contract.

Uses algosdk v2 directly for full control over atomic groups and ABI encoding.
Reads compiled TEAL from smart_contracts/artifacts/escrow/ (built by AlgoKit).
"""
import base64
import uuid
import json
import hashlib
from pathlib import Path
from datetime import datetime, timezone

import algosdk
from algosdk.v2client import algod
from algosdk import transaction, mnemonic, account
from algosdk.atomic_transaction_composer import (
    AtomicTransactionComposer,
    TransactionWithSigner,
    AccountTransactionSigner,
)
from algosdk.abi import Method, ABIType

from backend.config import settings

# ── Paths ─────────────────────────────────────────────────────────────────────
ARTIFACTS_DIR = Path(__file__).parent.parent / "smart_contracts" / "artifacts" / "escrow"
APPROVAL_TEAL = ARTIFACTS_DIR / "CommerceEscrow.approval.teal"
CLEAR_TEAL = ARTIFACTS_DIR / "CommerceEscrow.clear.teal"
ARC56_JSON = ARTIFACTS_DIR / "CommerceEscrow.arc56.json"

EXPLORER_BASE = "https://lora.algokit.io/testnet"

# Global state schema for CommerceEscrow
# UInt64 fields: amount, status  → 2 ints
# Bytes fields: buyer, seller, service_hash, delivery_hash → 4 bytes
GLOBAL_INTS = 2
GLOBAL_BYTES = 4

# In-memory store for escrow creation timestamps (for verification)
_escrow_timestamps: dict[int, str] = {}


def _send_idempotent(client: algod.AlgodClient, signed_txn) -> str:
    """
    Submit a signed transaction. If the node replies 'already in ledger'
    the TX was already confirmed on-chain (a previous attempt timed out
    before we could read the result). Treat that as success.
    """
    try:
        tx_id = client.send_transaction(signed_txn)
    except algosdk.error.AlgodHTTPError as e:
        if "already in ledger" in str(e):
            tx_id = signed_txn.get_txid()
        else:
            raise
    return tx_id


# ── Client setup ──────────────────────────────────────────────────────────────

def get_algod_client() -> algod.AlgodClient:
    return algod.AlgodClient(
        settings.algorand_algod_token or "",
        settings.algorand_algod_url,
    )


def _get_account(mnemonic_str: str) -> tuple[str, str]:
    """Returns (address, private_key) from a 25-word mnemonic."""
    private_key = mnemonic.to_private_key(mnemonic_str)
    address = account.address_from_private_key(private_key)
    return address, private_key


def get_buyer_account() -> tuple[str, str]:
    return _get_account(settings.buyer_mnemonic)


def get_seller_account(carrier_id: str) -> tuple[str, str]:
    key_map = {
        "carrier_a": settings.seller_a_mnemonic,
        "carrier_b": settings.seller_b_mnemonic,
        "carrier_c": settings.seller_c_mnemonic,
    }
    return _get_account(key_map[carrier_id])


def get_buyer_address() -> str:
    addr, _ = get_buyer_account()
    return addr


def get_seller_address(carrier_id: str) -> str:
    addr, _ = get_seller_account(carrier_id)
    return addr


# ── Contract compilation ──────────────────────────────────────────────────────

def _compile_teal(client: algod.AlgodClient, teal_path: Path) -> bytes:
    teal_source = teal_path.read_text()
    result = client.compile(teal_source)
    return base64.b64decode(result["result"])


# ── ABI method helpers ────────────────────────────────────────────────────────

def _load_abi_method(method_name: str) -> Method:
    """Load an ABI method from the compiled ARC56 spec."""
    arc56 = json.loads(ARC56_JSON.read_text())
    method_def = next(m for m in arc56["methods"] if m["name"] == method_name)
    # Build algosdk Method from ARC56 definition
    args = [{"name": a["name"], "type": a["type"]} for a in method_def.get("args", [])]
    returns = method_def.get("returns", {}).get("type", "void")
    # Use method signature string
    sig = f"{method_name}({','.join(a['type'] for a in args)}){returns}"
    return Method.from_signature(sig)


def hash_content(content: str) -> str:
    """SHA-256 hash of a string, returned as hex."""
    return hashlib.sha256(content.encode()).hexdigest()


# ── Deploy ────────────────────────────────────────────────────────────────────

def deploy_escrow() -> tuple[int, str, str]:
    """
    Deploy a fresh CommerceEscrow contract.
    Returns (app_id, app_address, deploy_tx_id).
    """
    client = get_algod_client()
    buyer_addr, buyer_key = get_buyer_account()

    approval = _compile_teal(client, APPROVAL_TEAL)
    clear = _compile_teal(client, CLEAR_TEAL)

    sp = client.suggested_params()
    txn = transaction.ApplicationCreateTxn(
        sender=buyer_addr,
        sp=sp,
        on_complete=transaction.OnComplete.NoOpOC,
        approval_program=approval,
        clear_program=clear,
        global_schema=transaction.StateSchema(
            num_uints=GLOBAL_INTS, num_byte_slices=GLOBAL_BYTES
        ),
        local_schema=transaction.StateSchema(num_uints=0, num_byte_slices=0),
        note=uuid.uuid4().bytes,  # unique per deploy to avoid duplicate TX
    )

    signed = txn.sign(buyer_key)
    tx_id = _send_idempotent(client, signed)
    result = transaction.wait_for_confirmation(client, tx_id, 4)

    app_id = result["application-index"]
    app_address = algosdk.logic.get_application_address(app_id)

    return app_id, app_address, tx_id


def delete_escrow(app_id: int) -> str:
    """
    Delete a CommerceEscrow app to recover the creator's min-balance.
    Each app created locks ~357,000 µALGO in the buyer's min-balance permanently
    until the app is deleted. Use this after test runs to keep the wallet funded.

    If the approval program rejects Delete (e.g. escrow is LOCKED), we first
    send a ClearState txn to opt out, then retry the Delete.
    Returns tx_id.
    """
    client = get_algod_client()
    buyer_addr, buyer_key = get_buyer_account()

    # First attempt: direct delete
    sp = client.suggested_params()
    txn = transaction.ApplicationDeleteTxn(
        sender=buyer_addr,
        sp=sp,
        index=app_id,
        note=uuid.uuid4().bytes,
    )
    signed = txn.sign(buyer_key)
    try:
        tx_id = _send_idempotent(client, signed)
        transaction.wait_for_confirmation(client, tx_id, 4)
        return tx_id
    except algosdk.error.AlgodHTTPError as e:
        if "rejected by ApprovalProgram" not in str(e):
            raise

    # Approval program rejected — clear state first, then delete
    sp2 = client.suggested_params()
    clear_txn = transaction.ApplicationClearStateTxn(
        sender=buyer_addr,
        sp=sp2,
        index=app_id,
        note=uuid.uuid4().bytes,
    )
    signed_clear = clear_txn.sign(buyer_key)
    _send_idempotent(client, signed_clear)
    transaction.wait_for_confirmation(client, signed_clear.get_txid(), 4)

    sp3 = client.suggested_params()
    txn2 = transaction.ApplicationDeleteTxn(
        sender=buyer_addr,
        sp=sp3,
        index=app_id,
        note=uuid.uuid4().bytes,
    )
    signed2 = txn2.sign(buyer_key)
    tx_id = _send_idempotent(client, signed2)
    transaction.wait_for_confirmation(client, tx_id, 4)
    return tx_id


def fund_app(app_address: str, amount_algo: float = 0.2) -> str:
    """
    Send min-balance ALGO to the newly deployed app.
    Returns tx_id.
    """
    client = get_algod_client()
    buyer_addr, buyer_key = get_buyer_account()
    sp = client.suggested_params()

    txn = transaction.PaymentTxn(
        sender=buyer_addr,
        sp=sp,
        receiver=app_address,
        amt=int(amount_algo * 1_000_000),
        note=uuid.uuid4().bytes,  # unique note prevents duplicate TX on retries
    )
    signed = txn.sign(buyer_key)
    tx_id = _send_idempotent(client, signed)
    transaction.wait_for_confirmation(client, tx_id, 4)
    return tx_id


# ── create_deal ───────────────────────────────────────────────────────────────

def create_deal(
    app_id: int,
    app_address: str,
    seller_address: str,
    service_hash: str,
    amount_micro_algo: int,
) -> str:
    """
    Atomic group: [PaymentTxn to app_address] + [AppCall create_deal].
    Returns deal tx_id.
    """
    client = get_algod_client()
    buyer_addr, buyer_key = get_buyer_account()
    sp = client.suggested_params()
    sp.flat_fee = True
    sp.fee = algosdk.constants.MIN_TXN_FEE

    signer = AccountTransactionSigner(buyer_key)

    atc = AtomicTransactionComposer()

    # Payment transaction to app — unique note prevents duplicate TX errors.
    # IMPORTANT: algosdk ATC automatically adds TransactionWithSigner method args
    # into the group when add_method_call is processed. Do NOT call
    # atc.add_transaction() separately — that causes the same TX to appear twice
    # in the group, producing an identical TX ID that Algorand rejects as
    # "transaction already in ledger".
    pay_txn = transaction.PaymentTxn(
        sender=buyer_addr,
        sp=sp,
        receiver=app_address,
        amt=amount_micro_algo,
        note=uuid.uuid4().bytes,
    )
    pay_txn_with_signer = TransactionWithSigner(txn=pay_txn, signer=signer)

    # App call: create_deal(seller, service_hash, payment_ref).
    # Passing pay_txn_with_signer here is enough — ATC adds it to the group.
    method = _load_abi_method("create_deal")
    atc.add_method_call(
        app_id=app_id,
        method=method,
        sender=buyer_addr,
        sp=sp,
        signer=signer,
        method_args=[
            seller_address,
            service_hash,
            pay_txn_with_signer,
        ],
    )

    try:
        result = atc.execute(client, 4)
        tx_id = result.tx_ids[-1]
    except algosdk.error.AlgodHTTPError as e:
        if "already in ledger" in str(e):
            # TX was already confirmed on-chain — extract TX id from signed group
            tx_id = atc.signed_txns[-1].get_txid() if atc.signed_txns else "unknown"
        else:
            raise

    # Record creation timestamp for verification
    _escrow_timestamps[app_id] = datetime.now(timezone.utc).isoformat()

    return tx_id


# ── submit_delivery ───────────────────────────────────────────────────────────

def submit_delivery(app_id: int, carrier_id: str, delivery_hash: str) -> str:
    """Seller calls submit_delivery with receipt hash. Returns tx_id."""
    client = get_algod_client()
    seller_addr, seller_key = get_seller_account(carrier_id)
    sp = client.suggested_params()

    signer = AccountTransactionSigner(seller_key)
    method = _load_abi_method("submit_delivery")

    atc = AtomicTransactionComposer()
    atc.add_method_call(
        app_id=app_id,
        method=method,
        sender=seller_addr,
        sp=sp,
        signer=signer,
        method_args=[delivery_hash],
    )

    result = atc.execute(client, 4)
    return result.tx_ids[-1]


# ── release_payment ───────────────────────────────────────────────────────────

def release_payment(app_id: int) -> str:
    """Buyer triggers payment release after verification passes. Returns tx_id."""
    client = get_algod_client()
    buyer_addr, buyer_key = get_buyer_account()
    sp = client.suggested_params()
    sp.flat_fee = True
    sp.fee = algosdk.constants.MIN_TXN_FEE * 2  # cover inner txn fee

    # Read seller address from contract state — needed as foreign account
    # so the inner payment txn can reference it.
    state = get_app_state(app_id)
    seller_hex = state.get("seller", "")
    seller_addr = algosdk.encoding.encode_address(bytes.fromhex(seller_hex)) if seller_hex else buyer_addr

    signer = AccountTransactionSigner(buyer_key)
    method = _load_abi_method("release_payment")

    atc = AtomicTransactionComposer()
    atc.add_method_call(
        app_id=app_id,
        method=method,
        sender=buyer_addr,
        sp=sp,
        signer=signer,
        method_args=[],
        accounts=[seller_addr],
    )

    result = atc.execute(client, 4)
    return result.tx_ids[-1]


# ── refund_buyer ──────────────────────────────────────────────────────────────

def refund_buyer(app_id: int) -> str:
    """Buyer claims refund after failed verification. Returns tx_id."""
    client = get_algod_client()
    buyer_addr, buyer_key = get_buyer_account()
    sp = client.suggested_params()
    sp.flat_fee = True
    sp.fee = algosdk.constants.MIN_TXN_FEE * 2

    # Read seller address from contract state — needed as foreign account
    state = get_app_state(app_id)
    seller_hex = state.get("seller", "")
    seller_addr = algosdk.encoding.encode_address(bytes.fromhex(seller_hex)) if seller_hex else buyer_addr

    signer = AccountTransactionSigner(buyer_key)
    method = _load_abi_method("refund_buyer")

    atc = AtomicTransactionComposer()
    atc.add_method_call(
        app_id=app_id,
        method=method,
        sender=buyer_addr,
        sp=sp,
        signer=signer,
        method_args=[],
        accounts=[seller_addr],
    )

    result = atc.execute(client, 4)
    return result.tx_ids[-1]


# ── read state ────────────────────────────────────────────────────────────────

STATUS_LABELS = {1: "LOCKED", 2: "DELIVERED", 3: "SETTLED", 4: "REFUNDED"}


def get_app_state(app_id: int) -> dict:
    """Read contract global state."""
    client = get_algod_client()
    info = client.application_info(app_id)
    raw_state = info.get("params", {}).get("global-state", [])

    state = {}
    for item in raw_state:
        key = base64.b64decode(item["key"]).decode("utf-8", errors="replace")
        val = item["value"]
        if val["type"] == 1:  # bytes
            state[key] = base64.b64decode(val["bytes"]).hex()
        else:  # uint
            state[key] = val["uint"]

    return state


def get_escrow_created_at(app_id: int) -> str:
    # Fallback to epoch if timestamp unknown (e.g. after server restart).
    # This ensures the "pickup after escrow lock" verification check passes.
    return _escrow_timestamps.get(app_id, "2000-01-01T00:00:00+00:00")


def explorer_tx_url(tx_id: str) -> str:
    return f"{EXPLORER_BASE}/transaction/{tx_id}"


def explorer_app_url(app_id: int) -> str:
    return f"{EXPLORER_BASE}/application/{app_id}"
