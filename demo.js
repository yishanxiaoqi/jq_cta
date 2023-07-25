let response = {
    "ref_id": "STR9KcIXUqhzACQmb6q6hm2tRgt7XH",
    "action": "place_order",
    "strategy": "SimpleTrend",
    "metadata": {
        "exchange": "BinanceU",
        "symbol": "LINAUSDT",
        "contract_type": "perp",
        "event": "place_order",
        "metadata": {
            "account_id": "jq_cta_02",
            "result": false,
            "order_id": 0,
            "error_code": -1001,
            "error_code_msg": "Internal error; unable to process your request. Please try again."
        },
        "timestamp": "20230724175138714"
    },
    "request": {
        "label": "DN",
        "target": "SHORT",
        "exchange": "BinanceU",
        "symbol": "LINAUSDT",
        "contract_type": "perp",
        "quantity": 7655,
        "direction": "Sell",
        "order_type": "market",
        "account_id": "jq_cta_02",
        "client_order_id": "STR06hDNPAzh2",
        "ref_id": "STR9KcIXUqhzACQmb6q6hm2tRgt7XH"
    }
}


let action = response["action"];

let exchange = response["request"]["exchange"];
let symbol = response["request"]["symbol"];
let contract_type = response["request"]["contract_type"];
let client_order_id = response["request"]["client_order_id"];
let act_id = response["request"]["account_id"];

let label = response["request"]["label"];
let target = response["request"]["target"];
let quantity = response["request"]["quantity"];
let direction = response["request"]["direction"];

let interval = (client_order_id.slice(3, 4) === "0")? client_order_id.slice(4, 6): client_order_id.slice(3, 6);
let idf = [exchange, symbol, contract_type].join(".");
let entry = [exchange, symbol, contract_type, interval].join(".");
let order_idf = [act_id, symbol, interval, direction, label, client_order_id].join("|");

if (response["metadata"]["metadata"]["result"] === false) {


    let error_code = response["metadata"]["metadata"]["error_code"];
    let error_code_msg = response["metadata"]["metadata"]["error_code_msg"];
    let retry = response["request"]["retry"];

    console.log(error_code, error_code_msg, retry);
}