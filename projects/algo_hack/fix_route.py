lines = open('backend/main.py', encoding='latin-1').readlines()
new_route = (
    "\n\n@app.post('/api/freight/escrow/create', response_model=EscrowCreateResponse)\n"
    "async def create_escrow(req: EscrowCreateRequest):\n"
    "    result = req.negotiation_result\n"
    "    intent = req.shipment_intent\n"
    "    micro_algo = int(0.1 * 1_000_000)\n"
    "    seller_address = algo.get_seller_address(result.winning_carrier.carrier_id)\n"
    "    service_hash = algo.hash_content(json.dumps({'origin': intent.origin_pincode, 'destination': intent.destination_pincode, 'weight_kg': intent.weight_kg, 'price_inr': result.final_price_inr}, sort_keys=True))\n"
    "    try:\n"
    "        app_id, app_address, deploy_tx_id = algo.deploy_escrow()\n"
    "        fund_tx_id = algo.fund_app(app_address, amount_algo=0.1)\n"
    "        deal_tx_id = algo.create_deal(app_id=app_id, app_address=app_address, seller_address=seller_address, service_hash=service_hash, amount_micro_algo=micro_algo)\n"
    "    except Exception as e:\n"
    "        raise HTTPException(500, f'Blockchain error: {str(e)}')\n"
    "    return EscrowCreateResponse(app_id=app_id, app_address=app_address, amount_micro_algo=micro_algo, amount_algo=round(micro_algo/1_000_000,4), deploy_tx_id=deploy_tx_id, fund_tx_id=fund_tx_id, deal_tx_id=deal_tx_id, explorer_url=algo.explorer_app_url(app_id), status='LOCKED')\n"
)
lines.insert(231, new_route)
open('backend/main.py', 'w', encoding='latin-1').write(''.join(lines))
print('Done')
