## 1. RESPONSE
# 1.1 send order response

```json
{
    "ref_id": "R01S8qeAOhVlvgFVU5EW25vT6uGuSC",
    "action": "place_order",
    "strategy": "RevTrend",
    "metadata": {
        "exchange": "BinanceU",
        "symbol": "XEMUSDT",
        "contract_type": "perp",
        "event": "place_order",
        "metadata": {
            "account_id": "cta_foreseem_sub02_fut",
            "result": false,
            "order_id": 0,
            "error_code": 999999,
            "error_code_msg": "StatusCodeError: 400 - \"{\\\"code\\\":-4164,\\\"msg\\\":\\\"Order's notional must be no smaller than 5.0 (unless you choose reduce only)\\\"}\""
        },
        "timestamp": "20230703160004798"
    },
    "request": {
        "label": "ANTI_S|REVERSE",
        "target": "LONG",
        "exchange": "BinanceU",
        "symbol": "XEMUSDT",
        "contract_type": "perp",
        "price": 0.0294,
        "quantity": 23,
        "direction": "Buy",
        "order_type": "limit",
        "account_id": "cta_foreseem_sub02_fut",
        "client_order_id": "R01SReUyUMB8",
        "ref_id": "R01S8qeAOhVlvgFVU5EW25vT6uGuSC"
    }
}
```

## 1.2 cancel order response

```json
{
    "ref_id": "R01cM44qsCr43Th99cEgMSLBjK0Dht",
    "action": "cancel_order",
    "strategy": "RevTrend",
    "metadata": {
        "exchange": "BinanceU",
        "symbol": "XEMUSDT",
        "contract_type": "perp",
        "event": "cancel_order",
        "metadata": {
            "account_id": "cta_foreseem_sub02_fut",
            "result": false,
            "error_code": 999999,
            "error_code_msg": "StatusCodeError: 400 - \"{\\\"code\\\":-2011,\\\"msg\\\":\\\"Unknown order sent.\\\"}\""
        },
        "timestamp": "20230703154914059"
    },
    "request": {
        "exchange": "BinanceU",
        "symbol": "XEMUSDT",
        "contract_type": "perp",
        "client_order_id": "R01DNygM0Q6X",
        "account_id": "cta_foreseem_sub02_fut",
        "ref_id": "R01cM44qsCr43Th99cEgMSLBjK0Dht"
    }
}
```