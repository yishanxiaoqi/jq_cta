const request = require("request");
const PRICE_TICK_SIZE = {};
const QUANTITY_TICK_SIZE = {};

let idf = "BinanceU.BTCUSDT.perp";
let [exchange, symbol, contract_type] = idf.split(".");

let url = "https://fapi.binance.com/fapi/v1/exchangeInfo";
request.get({
    url: url, json: true
}, function (error, res, body) {
    let infos = body["symbols"].filter(e => e.symbol == symbol);
    if (infos.length === 1) {
        let info = infos[0];
        PRICE_TICK_SIZE[idf] = parseFloat(info["filters"].filter(e => e.filterType === "PRICE_FILTER")[0]["tickSize"]);
        QUANTITY_TICK_SIZE[idf] = parseFloat(info["filters"].filter(e => e.filterType === "LOT_SIZE")[0]["stepSize"]);
        console.log(PRICE_TICK_SIZE, QUANTITY_TICK_SIZE);
    } else {

    }
});