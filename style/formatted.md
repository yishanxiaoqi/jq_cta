# 1. MARKET_DATA

## 1.1 trade

```json
{
    "exchange": "BinanceU",
    "symbol": "TRBUSDT",
    "contract_type": "perp",
    "data_type": "trade",
    "metadata": [
        [
            "482902330",            // aggregated trade id      
            "20250416221201960",    // human readable ts
            22.543,                 // price
            "buy",                  // buyer the maker?
            0.3                     // qty                
        ]
    ],
    "timestamp": "20250416221202119"
}
```

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

```json
// OKX的best quote
{
    "exchange": "OKX",
    "symbol": "CRVUSDT",
    "contract_type": "perp",
    "data_type": "bestquote",
    "metadata": [
        [
            "1696392996007",
            "20231004121636007",
            0.4819,
            1496,
            0.4818,
            7090
        ]
    ],
    "timestamp": "20231004121636060"
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
// BinanceU
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

```json
// OKX - Market Order
{
    "ref_id": "DMO0LA8iipo96L0Bx8wjBwZdhl2kvo",
    "action": "place_order",
    "strategy": "OKX",
    "metadata": {
        "exchange": "OKX",
        "symbol": "CRVUSDT",
        "contract_type": "perp",
        "event": "place_order",
        "metadata": {
            "result": true,
            "account_id": "jq_okx_cny_master",
            "order_id": "624381036193275947",
            "client_order_id": "12345678910"
        },
        "timestamp": "20230919230719582"
    },
    "request": {
        "exchange": "OKX",
        "symbol": "CRVUSDT",
        "contract_type": "perp",
        "price": 0.45,
        "quantity": 5,
        "direction": "Sell",
        "order_type": "market",
        "account_id": "jq_okx_cny_master",
        "client_order_id": "12345678910",
        "ref_id": "DMO0LA8iipo96L0Bx8wjBwZdhl2kvo"
    }
}
```

```json
// OKX - Limit Order
{
    "ref_id": "DMOKMKteRjtYr5jn2G8lu3CiI4GPcR",
    "action": "place_order",
    "metadata": {
        "exchange": "OKX",
        "symbol": "CRVUSDT",
        "contract_type": "perp",
        "event": "place_order",
        "metadata": {
            "result": true,
            "account_id": "jq_okx_cny_master",
            "order_id": "624710367138435075",
            "client_order_id": "12345678910"
        },
        "timestamp": "20230920205557676"
    },
    "request": {
        "exchange": "OKX",
        "symbol": "CRVUSDT",
        "contract_type": "perp",
        "price": 0.45,
        "quantity": 5,
        "direction": "Sell",
        "order_type": "limit",
        "account_id": "jq_okx_cny_master",
        "client_order_id": "12345678910",
        "ref_id": "DMOKMKteRjtYr5jn2G8lu3CiI4GPcR"
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

### Send Post Only Order

```json
// BinanceU发送Post Only Order成功
{
    "ref_id": "DMOeT1lZ0wtdGjlk6XCuByIDOTwcyY",
    "action": "place_order",
    "strategy": "BinanceU",
    "metadata": {
        "exchange": "BinanceU",
        "symbol": "CRVUSDT",
        "contract_type": "perp",
        "event": "place_order",
        "metadata": {
            "result": true,
            "account_id": "th_binance_cny_sub01",
            "order_id": 24439966213,
            "client_order_id": "12345678910111",
            "timestamp": 1696349600858
        },
        "timestamp": "20231004001320868"
    },
    "request": {
        "exchange": "BinanceU",
        "symbol": "CRVUSDT",
        "contract_type": "perp",
        "quantity": 20,
        "direction": "Sell",
        "order_type": "post_only",
        "price": 0.5,
        "account_id": "th_binance_cny_sub01",
        "client_order_id": "12345678910111",
        "ref_id": "DMOeT1lZ0wtdGjlk6XCuByIDOTwcyY",
        "send_time": "20231004001320810"
    }
}
```

```json
// BinanceU发送 Post Only Order失败：价格过低（limit order的要求
{
    "ref_id": "DMOrpgkB1Qsvr1yonk5XxgfVIWK1dq",
    "action": "place_order",
    "strategy": "BinanceU",
    "metadata": {
        "exchange": "BinanceU",
        "symbol": "CRVUSDT",
        "contract_type": "perp",
        "event": "place_order",
        "metadata": {
            "account_id": "th_binance_cny_sub01",
            "result": false,
            "order_id": 0,
            "error_code": -4024,
            "error_code_msg": "Limit price can't be lower than 0.437."
        },
        "timestamp": "20231004001632338"
    },
    "request": {
        "exchange": "BinanceU",
        "symbol": "CRVUSDT",
        "contract_type": "perp",
        "quantity": 20,
        "direction": "Sell",
        "order_type": "post_only",
        "price": 0.4,
        "account_id": "th_binance_cny_sub01",
        "client_order_id": "12345678910111",
        "ref_id": "DMOrpgkB1Qsvr1yonk5XxgfVIWK1dq",
        "send_time": "20231004001632285"
    }
}
```

```json
// BinanceU发送 Post Only Order失败：发送后会立即成交
{
    "ref_id": "DMOS6Ores6MIK0zKFUE8UdEboxrItN",
    "action": "place_order",
    "strategy": "BinanceU",
    "metadata": {
        "exchange": "BinanceU",
        "symbol": "CRVUSDT",
        "contract_type": "perp",
        "event": "place_order",
        "metadata": {
            "account_id": "th_binance_cny_sub01",
            "result": false,
            "order_id": 0,
            "error_code": -5022,
            "error_code_msg": "Due to the order could not be executed as maker, the Post Only order will be rejected. The order will not be recorded in the order history"
        },
        "timestamp": "20231004001832704"
    },
    "request": {
        "exchange": "BinanceU",
        "symbol": "CRVUSDT",
        "contract_type": "perp",
        "quantity": 20,
        "direction": "Sell",
        "order_type": "post_only",
        "price": 0.48,
        "account_id": "th_binance_cny_sub01",
        "client_order_id": "12345678910111",
        "ref_id": "DMOS6Ores6MIK0zKFUE8UdEboxrItN",
        "send_time": "20231004001832643"
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

```json
{
    "ref_id": "DMOkgK1lqLXeDmlUZS3UXWjU1xjRBq",
    "action": "cancel_order",
    "strategy": "OKX",
    "metadata": {
        "exchange": "OKX",
        "symbol": "CRVUSDT",
        "contract_type": "perp",
        "event": "cancel_order",
        "metadata": {
            "result": true,
            "account_id": "jq_okx_cny_master",
            "order_id": "624710367138435075",
            "client_order_id": "12345678910"
        },
        "timestamp": "20230920205751123"
    },
    "request": {
        "exchange": "OKX",
        "symbol": "CRVUSDT",
        "contract_type": "perp",
        "account_id": "jq_okx_cny_master",
        "client_order_id": "12345678910",
        "ref_id": "DMOkgK1lqLXeDmlUZS3UXWjU1xjRBq"
    }
}
```

```json
// OKX 撤单失败
{
    "ref_id": "DMOwIHgCSLDyiz8p8zzP1iIOUmlwD7",
    "action": "cancel_order",
    "strategy": "OKX",
    "metadata": {
        "exchange": "OKX",
        "symbol": "CRVUSDT",
        "contract_type": "perp",
        "event": "cancel_order",
        "metadata": {
            "result": false,
            "account_id": "jq_okx_cny_master",
            "error_code": 51400,
            "error_code_msg": "Order cancellation failed as the order has been filled, canceled or does not exist"
        },
        "timestamp": "20230920205856398"
    },
    "request": {
        "exchange": "OKX",
        "symbol": "CRVUSDT",
        "contract_type": "perp",
        "order_id": "624710367138435075",
        "account_id": "jq_okx_cny_master",
        "ref_id": "DMOwIHgCSLDyiz8p8zzP1iIOUmlwD7"
    }
}
```

```json
// OKX - WS: cancel by order_id
{
    "ref_id": "DMOw9JItqzs27a9uXemYD3yzWjSZgV",
    "action": "cancel_order",
    "metadata": {
        "exchange": "OKX",
        "symbol": "CRVUSDT",
        "contract_type": "perp",
        "event": "cancel_order",
        "metadata": {
            "result": true,
            "account_id": "jq_okx_cny_master",
            "order_id": "627254420702912542",
            "client_order_id": "12345678911xxx"
        },
        "timestamp": "20230927212527751"
    },
    "request": {
        "exchange": "OKX",
        "symbol": "CRVUSDT",
        "contract_type": "perp",
        "order_id": "627254420702912542",
        "account_id": "jq_okx_cny_master",
        "ref_id": "DMOw9JItqzs27a9uXemYD3yzWjSZgV",
        "send_time": "20230927212527508",
        "action": "cancel_order"
    }
}
```

```json
// OKX - WS: cancel by client order id
{
    "ref_id": "DMONjQ64Xd8V8qoob9M8124xRBL7GK",
    "action": "cancel_order",
    "metadata": {
        "exchange": "OKX",
        "symbol": "CRVUSDT",
        "contract_type": "perp",
        "event": "cancel_order",
        "metadata": {
            "result": true,
            "account_id": "jq_okx_cny_master",
            "order_id": "627250007275888641",
            "client_order_id": "12345678911xxx"
        },
        "timestamp": "20230927210820005"
    },
    "request": {
        "exchange": "OKX",
        "symbol": "CRVUSDT",
        "contract_type": "perp",
        "account_id": "jq_okx_cny_master",
        "client_order_id": "12345678911xxx",
        "ref_id": "DMONjQ64Xd8V8qoob9M8124xRBL7GK"
    }
}
```

## inspect order response

```json
{
    "ref_id": "R01J0t23ZpPw34P6DrzNZBLfmH8IcD",
    "action": "inspect_order",
    "strategy": "BinanceU",
    "metadata": {
        "exchange": "BinanceU",
        "symbol": "SKLUSDT",
        "contract_type": "perp",
        "event": "inspect_order",
        "metadata": {
            "account_id": "th_binance_cny_master",
            "result": false,
            "error_code": -2013,
            "error_code_msg": "Order does not exist."
        },
        "timestamp": "20250127000105137",
        "order_info": {
            "original_amount": 0,
            "filled": 0,
            "avg_executed_price": 0,
            "status": "unknown"
        }
    },
    "request": {
        "exchange": "BinanceU",
        "symbol": "SKLUSDT",
        "contract_type": "perp",
        "account_id": "th_binance_cny_master",
        "client_order_id": "R01DN1P3KL2a",
        "ref_id": "R01J0t23ZpPw34P6DrzNZBLfmH8IcD",
        "send_time": "20250127000105113"
    }
}
```

```json
{
    "ref_id": "DMO0YAAhLD90gzUz9VlyDyk1qDv5U4",
    "action": "inspect_order",
    "strategy": "OKX",
    "metadata": {
        "exchange": "BinanceU",
        "symbol": "CRVUSDT",
        "contract_type": "perp",
        "event": "inspect_order",
        "metadata": {
            "result": true,
            "account_id": "jq_okx_cny_master",
            "order_id": "624719944319913991",
            "client_order_id": "12345678910"
        },
        "timestamp": "20230920214958694",
        "order_info": {
            "original_amount": 5,
            "avg_executed_price": 0,
            "filled": 0,
            "status": "new"
        }
    },
    "request": {
        "exchange": "OKX",
        "symbol": "CRVUSDT",
        "contract_type": "perp",
        "account_id": "jq_okx_cny_master",
        "client_order_id": "12345678910",
        "ref_id": "DMO0YAAhLD90gzUz9VlyDyk1qDv5U4"
    }
}
```

## Modify Order Response

```json
// BinanceU - 改单失败
{
    "ref_id": "DMODNctknggXvJnMya2R5zmeQFmhYJ",
    "action": "modify_order",
    "strategy": "BinanceU",
    "metadata": {
        "exchange": "BinanceU",
        "symbol": "XEMUSDT",
        "contract_type": "perp",
        "event": "modify_order",
        "metadata": {
            "account_id": "th_binance_cny_sub01",
            "result": false,
            "error_code": -2013,
            "error_code_msg": "Order does not exist."
        },
        "order_info": {
            "original_amount": 0,
            "filled": 0,
            "avg_executed_price": 0,
            "status": "unknown"
        },
        "timestamp": "20231014234912533"
    },
    "request": {
        "exchange": "BinanceU",
        "symbol": "XEMUSDT",
        "contract_type": "perp",
        "price": 0.025,
        "quantity": 400,
        "direction": "Sell",
        "account_id": "th_binance_cny_sub01",
        "client_order_id": "12345678911xxx",
        "ref_id": "DMODNctknggXvJnMya2R5zmeQFmhYJ",
        "send_time": "20231014234912483"
    }
}
```

```json
OKX：改单成功
{
    "ref_id": "DMOKsXuGFhVJ9WmsVx9Xh0MR4T2zNn",
    "action": "modify_order",
    "metadata": {
        "exchange": "BinanceU",
        "symbol": "CRVUSDT",
        "contract_type": "perp",
        "event": "modify_order",
        "metadata": {
            "result": true,
            "account_id": "jq_okx_cny_master",
            "order_id": "626094667058532359",
            "client_order_id": "12345678910"
        },
        "timestamp": "20230924165703952"
    },
    "request": {
        "exchange": "OKX",
        "symbol": "CRVUSDT",
        "contract_type": "perp",
        "price": 0.49,
        "quantity": 6,
        "order_id": "626094667058532359",
        "account_id": "jq_okx_cny_master",
        "ref_id": "DMOKsXuGFhVJ9WmsVx9Xh0MR4T2zNn"
    }
}
```

## query orders

```json
// OKX - query orders 
{
    "ref_id": "DMOqBB0pWFCUQZ5R4FM3FYrHCvM9Ul",
    "action": "query_orders",
    "metadata": {
        "exchange": "OKX",
        "symbol": "CRVUSDT",
        "contract_type": "perp",
        "event": "query_orders",
        "metadata": {
            "result": true,
            "account_id": "jq_okx_cny_master",
            "orders": [
                {
                    "symbol": "HOTUSDT",
                    "order_id": 3526913422,
                    "client_order_id": "SRE12hDN5vyeI",
                    "original_amount": 41186,
                    "avg_executed_price": 0,
                    "filled": 0,
                    "status": "new",
                    "direction": "buy",
                    "price": 0.001214,
                    "contract_type": "perp",
                    "create_time": "20231017210444660",
                    "last_updated_time": "20231017210444660"
                }
            ],
            "timestamp": "20230920223708033"
        },
        "timestamp": "20230920223708033"
    },
    "request": {
        "exchange": "OKX",
        "symbol": "CRVUSDT",
        "contract_type": "perp",
        "account_id": "jq_okx_cny_master",
        "ref_id": "DMOqBB0pWFCUQZ5R4FM3FYrHCvM9Ul"
    }
}
```

```json
// OKX - query orders
{
    "ref_id": "DMO75rA2a4yuWXqPML3gOf3KdP4dLm",
    "action": "query_orders",
    "metadata": {
        "exchange": "OKX",
        "symbol": "CRVUSDT",
        "contract_type": "perp",
        "event": "query_orders",
        "metadata": {
            "result": false,
            "account_id": "jq_okx_cny_master",
            "error_code": 51001,
            "error_code_msg": "Instrument ID doesn't exist",
            "timestamp": "20230920224125601"
        },
        "timestamp": "20230920224125602"
    },
    "request": {
        "exchange": "OKX",
        "symbol": "CRVUSDT",
        "contract_type": "perp",
        "account_id": "jq_okx_cny_master",
        "ref_id": "DMO75rA2a4yuWXqPML3gOf3KdP4dLm"
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
    "ref_id": "DMOtDoJ6ooV5Sguqp4B9Qo19Uxsnon",
    "action": "query_account",
    "strategy": "BinanceU",
    "metadata": {
        "exchange": "BinanceU",
        "contract_type": "perp",
        "event": "query_account",
        "metadata": {
            "result": true,
            "account_id": "th_binance_cny_master",
            "balance": {
                "wallet_balance_in_USD": 54576.1743854,
                "unrealized_pnl_in_USD": 132.56147155,
                "equity_in_USD": 54708.73585695,
                "wallet_balance_in_USDT": 54579.61126353,
                "unrealized_pnl_in_USDT": 132.56981947,
                "equity_in_USDT": 54712.181083,
                "position_initial_margin_in_USDT": 6460.65022161,
                "open_order_initial_margin_in_USDT": 18145.32712898
            },
            "positions": [
                {
                    "symbol": "WAVESUSDT",
                    "position": 363.9,
                    "entryPrice": 1.6183,
                    "unRealizedProfit": -18.30417,
                    "positionInitialMargin": 114.11904,
                    "leverage": 5,
                    "last_updated_time": "20231003105948369"
                }
            ],
            "timestamp": "20231003105948371"
        },
        "timestamp": "20231003105948371"
    },
    "request": {
        "exchange": "BinanceU",
        "contract_type": "perp",
        "account_id": "th_binance_cny_master",
        "ref_id": "DMOtDoJ6ooV5Sguqp4B9Qo19Uxsnon",
        "send_time": "20231003105948306"
    }
}
```

```json
{
    "ref_id": "DMOkXcndF41CHFcDO2LFaWkD7JADhl",
    "action": "query_account",
    "strategy": "BinanceU",
    "metadata": {
        "exchange": "BinanceU",
        "contract_type": "perp",
        "event": "query_account",
        "metadata": {
            "result": true,
            "account_id": "th_binance_cny_master",
            "balance": {
                "wallet_balance_in_USD": 237462.79938014,
                "unrealized_pnl_in_USD": 35.50069787,
                "equity_in_USD": 237498.30007801,
                "USDT": {
                    "wallet_balance": 231996.70847179,
                    "unrealized_pnl": 35.49050606,
                    "equity": 232032.19897785,
                    "position_initial_margin": 674.27876092,
                    "open_order_initial_margin": 93673.18415773
                },
                "BNB": {
                    "wallet_balance": 10.138913,
                    "unrealized_pnl": 0,
                    "equity": 10.138913,
                    "position_initial_margin": 0,
                    "open_order_initial_margin": 0
                }
            },
            "positions": [
                {
                    "symbol": "BNBUSDC",
                    "position": -10.13,
                    "entryPrice": 560.6,
                    "unRealizedProfit": 2.48505097,
                    "positionInitialMargin": 1135.2785898,
                    "leverage": 5,
                    "last_updated_time": "20240420145534572"
                }
            ],
            "timestamp": "20240420152036226"
        },
        "timestamp": "20240420152036226"
    },
    "request": {
        "exchange": "BinanceU",
        "contract_type": "perp",
        "account_id": "th_binance_cny_master",
        "ref_id": "DMOkXcndF41CHFcDO2LFaWkD7JADhl",
        "send_time": "20240420152036131"
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

```json
// OKX - submit
{
    "exchange": "OKX",
    "symbol": "CRVUSDT",
    "contract_type": "perp",
    "metadata": {
        "result": true,
        "account_id": "jq_okx_cny_master",
        "order_id": "626087139713110016",
        "client_order_id": "",
        "direction": "Sell",
        "timestamp": "20230924160646244",
        "fee": 0,
        "update_type": "submitted"
    },
    "timestamp": "20230924160645966",
    "order_info": {
        "original_amount": 5,
        "filled": 0,
        "new_filled": 0,
        "avg_executed_price": 0,
        "submit_price": 0.475,
        "status": "new"
    }
}
```

## 2.2 cancel order

```json
// OKX
{
    "exchange": "OKX",
    "symbol": "CRVUSDT",
    "contract_type": "perp",
    "metadata": {
        "result": true,
        "account_id": "jq_okx_cny_master",
        "order_id": "626087139713110016",
        "client_order_id": "",
        "direction": "Sell",
        "timestamp": "20230924160824784",
        "fee": 0,
        "update_type": "cancelled"
    },
    "timestamp": "20230924160824511",
    "order_info": {
        "original_amount": 5,
        "filled": 0,
        "new_filled": 0,
        "avg_executed_price": 0,
        "submit_price": 0.475,
        "status": "cancelled"
    }
}
```

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

## 2.4 Modify Order 

```json
// BinanceU - modify order
{
    "exchange": "BinanceU",
    "symbol": "BTCUSDT",
    "contract_type": "perp",
    "metadata": {
        "result": true,
        "account_id": "th_binance_cny_sub01",
        "order_id": 198570880253,
        "client_order_id": "12345678911xxx",
        "direction": "Sell",
        "timestamp": "20231015004726838",
        "fee": 0,
        "update_type": "modified"           // update_type和status不同
    },
    "timestamp": "20231015004726851",
    "order_info": {
        "original_amount": 0.01,
        "filled": 0,
        "new_filled": 0,
        "avg_executed_price": 0,
        "submit_price": 27700,
        "status": "new"             // update_type和status不同
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