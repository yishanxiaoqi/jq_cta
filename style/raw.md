# MARKET_DATA

## 1. trade

```json
{
    "arg": {
        "channel": "trades-all",
        "instId": "CRV-USDT-SWAP"
    },
    "data": [
        {
            "instId": "CRV-USDT-SWAP",
            "tradeId": "112905979",
            "px": "0.4376",
            "sz": "1",
            "side": "sell",
            "ts": "1694952634493"
        }
    ]
}
```

## 2. bestquote 

```json
// BinanceU
{
    "e": "bookTicker",
    "u": 3252268333237,
    "s": "XEMUSDT",
    "b": "0.0242",      // best bid
    "B": "3040159",     // best bid quantity
    "a": "0.0243",      // best ask
    "A": "7170244",     // best ask quantity
    "T": 1694401517031,
    "E": 1694401517036
}
```

```json
{
    "arg": {
        "channel": "tickers",
        "instId": "CRV-USDT"
    },
    "data": [
        {
            "instType": "SPOT",
            "instId": "CRV-USDT",
            "last": "0.4335",
            "lastSz": "1.05",
            "askPx": "0.4337",
            "askSz": "2364.479373",
            "bidPx": "0.4335",
            "bidSz": "1173.156186",
            "open24h": "0.4335",
            "high24h": "0.4413",
            "low24h": "0.426",
            "sodUtc0": "0.4381",
            "sodUtc8": "0.4324",
            "volCcy24h": "3002548.0479120105",
            "vol24h": "6913880.197854",
            "ts": "1694923550711"
        }
    ]
}
```

# ACCOUNT_UPDATE

```json
{
    "e": "ACCOUNT_UPDATE",  // Event Type
    "T": 1688396049601,     // Event Time
    "E": 1688396049605,     // 
    "a": {                  // Update Data 更新数据
        "B": [                      // Balance 余额
            {
                "a": "USDT",                // Asset 币种
                "wb": "5735.79204855",      // Wallet Balance 钱包余额
                "cw": "5735.79204855",      // Cross Wallet Balance 不太懂
                "bc": "0"                   // Balance Change except PnL and Commission 
                                            // 相比上一次的余额变化，如返佣
            }
        ],
        "P": [                      // Position 仓位
            {
                "s": "XEMUSDT",             // Symbol 交易对
                "pa": "-3367",              // Position Amount 实际仓位
                "ep": "0.02970000",         // Entry Price 
                "cr": "25.39540000",        // (Pre-fee) Accumulated Realized
                "up": "0",                  // Unrealized PNL
                "mt": "cross",              // Margin Type
                "iw": "0",                  // Isolated Wallet
                "ps": "BOTH",               // Position Side
                "ma": "USDT"                // Margin Asset 
            }
        ],
        "m": "ORDER"                // Event Reason Type 更新原因
    }
}
```

```json
{
    "e": "ACCOUNT_UPDATE",
    "T": 1688396711118,
    "E": 1688396711123,
    "a": {
        "B": [
            {
                "a": "USDT",
                "wb": "5735.79804855",
                "cw": "5735.79804855",
                "bc": "0.00600000"
            }
        ],
        "P": [],
        "m": "ADMIN_DEPOSIT"
    }
}
```

```json
{
    "e": "ACCOUNT_UPDATE",
    "T": 1688225220403,
    "E": 1688225220407,
    "a": {
        "B": [
            {
                "a": "USDT",
                "wb": "5735.64055698",
                "cw": "5735.64055698",
                "bc": "0"
            }
        ],
        "P": [
            {
                "s": "BTCUSDT",
                "pa": "-0.001",
                "ep": "30566.30000000",
                "cr": "-0.01240001",
                "up": "-0.00059564",
                "mt": "cross",
                "iw": "0",
                "ps": "BOTH",
                "ma": "USDT"
            }
        ],
        "m": "ORDER"
    }
}
```

```json
{
    "e": "ACCOUNT_UPDATE",
    "T": 1688479081947,
    "E": 1688479081950,
    "a": {
        "B": [
            {
                "a": "USDT",
                "wb": "5730.47748419",
                "cw": "5730.47748419",
                "bc": "0"
            }
        ],
        "P": [
            {
                "s": "XEMUSDT",
                "pa": "0",
                "ep": "0.00000000",
                "cr": "20.40630000",
                "up": "0",
                "mt": "cross",
                "iw": "0",
                "ps": "BOTH",
                "ma": "USDT"
            }
        ],
        "m": "ORDER"
    }
}
```

```json
// LINAUSDT平仓
{
    "e": "ACCOUNT_UPDATE",
    "T": 1689917574687,
    "E": 1689917574692,
    "a": {
        "B": [
            {
                "a": "USDT",
                "wb": "5250.72545240",
                "cw": "5250.72545240",
                "bc": "0"
            }
        ],
        "P": [
            {
                "s": "LINAUSDT",
                "pa": "0",
                "ep": "0.00000000",
                "cr": "-8.83035000",
                "up": "0",
                "mt": "cross",
                "iw": "0",
                "ps": "BOTH",
                "ma": "USDT"
            }
        ],
        "m": "ORDER"
    }
}
```

# Query Positions

## 1. symbol specified

同一个交易对，即便分多次开仓，在返回的结果中也只有一条记录

```json
[
    {
        "symbol": "XEMUSDT",
        "positionAmt": "67797",
        "entryPrice": "0.0295",
        "markPrice": "0.02965372",
        "unRealizedProfit": "10.42175484",
        "liquidationPrice": "0",
        "leverage": "5",
        "maxNotionalValue": "1000000",
        "marginType": "cross",
        "isolatedMargin": "0.00000000",
        "isAutoAddMargin": "false",
        "positionSide": "BOTH",
        "notional": "2010.43325484",
        "isolatedWallet": "0",
        "updateTime": 1689944645278
    }
]
```

## 2. symbol not specified

会把所有的symbol的仓位都返回一遍，包括哪些从未交易过、从未开过仓的交易对，也会返回其仓位

# Query Account

## Binnance

```json
{
    "makerCommission": 10,
    "takerCommission": 10,
    "buyerCommission": 0,
    "sellerCommission": 0,
    "commissionRates": {
        "maker": "0.00100000",
        "taker": "0.00100000",
        "buyer": "0.00000000",
        "seller": "0.00000000"
    },
    "canTrade": true,
    "canWithdraw": true,
    "canDeposit": true,
    "brokered": false,
    "requireSelfTradePrevention": false,
    "preventSor": false,
    "updateTime": 1713596260248,
    "accountType": "SPOT",
    "balances": [
        // 仅保留一个
        {
            "asset": "BTC",
            "free": "0.00000000",
            "locked": "0.00000000"
        }
    ],
    "permissions": [
        "SPOT"
    ],
    "uid": 741371809
}
```

## BinanceU
```json
{
    "feeTier": 0,
    "canTrade": true,
    "canDeposit": true,
    "canWithdraw": true,
    "updateTime": 0,
    "multiAssetsMargin": true,
    "totalInitialMargin": "1930.96577111",
    "totalMaintMargin": "70.36650902",
    "totalWalletBalance": "5301.64961823",
    "totalUnrealizedProfit": "-33.72197206",
    "totalMarginBalance": "5267.92764617",
    "totalPositionInitialMargin": "952.65017729",
    "totalOpenOrderInitialMargin": "978.31559382",
    "totalCrossWalletBalance": "5301.64961823",
    "totalCrossUnPnl": "-33.72197206",
    "availableBalance": "3333.20649844",
    "maxWithdrawAmount": "3333.20649844",
    "assets": [
        // 这里所有的asset都会返回，即便walletBalance为零
        // 以下内容有所删减
        {
            "asset": "BTC",
            "walletBalance": "0.00000000",
            "unrealizedProfit": "0.00000000",
            "marginBalance": "0.00000000",
            "maintMargin": "0.00000000",
            "initialMargin": "0.00000000",
            "positionInitialMargin": "0.00000000",
            "openOrderInitialMargin": "0.00000000",
            "maxWithdrawAmount": "0.00000000",
            "crossWalletBalance": "0.00000000",
            "crossUnPnl": "0.00000000",
            "availableBalance": "0.10604798",
            "marginAvailable": true,
            "updateTime": 0
        },
        {
            "asset": "USDT",
            "walletBalance": "5302.06572435",
            "unrealizedProfit": "-33.72461877",
            "marginBalance": "5268.34110558",
            "maintMargin": "70.35795842",
            "initialMargin": "1930.73112936",
            "positionInitialMargin": "952.53441579",
            "openOrderInitialMargin": "978.19671357",
            "maxWithdrawAmount": "3332.80146307",
            "crossWalletBalance": "5302.06572435",
            "crossUnPnl": "-33.72461877",
            "availableBalance": "3332.80146307",
            "marginAvailable": true,
            "updateTime": 1689994833385
        }
    ],
    "positions": [
        // 这里所有的symbol都会返回，即便positionAmt为零
        // 以下内容有所删减
        {
            "symbol": "XEMUSDT",
            "initialMargin": "419.29629136",
            "maintMargin": "39.92947713",
            "unrealizedProfit": "3.53714320",
            "positionInitialMargin": "399.29477136",
            "openOrderInitialMargin": "20.00152000",
            "leverage": "5",
            "isolated": false,
            "entryPrice": "0.0299",
            "maxNotional": "1000000",
            "positionSide": "BOTH",
            "positionAmt": "-66890",
            "notional": "-1996.47385680",
            "isolatedWallet": "0",
            "updateTime": 1689994833385,
            "bidNotional": "99.99640000",
            "askNotional": "100.00760000"
        }
    ]
}
```

```json
{
    "feeTier": 0,
    "canTrade": true,
    "canDeposit": true,
    "canWithdraw": true,
    "tradeGroupId": -1,
    "updateTime": 0,
    "multiAssetsMargin": true,
    "totalInitialMargin": "94394.85153362",
    "totalMaintMargin": "28.91336277",
    "totalWalletBalance": "237465.30997796",
    "totalUnrealizedProfit": "32.85042294",
    "totalMarginBalance": "237498.16040090",
    "totalPositionInitialMargin": "675.18393172",
    "totalOpenOrderInitialMargin": "93719.66760190",
    "totalCrossWalletBalance": "237465.30997796",
    "totalCrossUnPnl": "32.85042294",
    "availableBalance": "143103.27145683",
    "maxWithdrawAmount": "143103.27145683",
    "assets": [
        {
            "asset": "BNB",
            "walletBalance": "10.13891300",
            "unrealizedProfit": "0.00000000",
            "marginBalance": "10.13891300",
            "maintMargin": "0.00000000",
            "initialMargin": "0.00000000",
            "positionInitialMargin": "0.00000000",
            "openOrderInitialMargin": "0.00000000",
            "maxWithdrawAmount": "10.13891300",
            "crossWalletBalance": "10.13891300",
            "crossUnPnl": "0.00000000",
            "availableBalance": "243.10276307",
            "marginAvailable": true,
            "updateTime": 1713596245852
        },
        {
            "asset": "USDT",
            "walletBalance": "231996.70847179",
            "unrealizedProfit": "32.84069717",
            "marginBalance": "232029.54916896",
            "maintMargin": "28.89902221",
            "initialMargin": "94348.03320911",
            "positionInitialMargin": "674.84905138",
            "openOrderInitialMargin": "93673.18415773",
            "maxWithdrawAmount": "143032.29454130",
            "crossWalletBalance": "231996.70847179",
            "crossUnPnl": "32.84069717",
            "availableBalance": "143032.29454130",
            "marginAvailable": true,
            "updateTime": 1713596260274
        }
    ],
    "positions": [
        // 这里所有的symbol都会返回，即便positionAmt为零
        // 以下内容有所删减，仅保留一个
        {
            "symbol": "SNTUSDT",
            "initialMargin": "0",
            "maintMargin": "0",
            "unrealizedProfit": "0.00000000",
            "positionInitialMargin": "0",
            "openOrderInitialMargin": "0",
            "leverage": "5",
            "isolated": false,
            "entryPrice": "0.0",
            "breakEvenPrice": "0.0",
            "maxNotional": "200000",
            "positionSide": "BOTH",
            "positionAmt": "0",
            "notional": "0",
            "isolatedWallet": "0",
            "updateTime": 0,
            "bidNotional": "0",
            "askNotional": "0"
        }
    ]
}
```

# TRADE

## Place Order

```json
// OKX: 成功发单(REST)
{
    "code": "0",
    "data": [
        {
            "clOrdId": "12345678910",
            "ordId": "624030186027507712",
            "sCode": "0",
            "sMsg": "Order placed",
            "tag": ""
        }
    ],
    "msg": ""
}
```

```json
// OKX: 发单失败(REST)
{
    "code": "1",
    "data": [
        {
            "clOrdId": "12345678910",
            "ordId": "",
            "sCode": "51000",
            "sMsg": "Parameter side error",
            "tag": ""
        }
    ],
    "msg": "All operations failed"
}
```

```json
// OKX - 发单成功（WS）
{
    "id": "DMOJTjjLqh8HSFO5jUUGob1vF45BYv",
    "op": "order",
    "code": "0",
    "msg": "",
    "data": [
        {
            "tag": "",
            "ordId": "626565418043723779",
            "clOrdId": "",
            "sCode": "0",
            "sMsg": "Order successfully placed."
        }
    ],
    "inTime": "1695656836683352",
    "outTime": "1695656836685633"
}
```

## Cancel Order

```json
// OKX 撤单成功
{
    "code": "0",
    "data": [
        {
        "clOrdId": "12345678910",
        "ordId": "624382987458994247",
        "sCode": "0",
        "sMsg": ""
        }
    ],
    "msg": ""
}
```

## Inspect Order

```json
// OKX - 查单成功
{
    "code": "0",
    "data": [
        {
            "accFillSz": "0",
            "algoClOrdId": "",
            "algoId": "",
            "attachAlgoClOrdId": "",
            "avgPx": "",
            "cTime": "1695216841461",
            "cancelSource": "",
            "cancelSourceReason": "",
            "category": "normal",
            "ccy": "",
            "clOrdId": "12345678910",
            "fee": "0",
            "feeCcy": "USDT",
            "fillPx": "",
            "fillSz": "0",
            "fillTime": "",
            "instId": "CRV-USDT-SWAP",
            "instType": "SWAP",
            "lever": "3",
            "ordId": "624719944319913991",
            "ordType": "limit",
            "pnl": "0",
            "posSide": "net",
            "px": "0.45",
            "pxType": "",
            "pxUsd": "",
            "pxVol": "",
            "quickMgnType": "",
            "rebate": "0",
            "rebateCcy": "USDT",
            "reduceOnly": "false",
            "side": "sell",
            "slOrdPx": "",
            "slTriggerPx": "",
            "slTriggerPxType": "",
            "source": "",
            "state": "live",
            "stpId": "",
            "stpMode": "",
            "sz": "5",
            "tag": "",
            "tdMode": "cross",
            "tgtCcy": "",
            "tpOrdPx": "",
            "tpTriggerPx": "",
            "tpTriggerPxType": "",
            "tradeId": "",
            "uTime": "1695216841461"
        }
    ],
    "msg": ""
}
```

```json
// OKX - 查单失败
{
    "code": "51603",
    "data": [],
    "msg": "Order does not exist"
}
```

## Modify Order

```json
// BinanceU
{
    "orderId": 198570880253,
    "symbol": "BTCUSDT",
    "status": "NEW",
    "clientOrderId": "12345678911xxx",
    "price": "27300.00",
    "avgPrice": "0.00",
    "origQty": "0.010",
    "executedQty": "0.000",
    "cumQty": "0.000",
    "cumQuote": "0.00000",
    "timeInForce": "GTC",
    "type": "LIMIT",
    "reduceOnly": false,
    "closePosition": false,
    "side": "SELL",
    "positionSide": "BOTH",
    "stopPrice": "0.00",
    "workingType": "CONTRACT_PRICE",
    "priceProtect": false,
    "origType": "LIMIT",
    "priceMatch": "NONE",
    "selfTradePreventionMode": "NONE",
    "goodTillDate": 0,
    "updateTime": 1697299690473
}
```

```json
// OK
{
    "code": "0",
    "data": [
        {
            "clOrdId": "12345678910",
            "ordId": "626094667058532359",
            "reqId": "",
            "sCode": "0",
            "sMsg": ""
        }
    ],
    "inTime": "1695545503112035",
    "msg": "",
    "outTime": "1695545503114495"
}
```

## Query Orders

```json
// OKX - query 失败
{
    "code": "51003",
    "data": [],
    "msg": "Either client order ID or order ID is required"
}
```

```json
// OKX 成功
{
    "code": "0",
    "data": [
        {
            "accFillSz": "0",
            "algoClOrdId": "",
            "algoId": "",
            "attachAlgoClOrdId": "",
            "avgPx": "",
            "cTime": "1695216841461",
            "cancelSource": "",
            "cancelSourceReason": "",
            "category": "normal",
            "ccy": "",
            "clOrdId": "12345678910",
            "fee": "0",
            "feeCcy": "USDT",
            "fillPx": "",
            "fillSz": "0",
            "fillTime": "",
            "instId": "CRV-USDT-SWAP",
            "instType": "SWAP",
            "lever": "3",
            "ordId": "624719944319913991",
            "ordType": "limit",
            "pnl": "0",
            "posSide": "net",
            "px": "0.45",
            "pxType": "",
            "pxUsd": "",
            "pxVol": "",
            "quickMgnType": "",
            "rebate": "0",
            "rebateCcy": "USDT",
            "reduceOnly": "false",
            "side": "sell",
            "slOrdPx": "",
            "slTriggerPx": "",
            "slTriggerPxType": "",
            "source": "",
            "state": "live",
            "stpId": "",
            "stpMode": "",
            "sz": "5",
            "tag": "",
            "tdMode": "cross",
            "tgtCcy": "",
            "tpOrdPx": "",
            "tpTriggerPx": "",
            "tpTriggerPxType": "",
            "tradeId": "",
            "uTime": "1695216841461"
        }
    ],
    "msg": ""
}
```

# Order Update

## Place Order

```json
// BinanceU: place limit order
{
    "e": "ORDER_TRADE_UPDATE",
    "T": 1713667415298,
    "E": 1713667415298,
    "o": {
        "s": "BNBUSDT",
        "c": "web_3c5dm4etfEvSlDpirssF",
        "S": "SELL",
        "o": "LIMIT",
        "f": "GTC",
        "q": "0.01",
        "p": "574.420",
        "ap": "0",
        "sp": "0",
        "x": "NEW",
        "X": "NEW",
        "i": 55370877878,
        "l": "0",
        "z": "0",
        "L": "0",
        "n": "0",       // fee，似乎默认是0
        "N": "USDT",    // fee asset，似乎默认是USDT
        "T": 1713667415298,
        "t": 0,
        "b": "11999.76600",
        "a": "12006.54820",
        "m": false,
        "R": false,
        "wt": "CONTRACT_PRICE",
        "ot": "LIMIT",
        "ps": "BOTH",
        "cp": false,
        "rp": "0",
        "pP": false,
        "si": 0,
        "ss": 0,
        "V": "NONE",
        "pm": "NONE",
        "gtd": 0
    }
}
```

## Cancel Order

```json
// OKX
{
    "arg": {
        "channel": "orders",
        "instType": "SWAP",
        "instId": "CRV-USDT-SWAP",
        "uid": "215357687528034304"
    },
    "data": [
        {
            "accFillSz": "0",
            "algoClOrdId": "",
            "algoId": "",
            "amendResult": "",
            "amendSource": "",
            "attachAlgoClOrdId": "",
            "avgPx": "0",
            "cTime": "1695484734935",
            "cancelSource": "1",
            "category": "normal",
            "ccy": "",
            "clOrdId": "",
            "code": "0",
            "execType": "",
            "fee": "0",
            "feeCcy": "USDT",
            "fillFee": "0",
            "fillFeeCcy": "",
            "fillFwdPx": "",
            "fillMarkPx": "",
            "fillMarkVol": "",
            "fillNotionalUsd": "",
            "fillPnl": "0",
            "fillPx": "",
            "fillPxUsd": "",
            "fillPxVol": "",
            "fillSz": "0",
            "fillTime": "",
            "instId": "CRV-USDT-SWAP",
            "instType": "SWAP",
            "lever": "3",
            "msg": "",
            "notionalUsd": "2.3433901500000003",
            "ordId": "625843570989486084",
            "ordType": "limit",
            "pnl": "0",
            "posSide": "net",
            "px": "0.4685",
            "pxType": "",
            "pxUsd": "",
            "pxVol": "",
            "quickMgnType": "",
            "rebate": "0",
            "rebateCcy": "USDT",
            "reduceOnly": "false",
            "reqId": "",
            "side": "sell",
            "slOrdPx": "",
            "slTriggerPx": "",
            "slTriggerPxType": "",
            "source": "",
            "state": "canceled",
            "stpId": "",
            "stpMode": "",
            "sz": "5",
            "tag": "",
            "tdMode": "cross",
            "tgtCcy": "",
            "tpOrdPx": "",
            "tpTriggerPx": "",
            "tpTriggerPxType": "",
            "tradeId": "",
            "uTime": "1695484838261"
        }
    ]
}
```

## Inspect Order

## Modify Order

```json
// Binance - Modify
{
    "e": "ORDER_TRADE_UPDATE",
    "T": 1697301156450,
    "E": 1697301156455,
    "o": {
        "s": "BTCUSDT",
        "c": "12345678911xxx",
        "S": "SELL",
        "o": "LIMIT",           // order type
        "f": "GTC",
        "q": "0.010",
        "p": "27800",
        "ap": "0",
        "sp": "0",
        "x": "AMENDMENT",       // Execuation Type
        "X": "NEW",             // Order Status
        "i": 198570880253,
        "l": "0",
        "z": "0",
        "L": "0",
        "n": "0",
        "N": "USDT",
        "T": 1697301156450,
        "t": 0,
        "b": "0",
        "a": "278",
        "m": false,
        "R": false,
        "wt": "CONTRACT_PRICE",
        "ot": "LIMIT",
        "ps": "BOTH",
        "cp": false,
        "rp": "0",
        "pP": false,
        "si": 0,
        "ss": 0,
        "V": "NONE",
        "pm": "NONE",
        "gtd": 0
    }
}
```

## Query Order
