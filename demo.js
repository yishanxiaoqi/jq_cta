require("./config/stratdef.js");
const stratutils = require("./utils/strat_util.js");

let response = {
    "ref_id": "R017MeBPuOH08evWD9mnAl92qZjFak",
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
            "error_code": -2013
        },
        "timestamp": "20250127080105108",
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
        "client_order_id": "R01DNZioNAed",
        "ref_id": "R017MeBPuOH08evWD9mnAl92qZjFak",
        "send_time": "20250127080105084"
    }
}

let that = {};
that["order_map"] = {"BinanceU.1000XECUSDT.perp":{"ANTI_L":{"client_order_id":"R01LSyafwm4P","label":"ANTI_L|STOPLOSS","price":0.03182,"quantity":323578,"time":1737963046098},"R01LSyafwm4P":{"label":"ANTI_L|STOPLOSS","target":"EMPTY","quantity":323578,"time":1737963046098,"filled":0}},"BinanceU.ADAUSDT.perp":{"UP":{"client_order_id":"R01UP7sPku6Q","label":"UP","price":1.0388,"quantity":5066,"time":1737968400097},"DN":{"client_order_id":"R01DNf7TbPao","label":"DN","price":0.7216,"quantity":7294,"time":1737968400135},"R01UP7sPku6Q":{"label":"UP","target":"SHORT","quantity":5066,"time":1737968400097,"filled":0},"R01DNf7TbPao":{"label":"DN","target":"LONG","quantity":7294,"time":1737968400135,"filled":0}},"BinanceU.BANDUSDT.perp":{"UP":{"client_order_id":"R01UPdzi9u12","label":"UP","price":1.1763,"quantity":850.1,"time":1730988000552},"DN":{"client_order_id":"R01DNXmz8Zrh","label":"DN","price":1.1033,"quantity":906.4,"time":1730988000554}},"BinanceU.BNBUSDT.perp":{"UP":{"client_order_id":"R01UP2QGwRWg","label":"UP","price":712.99,"quantity":14.76,"time":1737968400257},"DN":{"client_order_id":"R01DNPUCtzAQ","label":"DN","price":580.07,"quantity":18.15,"time":1737968400258},"R01UP2QGwRWg":{"label":"UP","target":"SHORT","quantity":14.76,"time":1737968400257,"filled":0},"R01DNPUCtzAQ":{"label":"DN","target":"LONG","quantity":18.15,"time":1737968400258,"filled":0}},"BinanceU.DENTUSDT.perp":{"UP":{"client_order_id":"R01UPTXeNQl9","label":"UP","price":0.001211,"quantity":8691990,"time":1737968400545},"DN":{"client_order_id":"R01DN4mdxuQy","label":"DN","price":0.000875,"quantity":12029714,"time":1737968400545},"R01UPTXeNQl9":{"label":"UP","target":"SHORT","quantity":8691990,"time":1737968400545,"filled":0},"R01DN4mdxuQy":{"label":"DN","target":"LONG","quantity":12029714,"time":1737968400545,"filled":0}},"BinanceU.DOTUSDT.perp":{"UP":{"client_order_id":"R01UPfAT7D5P","label":"UP","price":6.655,"quantity":949.1,"time":1737968400292},"DN":{"client_order_id":"R01DNw93nKoK","label":"DN","price":4.671,"quantity":1352.2,"time":1737968400293},"R01UPfAT7D5P":{"label":"UP","target":"SHORT","quantity":949.1,"time":1737968400292,"filled":0},"R01DNw93nKoK":{"label":"DN","target":"LONG","quantity":1352.2,"time":1737968400293,"filled":0}},"BinanceU.DYDXUSDT.perp":{"UP":{"client_order_id":"R01UPEsVP5bL","label":"UP","price":1.446,"quantity":2074.7,"time":1731297601973},"DN":{"client_order_id":"R01DNGKCtlcf","label":"DN","price":1.146,"quantity":2617.8,"time":1731297601974}},"BinanceU.ETCUSDT.perp":{"UP":{"client_order_id":"R01UPFRPr3I1","label":"UP","price":27.585,"quantity":381.58,"time":1737968400056},"DN":{"client_order_id":"R01DNwCGnbtx","label":"DN","price":22.705,"quantity":463.6,"time":1737968400063},"R01UPFRPr3I1":{"label":"UP","target":"SHORT","quantity":381.58,"time":1737968400056,"filled":0},"R01DNwCGnbtx":{"label":"DN","target":"LONG","quantity":463.6,"time":1737968400063,"filled":0}},"BinanceU.HOTUSDT.perp":{"UP":{"client_order_id":"R01UPxsZ6wWW","label":"UP","price":0.002265,"quantity":2323620,"time":1737968400645},"DN":{"client_order_id":"R01DNfU97Cjk","label":"DN","price":0.001621,"quantity":3246761,"time":1737968400646},"R01UPxsZ6wWW":{"label":"UP","target":"SHORT","quantity":2323620,"time":1737968400645,"filled":0},"R01DNfU97Cjk":{"label":"DN","target":"LONG","quantity":3246761,"time":1737968400646,"filled":0}},"BinanceU.SKLUSDT.perp":{"UP":{"client_order_id":"R01UPgwiGN4d","label":"UP","price":0.05744,"quantity":91626,"time":1737968400156},"DN":{"client_order_id":"R01DNc1I266x","label":"DN","price":0.03306,"quantity":159195,"time":1737968400157},"R01UPgwiGN4d":{"label":"UP","target":"SHORT","quantity":91626,"time":1737968400156,"filled":0},"R01DNc1I266x":{"label":"DN","target":"LONG","quantity":159195,"time":1737968400157,"filled":0}},"BinanceU.SOLUSDT.perp":{"UP":{"client_order_id":"R01UPGAJIhKV","label":"UP","price":259.85,"quantity":24,"time":1737968400165},"DN":{"client_order_id":"R01DNw3NStJ2","label":"DN","price":190.95,"quantity":33,"time":1737968400169},"R01UPGAJIhKV":{"label":"UP","target":"SHORT","quantity":24,"time":1737968400165,"filled":0},"R01DNw3NStJ2":{"label":"DN","target":"LONG","quantity":33,"time":1737968400169,"filled":0}},"BinanceU.THETAUSDT.perp":{"UP":{"client_order_id":"R01UPEH8NF6i","label":"UP","price":2.137,"quantity":2955.5,"time":1737968400560},"DN":{"client_order_id":"R01DNQPxx4zM","label":"DN","price":1.402,"quantity":4505,"time":1737968400572},"R01UPEH8NF6i":{"label":"UP","target":"SHORT","quantity":2955.5,"time":1737968400560,"filled":0},"R01DNQPxx4zM":{"label":"DN","target":"LONG","quantity":4505,"time":1737968400572,"filled":0}},"BinanceU.ZILUSDT.perp":{"UP":{"client_order_id":"R01UP9R097ci","label":"UP","price":0.02647,"quantity":37779,"time":1732881600590},"DN":{"client_order_id":"R01DNHAoClsD","label":"DN","price":0.02429,"quantity":41169,"time":1732881600591}},"BinanceU.ALGOUSDT.perp":{"UP":{"client_order_id":"R01UPQjNzmZk","label":"UP","price":0.4145,"quantity":12697.2,"time":1737968400261},"DN":{"client_order_id":"R01DNK4f9L5Q","label":"DN","price":0.2901,"quantity":18142,"time":1737968400286},"R01UPQjNzmZk":{"label":"UP","target":"SHORT","quantity":12697.2,"time":1737968400261,"filled":0},"R01DNK4f9L5Q":{"label":"DN","target":"LONG","quantity":18142,"time":1737968400286,"filled":0}},"BinanceU.ATOMUSDT.perp":{"UP":{"client_order_id":"R01UPAtfU3gd","label":"UP","price":6.596,"quantity":797.91,"time":1737968400551},"DN":{"client_order_id":"R01DNoSpYjOV","label":"DN","price":4.632,"quantity":1136.23,"time":1737968400552},"R01UPAtfU3gd":{"label":"UP","target":"SHORT","quantity":797.91,"time":1737968400551,"filled":0},"R01DNoSpYjOV":{"label":"DN","target":"LONG","quantity":1136.23,"time":1737968400552,"filled":0}},"BinanceU.BALUSDT.perp":{"UP":{"client_order_id":"R01UPKNgKsR2","label":"UP","price":2.84,"quantity":1853.2,"time":1737968400537},"DN":{"client_order_id":"R01DNrgeOPYz","label":"DN","price":1.762,"quantity":2986.9,"time":1737968400538},"R01UPKNgKsR2":{"label":"UP","target":"SHORT","quantity":1853.2,"time":1737968400537,"filled":0},"R01DNrgeOPYz":{"label":"DN","target":"LONG","quantity":2986.9,"time":1737968400538,"filled":0}},"BinanceU.MKRUSDT.perp":{"UP":{"client_order_id":"R01UPWsVMl8h","label":"UP","price":1232.4,"quantity":4.271,"time":1737968400249},"DN":{"client_order_id":"R01DNgi3336O","label":"DN","price":1042.2,"quantity":5.05,"time":1737968400253},"R01UPWsVMl8h":{"label":"UP","target":"SHORT","quantity":4.271,"time":1737968400249,"filled":0},"R01DNgi3336O":{"label":"DN","target":"LONG","quantity":5.05,"time":1737968400253,"filled":0}},"BinanceU.KAVAUSDT.perp":{"UP":{"client_order_id":"R01UPUVaVzRR","label":"UP","price":0.4625,"quantity":4324.3,"time":1737968400635},"DN":{"client_order_id":"R01DNx1vk39a","label":"DN","price":0.3637,"quantity":5499,"time":1737968400637},"R01UPUVaVzRR":{"label":"UP","target":"SHORT","quantity":4324.3,"time":1737968400635,"filled":0},"R01DNx1vk39a":{"label":"DN","target":"LONG","quantity":5499,"time":1737968400637,"filled":0}},"BinanceU.FLMUSDT.perp":{"UP":{"client_order_id":"R01UPgyHY5Yd","label":"UP","price":0.0567,"quantity":35273,"time":1737968401168},"DN":{"client_order_id":"R01DNLb268Ji","label":"DN","price":0.0425,"quantity":47059,"time":1737968401169},"R01UPgyHY5Yd":{"label":"UP","target":"SHORT","quantity":35273,"time":1737968401168,"filled":0},"R01DNLb268Ji":{"label":"DN","target":"LONG","quantity":47059,"time":1737968401169,"filled":0}}}

console.log((response["metadata"]["order_info"]["status"] === "unknown"));
console.log((response["metadata"]["order_info"]["status"] === "unknown") && (response["metadata"]["metadata"]["error_code_msg"] === "Order does not exist."));

let exchange = response["request"]["exchange"];
let symbol = response["request"]["symbol"];
let contract_type = response["request"]["contract_type"];
let client_order_id = response["request"]["client_order_id"];
let idf = [exchange, symbol, contract_type].join(".");

idf = "BinanceU.1000XECUSDT.perp";
client_order_id = "R01LSyafwm4P";

let label = client_order_id.slice(3, 5);
if (!Object.values(LABELMAP).includes(label)) {
    logger.error(`${that.alias}::on_order_update|unknown order label ${label}!`);
    return;
}
label = stratutils.get_key_by_value(LABELMAP, label);

console.log(label);



if (client_order_id in that.order_map[idf]) {
    console.log("1", client_order_id);
    delete that.order_map[idf][client_order_id];
}

if ((label.slice(0, 6) in that.order_map[idf]) && (that.order_map[idf][label.slice(0, 6)]["client_order_id"] === client_order_id)) {
    console.log("2", client_order_id);
    delete that.order_map[idf][label.slice(0, 6)];
}