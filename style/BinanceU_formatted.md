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

# 2. ORDER UPDATE

## 2.1 place order

```json
{
    "exchange": "BinanceU",
    "symbol": "XEMUSDT",
    "contract_type": "perp",
    "metadata": {
        "result": true,
        "account_id": "jq_cta_02",
        "order_id": 6300810354,
        "client_order_id": "R01UPTYQwC5V",
        "direction": "Sell",
        "timestamp": 1688395825951,
        "update_type": "submitted"
    },
    "timestamp": "20230703225025960",
    "order_info": {
        "original_amount": 3367,
        "filled": 0,
        "new_filled": 0,
        "avg_executed_price": 0,
        "submit_price": 0.0297,
        "status": "new"
    }
}
```

## 2.2 cancel order

## 2.3 order execuated

```json
{
    "exchange": "BinanceU",
    "symbol": "XEMUSDT",
    "contract_type": "perp",
    "metadata": {
        "result": true,
        "account_id": "jq_cta_02",
        "order_id": 6294660651,
        "client_order_id": "R01UPGFphQhy",
        "direction": "Buy",
        "timestamp": 1688377909034,
        "update_type": "executed"
    },
    "timestamp": "20230703175149046",
    "order_info": {
        "original_amount": 3367,
        "filled": 3367,
        "new_filled": 3367,
        "avg_executed_price": 0.0297,
        "submit_price": 0.0297,
        "status": "filled"
    }
}
```

```json
{
    "exchange": "BinanceU",
    "symbol": "XEMUSDT",
    "contract_type": "perp",
    "metadata": {
        "result": true,
        "account_id": "jq_cta_02",
        "order_id": 6327431732,
        "client_order_id": "web_P7HwjgJUlLHJOQ303LK0",
        "direction": "Buy",
        "timestamp": 1688479081947,
        "fee": 0.04012932,
        "update_type": "executed"
    },
    "timestamp": "20230704215801962",
    "order_info": {
        "original_amount": 3333,
        "filled": 3333,
        "new_filled": 3333,
        "avg_executed_price": 0.0301,
        "submit_price": 0,
        "status": "filled"
    }
}
```