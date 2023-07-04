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
