// 这个脚本是用来手动处理的，定义

require("../config/typedef.js");
const request = require('../module/request.js');
const Intercom = require("../module/intercom.js");
const StrategyBase = require("./strategy_base.js");
const stratutils = require("../utils/strat_util.js");

class AnnStrategy extends StrategyBase {
    constructor(name, alias, intercom) {
        super(name, alias, intercom);

        // this.symbols = ["ZECUSDT", "JASMYUSDT", "ARKUSDT", "GPSUSDT", "PERPUSDT", "NKNUSDT", "FLMUSDT", "BSWUSDT", "ALPACAUSDT", "VOXELUSDT"];
        this.symbols = ["ZECUSDT", "JASMYUSDT"];

    }

    start() {
        this._register_events();
        this.subscribe_market_data();

        for (let symbol of this.symbols) {
            this.execution(symbol);
        }

        // TODO每隔5分钟查询一下最新价格，推送盈利到slack
    }

    execution(symbol) {
        let that = this;
        let url = "https://fapi.binance.com/fapi/v1/trades?symbol=" + symbol + "&limit=1";
        request.get({
            url: url, json: true
        }, function (error, res, body) {
            let price = parseFloat(body[0]["price"]);
            let quantity = stratutils.transform_with_tick_size(100 / price, 1);

            that.send_order({
                exchange: EXCHANGE.BINANCEU,
                symbol: symbol,
                contract_type: CONTRACT_TYPE.PERP,
                quantity: quantity,
                direction: DIRECTION.SELL,
                order_type: ORDER_TYPE.MARKET,
                account_id: "th_binance_cny_master"
            });
        });
    }

    _test_slack_publish() {
        let publish = {
            "type": "alert",
            "msg": "try"
        }
        this.slack_publish(publish);
    }

    on_order_update(order_update) {
        // TODO记录成交价格
        console.log(JSON.stringify(order_update));
    }

    on_query_account_response(response) {
    }

    on_query_orders_response(response) {
    }
}


var intercom_config = [
    INTERCOM_CONFIG[`LOCALHOST_FEED`],
    INTERCOM_CONFIG[`LOCALHOST_STRATEGY`]
];
var ann = new AnnStrategy("AnnouncementDriven", "ANN", new Intercom(intercom_config));
ann.start();