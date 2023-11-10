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
            // this._test_send_post_only_order();
            // this._test_send_order();
            // this._test_cancel_order();
            // this._test_inspect_order();
            this._test_query_orders();
            // this._test_modify_order();
            // this._test_query_account();
        }, 1000);
    }

    _test_send_post_only_order() {
        this.send_order({
            exchange: EXCHANGE.BINANCEU,
            symbol: "CRVUSDT",
            contract_type: CONTRACT_TYPE.PERP,
            quantity: 20,
            direction: DIRECTION.SELL,
            order_type: ORDER_TYPE.POST_ONLY,
            price: 0.48,
            account_id: "th_binance_cny_sub01",
            client_order_id: "12345678910111"
        });
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
            account_id: "th_binance_cny_sub01",
            client_order_id: "12345678910111"
        });
    }

    _test_query_quantitative_rules() {
        this.query_quantitative_rules({
            exchange: EXCHANGE.BINANCEU,
            // symbol: "XEMUSDT",
            contract_type: CONTRACT_TYPE.PERP,
            account_id: "th_binance_cny_sub01"
        });
    }

    _test_query_position() {
        this.query_position({
            exchange: EXCHANGE.BINANCEU,
            // symbol: "XEMUSDT",
            contract_type: CONTRACT_TYPE.PERP,
            account_id: "th_binance_cny_sub01"
        });
    }

    _test_query_account() {
        this.query_account({
            exchange: EXCHANGE.BINANCEU,
            contract_type: CONTRACT_TYPE.PERP,
            account_id: "th_binance_cny_sub03"
        });
    }

    _test_send_order() {
        this.send_order({
            exchange: EXCHANGE.BINANCEU,
            symbol: "BTCUSDT",
            contract_type: CONTRACT_TYPE.PERP,
            price: 35000,
            quantity: 0.01,
            direction: DIRECTION.SELL,
            order_type: ORDER_TYPE.LIMIT,
            account_id: "th_binance_cny_sub03",
            client_order_id: "12345678911xxx"
        });
    };

    _test_cancel_order() {
        this.cancel_order({
            exchange: EXCHANGE.OKX,
            symbol: "CRVUSDT",
            contract_type: CONTRACT_TYPE.PERP,
            order_id: "627254420702912542",
            account_id: "jq_okx_cny_master",
            // client_order_id: "12345678911xxx"
        });
    };

    _test_inspect_order() {
        this.inspect_order({
            exchange: EXCHANGE.OKX,
            symbol: "CRVUSDT",
            contract_type: CONTRACT_TYPE.PERP,
            // order_id: 166453859845,
            account_id: "jq_okx_cny_master",
            client_order_id: "12345678910"
        });
    };

    _test_modify_order() {
        this.modify_order({
            exchange: EXCHANGE.BINANCEU,
            symbol: "BTCUSDT",
            contract_type: CONTRACT_TYPE.PERP,
            price: 27700,
            quantity: 0.01,
            direction: DIRECTION.SELL,
            // order_id: "627254882340593664",
            account_id: "th_binance_cny_sub01",
            client_order_id: "12345678911xxx"
        });
    };

    _test_query_orders() {
        this.query_orders({
            exchange: EXCHANGE.BINANCEU,
            // symbol: "BALUSDT",
            contract_type: CONTRACT_TYPE.PERP,
            account_id: "th_binance_cny_sub01"
        });
    };

    _on_market_data_trade_ready(trade) {
        // console.log(JSON.stringify(trade));
    }

    _on_market_data_bestquote_ready(bestquote) {
        // console.log(JSON.stringify(bestquote));
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

    on_query_account_response(response) {
        logger.info('Demo', JSON.stringify(response));
    }
}


var intercom_config = [
    INTERCOM_CONFIG[`LOCALHOST_FEED`],
    INTERCOM_CONFIG[`LOCALHOST_STRATEGY`]
];
var demo = new DemoStrategy("Demo", "DMO", new Intercom(intercom_config));
demo.start();