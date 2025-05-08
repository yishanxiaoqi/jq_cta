require("../config/typedef.js");

const utils = require("../utils/util_func");
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
            // this._test_query_orders();
            // this._test_modify_order();
            // this._test_query_account();
            // this._test_send_fake_trade();
            // this._test_make_call();
            // this._test_slack_publish();
            // this._test_channel_subscription();
            // this._test_channel_unsubscription();
            // this._test_query_position();
        }, 1000);
    }

    _test_channel_subscription() {
        // this.subscribe_channel("BinanceU|JOEUSDT|perp|trade");
        this.subscribe_channel("BinanceU|JOEUSDT|perp|bestquote");
    }

    _test_channel_unsubscription() {
        this.unsubscribe_channel("BinanceU|BTCUSDT|perp|bestquote");
    }

    _test_make_call() {
        this.call();
    }

    _test_send_fake_trade() {
        let symbol = "ALPACAUSDT";
        let metadata = [
            [
                String(482902330),          // aggregated trade id
                utils._util_get_human_readable_timestamp(),
                parseFloat("0.17"),      // price
                TRADE_SIDE.SELL,
                parseFloat(6685475.57 * 200)
            ]
        ];
        let market_data = {
            exchange: EXCHANGE.BINANCEU,
            symbol: symbol,
            contract_type: CONTRACT_TYPE.PERP,
            data_type: MARKET_DATA.TRADE,
            metadata: metadata,
            timestamp: utils._util_get_human_readable_timestamp()
        };
        this.intercom.emit("MARKET_DATA", market_data, INTERCOM_SCOPE.FEED);
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
            account_id: "th_binance_cny_master"
        });
    }

    _test_query_account() {
        this.query_account({
            exchange: EXCHANGE.BINANCEU,
            contract_type: CONTRACT_TYPE.PERP,
            account_id: "th_binance_cny_master"
        });
    }

    _test_send_order() {
        this.send_order({
            exchange: EXCHANGE.BINANCEU,
            symbol: "ALPACAUSDT",
            contract_type: CONTRACT_TYPE.PERP,
            // stop_price: 0.2,
            price: 0.2,
            quantity: 100,
            direction: DIRECTION.SELL,
            order_type: ORDER_TYPE.LIMIT,
            account_id: "th_binance_cny_sub01",
            client_order_id: "12345678911xxx"
        });
    };

    _test_cancel_order() {
        this.cancel_order({
            exchange: EXCHANGE.BINANCEU,
            symbol: "ALPACAUSDT",
            contract_type: CONTRACT_TYPE.PERP,
            // order_id: "627254420702912542",
            account_id: "th_binance_cny_sub01",
            client_order_id: "VOTSPmvaIq8M"
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
        if (trade.symbol === "JOEUSDT") console.log(JSON.stringify(trade));
    }

    _on_market_data_bestquote_ready(bestquote) {
        // console.log(JSON.stringify(bestquote));
    }

    _test_slack_publish() {
        let publish = {
            "type": "alert",
            "msg": "test"
        }
        this.slack_publish(publish);
    }

    on_order_update(order_update) {
        console.log(JSON.stringify(order_update));
    }

    on_query_account_response(response) {
        logger.info('Demo', JSON.stringify(response));
    }

    on_query_orders_response(response) {
        let orders = response.metadata.metadata.orders.filter((e) => e.client_order_id.startsWith("SRE"));

        for (let order of orders) {
            this.cancel_order({
                exchange: EXCHANGE.BINANCEU,
                symbol: order.symbol,
                contract_type: CONTRACT_TYPE.PERP,
                // order_id: "627254420702912542",
                account_id: "th_binance_cny_sub01",
                client_order_id: order.client_order_id
            })
        }
    }

    on_active_orders(active_orders) {
        console.log(JSON.stringify(active_orders));
    }
}


var intercom_config = [
    INTERCOM_CONFIG[`LOCALHOST_FEED`],
    INTERCOM_CONFIG[`LOCALHOST_STRATEGY`]
];
var demo = new DemoStrategy("Demo", "DMO", new Intercom(intercom_config));
demo.start();