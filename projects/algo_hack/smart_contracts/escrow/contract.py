from algopy import (
    ARC4Contract,
    Global,
    GlobalState,
    OnCompleteAction,
    String,
    Txn,
    UInt64,
    arc4,
    gtxn,
    itxn,
    op,
)


class CommerceEscrow(ARC4Contract):
    """
    A2A P2P Freight Commerce Escrow Contract.

    Locks ALGO from a buyer (shipper) agent and releases it to the
    winning carrier agent after a verified delivery receipt is submitted.

    Status codes:
        1 = LOCKED    - funds locked, awaiting delivery
        2 = DELIVERED - receipt hash submitted, awaiting release
        3 = SETTLED   - payment released to carrier
        4 = REFUNDED  - buyer refunded after failed/missing delivery
    """

    @arc4.baremethod(allow_actions=["DeleteApplication"])
    def delete(self) -> None:
        """Allow buyer to delete app after settlement/refund to recover min-balance."""
        assert Txn.sender == self.buyer.value.native, "Only buyer can delete"
        status = self.status.value
        assert status == UInt64(3) or status == UInt64(4), "Can only delete after SETTLED or REFUNDED"

    def __init__(self) -> None:
        self.buyer = GlobalState(arc4.Address, description="buyer address")
        self.seller = GlobalState(arc4.Address, description="seller address")
        self.amount = GlobalState(UInt64, description="locked microALGO")
        self.service_hash = GlobalState(String, description="SHA256 of service requirements")
        self.delivery_hash = GlobalState(String, description="SHA256 of delivery receipt")
        self.status = GlobalState(UInt64, description="deal status code")

    @arc4.abimethod
    def create_deal(
        self,
        seller: arc4.Address,
        service_hash: arc4.String,
        payment: gtxn.PaymentTransaction,
    ) -> UInt64:
        """
        Buyer locks ALGO for freight service.
        Must be submitted as an atomic group:
            [PaymentTxn to app_address, AppCallTxn to create_deal]
        """
        assert (
            payment.receiver == Global.current_application_address
        ), "Payment must go to this contract"
        assert payment.amount > UInt64(0), "Amount must be positive"
        assert Txn.sender != seller.native, "Buyer and seller must differ"

        self.buyer.value = arc4.Address(Txn.sender)
        self.seller.value = seller.copy()
        self.amount.value = payment.amount
        self.service_hash.value = service_hash.native
        self.status.value = UInt64(1)  # LOCKED

        return payment.amount

    @arc4.abimethod
    def submit_delivery(self, delivery_hash: arc4.String) -> None:
        """
        Carrier submits SHA-256 hash of the delivery receipt JSON.
        Only the registered seller may call this.
        """
        assert arc4.Address(Txn.sender) == self.seller.value, "Only seller can submit delivery"
        assert self.status.value == UInt64(1), "Deal must be in LOCKED state"

        self.delivery_hash.value = delivery_hash.native
        self.status.value = UInt64(2)  # DELIVERED

    @arc4.abimethod
    def release_payment(self) -> None:
        """
        Buyer triggers payment release to carrier after AI verification passes.
        Inner transaction sends the locked ALGO to the seller.
        """
        assert arc4.Address(Txn.sender) == self.buyer.value, "Only buyer can release payment"
        assert self.status.value == UInt64(2), "Delivery must be submitted first"

        itxn.Payment(
            receiver=self.seller.value.native,
            amount=self.amount.value,
            fee=Global.min_txn_fee,
        ).submit()

        self.status.value = UInt64(3)  # SETTLED

    @arc4.abimethod
    def refund_buyer(self) -> None:
        """
        Buyer reclaims ALGO if delivery is not submitted or fails verification.
        Can only be called when status is LOCKED (1).
        """
        assert arc4.Address(Txn.sender) == self.buyer.value, "Only buyer can claim refund"
        assert self.status.value == UInt64(1), "Deal must be in LOCKED state"

        itxn.Payment(
            receiver=self.buyer.value.native,
            amount=self.amount.value,
            fee=Global.min_txn_fee,
        ).submit()

        self.status.value = UInt64(4)  # REFUNDED

    @arc4.abimethod(readonly=True)
    def get_status(self) -> UInt64:
        """Return current deal status code."""
        return self.status.value

    @arc4.abimethod(readonly=True)
    def get_amount(self) -> UInt64:
        """Return locked amount in microALGO."""
        return self.amount.value
