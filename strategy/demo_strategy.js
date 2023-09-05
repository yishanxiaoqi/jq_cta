require("../config/typedef.js");
const StrategyBase = require("./strategy_base.js");
const Intercom = require("../module/intercom");

class DemoStrategy extends StrategyBase {
    constructor(name, alias, intercom) {
        super(name, alias, intercom);
    }

    start() {
        this._register_events();
        this.subscribe_market_data();

        setTimeout(() => {
            this._test_send_stop_market_order();
        }, 1000);
    }

    _test_send_stop_market_order() {
        this.send_order({
            exchange: EXCHANGE.BINANCEU,
            symbol: "BTCUSDT",
            contract_type: CONTRACT_TYPE.PERP,
            quantity: 0.001,
            direction: DIRECTION.SELL,
            order_type: ORDER_TYPE.STOP_MARKET,
            stop_price: 25000,
            account_id: "jq_cta_02",
            client_order_id: "12345678910111"
        });
    }

    _test_query_quantitative_rules() {
        this.query_quantitative_rules({
            exchange: EXCHANGE.BINANCEU,
            // symbol: "XEMUSDT",
            contract_type: CONTRACT_TYPE.PERP,
            account_id: "jq_cta_02"
        });
    }

    _test_query_position() {
        this.query_position({
            exchange: EXCHANGE.BINANCEU,
            // symbol: "XEMUSDT",
            contract_type: CONTRACT_TYPE.PERP,
            account_id: "jq_cta_02"
        });
    }

    _test_query_account() {
        this.query_account({
            exchange: EXCHANGE.BINANCEU,
            contract_type: CONTRACT_TYPE.PERP,
            account_id: "jq_cta_02"
        });
    }

    _test_send_order() {
        this.send_order({
            exchange: EXCHANGE.BINANCEU,
            symbol: "BTCUSDT",
            contract_type: CONTRACT_TYPE.PERP,
            quantity: 0.001,
            direction: DIRECTION.SELL,
            order_type: ORDER_TYPE.MARKET,
            account_id: "jq_cta_02",
            client_order_id: "12345678910"
        });
    };

    _test_cancel_order() {
        this.cancel_order({
            exchange: EXCHANGE.BINANCEU,
            symbol: "BTCUSDT",
            contract_type: CONTRACT_TYPE.PERP,
            // order_id: 166453859845,
            account_id: "jq_cta_02",
            client_order_id: "12345678914"
        });
    };

    _test_inspect_order() {
        this.inspect_order({
            exchange: EXCHANGE.BINANCEU,
            symbol: "BTCUSDT",
            contract_type: CONTRACT_TYPE.PERP,
            // order_id: 166453859845,
            account_id: "jq_cta_02",
            client_order_id: "12345678913"
        });
    };

    _test_query_orders() {
        this.query_orders({
            exchange: EXCHANGE.BINANCEU,
            symbol: "BTCUSDT",
            contract_type: CONTRACT_TYPE.PERP,
            account_id: "jq_cta_02"
        });
    };

    _on_market_data_trade_ready(trade) {
        // console.log(JSON.stringify(trade));
    }

    _test_slack_publish() {
        let publish = {
            "type": "alert",
            "msg": "try"
        }
        this.slack_publish(publish);
    }

    on_order_update(order_update) {
        console.log(JSON.stringify(order_update));
    }
}


var intercom_config = [
    INTERCOM_CONFIG[`LOCALHOST_FEED`],
    INTERCOM_CONFIG[`LOCALHOST_STRATEGY`]
];
var demo = new DemoStrategy("Demo", "DMO", new Intercom(intercom_config));
demo.start();