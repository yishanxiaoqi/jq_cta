const fs = require("fs");
var aliases = ["R01", "R06", "R12", "R24", "STR"];

var cal_positions = {};
for (let alias of aliases) {
    let cfg = JSON.parse(fs.readFileSync(`./config/cfg_${alias}.json`, 'utf8'));
    let status_map = JSON.parse(fs.readFileSync(`./config/status_map_${alias}.json`, 'utf8'));
    let loop_items = (alias === "STR")? cfg["entries"]: cfg["idfs"];

    for (let item of loop_items) {
        let symbol = item.split(".")[1];
        if (symbol in cal_positions) {
            cal_positions[symbol] += status_map[item]["pos"];
        } else {
            cal_positions[symbol] = status_map[item]["pos"];
        }
    }

}

let warning_msg = "";
let response = {
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
                {
                    "symbol": "WAVESUSDT",
                    "position": -40.2,
                    "entryPrice": 1.9721,
                    "unRealizedProfit": -2.52295159,
                    "last_updated_time": "20230722120209534"
                },
                {
                    "symbol": "BNBUSDT",
                    "position": -0.2,
                    "entryPrice": 248.81,
                    "unRealizedProfit": 0.84339221,
                    "last_updated_time": "20230722120209535"
                },
                {
                    "symbol": "ETCUSDT",
                    "position": -12.16,
                    "entryPrice": 18.64996546053,
                    "unRealizedProfit": -1.81226,
                    "last_updated_time": "20230722120209535"
                },
                {
                    "symbol": "DASHUSDT",
                    "position": -1.651,
                    "entryPrice": 33.96,
                    "unRealizedProfit": 1.08966,
                    "last_updated_time": "20230722120209535"
                },
                {
                    "symbol": "RUNEUSDT",
                    "position": -435,
                    "entryPrice": 0.9942964083778,
                    "unRealizedProfit": -0.8430648,
                    "last_updated_time": "20230722120209535"
                },
                {
                    "symbol": "SKLUSDT",
                    "position": -1790,
                    "entryPrice": 0.0277936312849,
                    "unRealizedProfit": -2.8396023,
                    "last_updated_time": "20230722120209535"
                },
                {
                    "symbol": "LTCUSDT",
                    "position": -0.759,
                    "entryPrice": 93.03,
                    "unRealizedProfit": -1.18725337,
                    "last_updated_time": "20230722120209535"
                },
                {
                    "symbol": "KSMUSDT",
                    "position": -2,
                    "entryPrice": 24.59,
                    "unRealizedProfit": 2,
                    "last_updated_time": "20230722120209535"
                },
                {
                    "symbol": "MANAUSDT",
                    "position": -260,
                    "entryPrice": 0.4015,
                    "unRealizedProfit": -0.9524762,
                    "last_updated_time": "20230722120209535"
                },
                {
                    "symbol": "GTCUSDT",
                    "position": -132.4,
                    "entryPrice": 1.049,
                    "unRealizedProfit": -4.02185654,
                    "last_updated_time": "20230722120209535"
                },
                {
                    "symbol": "CELOUSDT",
                    "position": 117.4,
                    "entryPrice": 0.595,
                    "unRealizedProfit": -10.80338397,
                    "last_updated_time": "20230722120209536"
                },
                {
                    "symbol": "LINAUSDT",
                    "position": 6871,
                    "entryPrice": 0.0137,
                    "unRealizedProfit": 1.8812798,
                    "last_updated_time": "20230722120209536"
                },
                {
                    "symbol": "FILUSDT",
                    "position": 16.3,
                    "entryPrice": 4.422800464037,
                    "unRealizedProfit": 1.56970613,
                    "last_updated_time": "20230722120209537"
                },
                {
                    "symbol": "SOLUSDT",
                    "position": 2,
                    "entryPrice": 28.965,
                    "unRealizedProfit": -6.31040152,
                    "last_updated_time": "20230722120209537"
                },
                {
                    "symbol": "BANDUSDT",
                    "position": -76,
                    "entryPrice": 1.3159,
                    "unRealizedProfit": 0.25380732,
                    "last_updated_time": "20230722120209537"
                },
                {
                    "symbol": "ADAUSDT",
                    "position": 169,
                    "entryPrice": 0.3605,
                    "unRealizedProfit": -8.01949109,
                    "last_updated_time": "20230722120209537"
                },
                {
                    "symbol": "ETHUSDT",
                    "position": -0.036,
                    "entryPrice": 1907.25,
                    "unRealizedProfit": 0.5402275,
                    "last_updated_time": "20230722120209537"
                },
                {
                    "symbol": "SANDUSDT",
                    "position": 112,
                    "entryPrice": 0.4566,
                    "unRealizedProfit": -0.6153952,
                    "last_updated_time": "20230722120209539"
                },
                {
                    "symbol": "CTKUSDT",
                    "position": 166,
                    "entryPrice": 0.6037,
                    "unRealizedProfit": 1.63283576,
                    "last_updated_time": "20230722120209539"
                },
                {
                    "symbol": "VETUSDT",
                    "position": -5877,
                    "entryPrice": 0.01898,
                    "unRealizedProfit": -4.58406,
                    "last_updated_time": "20230722120209539"
                },
                {
                    "symbol": "GRTUSDT",
                    "position": -818,
                    "entryPrice": 0.12223,
                    "unRealizedProfit": 3.59160896,
                    "last_updated_time": "20230722120209539"
                },
                {
                    "symbol": "BALUSDT",
                    "position": -10.9,
                    "entryPrice": 4.599,
                    "unRealizedProfit": -0.79343988,
                    "last_updated_time": "20230722120209539"
                },
                {
                    "symbol": "NEARUSDT",
                    "position": 34,
                    "entryPrice": 1.527,
                    "unRealizedProfit": -1.70109276,
                    "last_updated_time": "20230722120209539"
                },
                {
                    "symbol": "AVAXUSDT",
                    "position": 2,
                    "entryPrice": 14.818,
                    "unRealizedProfit": -1.708,
                    "last_updated_time": "20230722120209540"
                },
                {
                    "symbol": "MKRUSDT",
                    "position": 0.05,
                    "entryPrice": 1137.5,
                    "unRealizedProfit": -2.34827634,
                    "last_updated_time": "20230722120209540"
                },
                {
                    "symbol": "RVNUSDT",
                    "position": -2851,
                    "entryPrice": 0.01969,
                    "unRealizedProfit": 0.08553,
                    "last_updated_time": "20230722120209540"
                },
                {
                    "symbol": "KLAYUSDT",
                    "position": -864.8,
                    "entryPrice": 0.1713,
                    "unRealizedProfit": 1.81608,
                    "last_updated_time": "20230722120209540"
                },
                {
                    "symbol": "BTCDOMUSDT",
                    "position": -0.052,
                    "entryPrice": 1834.822222222,
                    "unRealizedProfit": 4.30675555,
                    "last_updated_time": "20230722120209540"
                },
                {
                    "symbol": "FTMUSDT",
                    "position": -297,
                    "entryPrice": 0.2555,
                    "unRealizedProfit": -0.86078619,
                    "last_updated_time": "20230722120209540"
                },
                {
                    "symbol": "XEMUSDT",
                    "position": -66890,
                    "entryPrice": 0.0299,
                    "unRealizedProfit": 4.5705937,
                    "last_updated_time": "20230722120209540"
                },
                {
                    "symbol": "OCEANUSDT",
                    "position": -206,
                    "entryPrice": 0.3736,
                    "unRealizedProfit": -1.70211208,
                    "last_updated_time": "20230722120209540"
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
let real_positions = response.metadata.metadata.positions;


let wierd_symbols = Object.keys(cal_positions).filter((symbol) => ! (real_positions.map((e) => e["symbol"]).includes(symbol)));
// console.log(real_positions.map((e) => e["symbol"]));
console.log(wierd_symbols);

for (let symbol of wierd_symbols) {
    if (cal_positions[symbol] !== 0) warning_msg += `inconsistent position of ${symbol}:: cal: ${cal_positions[symbol]}, real: 0 \n`
}


for (let item of real_positions) {
    let symbol = item["symbol"];
    let position = item["position"];
    if (position !== cal_positions[symbol]) warning_msg += `inconsistent position of ${symbol}:: cal: ${cal_positions[symbol]}, real: ${position} \n`
}

console.log(warning_msg);