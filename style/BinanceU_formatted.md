# 1. MARKET_DATA

## 1.1 trade

## 1.2 bestquote

```json
{
    "exchange": "BinanceU",
    "symbol": "XEMUSDT",
    "contract_type": "perp",
    "data_type": "bestquote",
    "metadata": [
        [
            "3252310238667",            // updated id
            "20230911112922484",        // timestampe
            0.0243,                     // best ask
            6427658,                    // best ask quantity
            0.0242,                     // best bid
            3062104                     // best bid quantity
        ]
    ],
    "timestamp": "20230911112920823"
}
```

# 1. RESPONSE (rest)
## 1.1 send order response

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

### 1.1.3 send market order response
```json
{
    "ref_id": "DMOFN5Z52sy6kwKCpoH2ySMD29aHJ6",
    "action": "place_order",
    "strategy": "Demo",
    "metadata": {
        "exchange": "Demo",
        "symbol": "BTCUSDT",
        "contract_type": "perp",
        "event": "place_order",
        "metadata": {
            "result": true,
            "account_id": "jq_cta_02",
            "order_id": 167820083155,
            "client_order_id": "12345678910",
            "timestamp": 1688570025700
        },
        "timestamp": "20230705231345708"
    },
    "request": {
        "exchange": "BinanceU",
        "symbol": "BTCUSDT",
        "contract_type": "perp",
        "quantity": 0.001,
        "direction": "Sell",
        "order_type": "market",
        "account_id": "jq_cta_02",
        "client_order_id": "12345678910",
        "ref_id": "DMOFN5Z52sy6kwKCpoH2ySMD29aHJ6"
    }
}
```

### 1.1.4 send stop market order response

```json
{
    "ref_id": "DMOEKXhtvDyCL4jQKKInFmlX7UcJ73",
    "action": "place_order",
    "strategy": "Demo",
    "metadata": {
        "exchange": "BinanceU",
        "symbol": "BTCUSDT",
        "contract_type": "perp",
        "event": "place_order",
        "metadata": {
            "result": true,
            "account_id": "jq_cta_02",
            "order_id": 186426999287,
            "client_order_id": "12345678910111",
            "timestamp": 1693672119378
        },
        "timestamp": "20230903002839386"
    },
    "request": {
        "exchange": "BinanceU",
        "symbol": "BTCUSDT",
        "contract_type": "perp",
        "quantity": 0.001,
        "direction": "Sell",
        "order_type": "stop_market",
        "stop_price": 25000,
        "account_id": "jq_cta_02",
        "client_order_id": "12345678910111",
        "ref_id": "DMOEKXhtvDyCL4jQKKInFmlX7UcJ73"
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

## 1.3 query positions

- symbol specified

```json
{
    "ref_id": "DMONPNcPdhngzdEBxdrEloA0yZENUk",
    "action": "query_position",
    "strategy": "Demo",
    "metadata": {
        "exchange": "BinanceU",
        "symbol": "XEMUSDT",
        "contract_type": "perp",
        "event": "query_orders",
        "metadata": {
            "result": true,
            "orders": [
                {
                    "symbol": "XEMUSDT",
                    "position": 67114,
                    "entryPrice": 0.0298,
                    "markPrice": 0.02984209,
                    "unRealizedProfit": 2.82482826,
                    "last_updated_time": "20230722105225822"
                }
            ],
            "timestamp": "20230722105225822"
        },
        "timestamp": "20230722105225823"
    },
    "request": {
        "exchange": "BinanceU",
        "symbol": "XEMUSDT",
        "contract_type": "perp",
        "ref_id": "DMONPNcPdhngzdEBxdrEloA0yZENUk"
    }
}
```

- symbol not specified

```json
{
    "ref_id": "DMONlHt8cCmYVQKQGZW9GpTC41HBdH",
    "action": "query_position",
    "strategy": "Demo",
    "metadata": {
        "exchange": "BinanceU",
        "contract_type": "perp",
        "event": "query_orders",
        "metadata": {
            "result": true,
            "positions": [
                // 以下内容有省略
                {
                    "symbol": "WAVESUSDT",
                    "position": -40.2,
                    "entryPrice": 1.9721,
                    "markPrice": 2.05477627,
                    "unRealizedProfit": -3.32358605,
                    "last_updated_time": "20230722105921985"
                },
                {
                    "symbol": "BNBUSDT",
                    "position": -0.2,
                    "entryPrice": 248.81,
                    "markPrice": 244.69441548,
                    "unRealizedProfit": 0.8231169,
                    "last_updated_time": "20230722105921986"
                }
            ],
            "timestamp": "20230722105921987"
        },
        "timestamp": "20230722105921987"
    },
    "request": {
        "exchange": "BinanceU",
        "contract_type": "perp",
        "ref_id": "DMONlHt8cCmYVQKQGZW9GpTC41HBdH"
    }
}
```

## 1.4 query account

```json
{
    "ref_id": "DMO1FyWMWiDBiZ9VR3ZrOwrPOftDBO",
    "action": "query_account",
    "strategy": "Demo",
    "metadata": {
        "exchange": "BinanceU",
        "contract_type": "perp",
        "event": "query_account",
        "metadata": {
            "result": true,
            "account_id": "jq_cta_02",
            "balance": {
                "wallet_balance_in_USD": 5301.82469244,
                "unrealized_pnl_in_USD": -29.44308836,
                "equity_in_USD": 5272.38160408,
                "wallet_balance_in_USDT": 5302.06572435,
                "unrealized_pnl_in_USDT": -29.4444269,
                "equity_in_USDT": 5272.62129745
            },
            "positions": [
                // 仅返回有仓位的symbol，以下内容有省略
                {
                    "symbol": "WAVESUSDT",
                    "position": -40.2,
                    "entryPrice": 1.9721,
                    "unRealizedProfit": -2.52295159,
                    "last_updated_time": "20230722120209534"
                }
            ],
            "timestamp": "20230722120209540"
        },
        "timestamp": "20230722120209540"
    },
    "request": {
        "exchange": "BinanceU",
        "contract_type": "perp",
        "account_id": "jq_cta_02",
        "ref_id": "DMO1FyWMWiDBiZ9VR3ZrOwrPOftDBO"
    }
}
```

# 2. ORDER UPDATE (websocket)

## 2.1 place order

### 2.1.1 place limit order

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

### 2.1.2 place market order

- 发送market_order会有两条order update，一条是发单的update，一条是成交的update，如下
- submit_price全都是0

```json
{
    "exchange": "BinanceU",
    "symbol": "BTCUSDT",
    "contract_type": "perp",
    "metadata": {
        "result": true,
        "account_id": "jq_cta_02",
        "order_id": 167820083155,
        "client_order_id": "12345678910",
        "direction": "Sell",
        "timestamp": 1688570025700,
        "fee": 0,
        "update_type": "submitted"
    },
    "timestamp": "20230705231345713",
    "order_info": {
        "original_amount": 0.001,
        "filled": 0,
        "new_filled": 0,
        "avg_executed_price": 0,
        "submit_price": 0,
        "status": "new"
    }
}
```

```json
{
    "exchange": "BinanceU",
    "symbol": "BTCUSDT",
    "contract_type": "perp",
    "metadata": {
        "result": true,
        "account_id": "jq_cta_02",
        "order_id": 167820083155,
        "client_order_id": "12345678910",
        "direction": "Sell",
        "timestamp": 1688570025700,
        "fee": 0,
        "update_type": "submitted"
    },
    "timestamp": "20230705231345713",
    "order_info": {
        "original_amount": 0.001,
        "filled": 0,
        "new_filled": 0,
        "avg_executed_price": 0,
        "submit_price": 0,
        "status": "new"
    }
}
```

```json
{
    "exchange": "BinanceU",
    "symbol": "BTCUSDT",
    "contract_type": "perp",
    "metadata": {
        "result": true,
        "account_id": "jq_cta_02",
        "order_id": 167820083155,
        "client_order_id": "12345678910",
        "direction": "Sell",
        "timestamp": 1688570025700,
        "fee": 0.0121458,
        "update_type": "executed"
    },
    "timestamp": "20230705231345721",
    "order_info": {
        "original_amount": 0.001,
        "filled": 0.001,
        "new_filled": 0.001,
        "avg_executed_price": 30364.5,
        "submit_price": 0,
        "status": "filled"
    }
}
```

### 2.1.3 place stop market order

```json
{
    "exchange": "BinanceU",
    "symbol": "BTCUSDT",
    "contract_type": "perp",
    "metadata": {
        "result": true,
        "account_id": "jq_cta_02",
        "order_id": 186426999287,
        "client_order_id": "12345678910111",
        "direction": "Sell",
        "timestamp": "20230903002839378",
        "fee": 0,
        "update_type": "submitted"
    },
    "timestamp": "20230903002839391",
    "order_info": {
        "original_amount": 0.001,
        "filled": 0,
        "new_filled": 0,
        "avg_executed_price": 0,
        "submit_price": 0,
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

# 3. Quantitative Rules Indicators (REST)

在RevTrend策略中，触发该限制条件的原因应该是stoploss单频繁撤销、重发，导致在10分钟内发送的未成交单（unfilled order）超过了一定限制

```
{
    "ref_id": "R24lKBB2tffcAM4F33dbBRrKQzehui",
    "action": "query_quantitative_rules",
    "strategy": "RevTrend",
    "metadata": {
        "exchange": "BinanceU",
        "contract_type": "perp",
        "event": "query_quantitative_rules",
        "metadata": {
            "result": true,
            "account_id": "jq_cta_02",
            "indicators": {
                "NKNUSDT": [
                    {
                        "indicator": "UFR",
                        "value": 1,
                        "triggerValue": 0.99,
                        "plannedRecoverTime": 1691922574000,
                        "isLocked": true
                    }
                ]
            },
            "timestamp": "20230813182533219"
        },
        "timestamp": "20230813182533219"
    },
    "request": {
        "exchange": "BinanceU",
        "contract_type": "perp",
        "account_id": "jq_cta_02",
        "ref_id": "R24lKBB2tffcAM4F33dbBRrKQzehui"
    }
}
```