require("../config/typedef.js");
const WS = require("ws");
const querystring = require("querystring");
const rp = require("request-promise-native");

const utils = require("../utils/util_func");
const apiconfig = require("../config/apiconfig.json");
const token = require("../config/token.json");

class ExchangeBase {
    constructor(name, intercom) {
        this.name = name;           // 交易所名字：如BinanceU, Bybit, OKX
        this.intercom = intercom;

        this.on_market_data_subscription_handler = this.on_market_data_subscription.bind(this);
        this.on_channel_subscription_handler = this.on_channel_subscription.bind(this);
        this.on_channel_unsubscription_handler = this.on_channel_unsubscription.bind(this);
    }

    start() {
        this._register_events();
        this._init_websocket();
    }

    _register_events() {
        // 收听策略端的订阅请求
        this.intercom.on("MARKET_DATA_SUBSCRIPTION", this.on_market_data_subscription_handler, INTERCOM_SCOPE.STRATEGY);
        this.intercom.on("CHANNEL_SUBSCRIPTION", this.on_channel_subscription_handler, INTERCOM_SCOPE.STRATEGY);
        this.intercom.on("CHANNEL_UNSUBSCRIPTION", this.on_channel_unsubscription_handler, INTERCOM_SCOPE.STRATEGY);
    }

    on_market_data_subscription(subscription_list) {
        logger.info(`${this.name}: no on_market_data_subscription implementation yet.`)
    }

    _format_subscription_list() {
        return SUBSCRIPTION_LIST.filter(x => x.split("|")[0] === this.name).map(x => this._format_subscription_item(x));
    }

    on_channel_subscription(channel) {
        logger.info(`${this.name}: no on_channel_subscription implementation yet.`)
    }

    on_channel_unsubscription(channel) {
        logger.info(`${this.name}: no on_channel_unsubscription implementation yet.`)
    }

    send_order() {

    }

    cancel_order() {

    }

    modify_order() {

    }

    _send_ws_message(ws, message) {
        /**
         * 0: CONNECTING
         * 1: OPEN
         * 2: CLOSING
         * 3: CLOSED
         */
        if (ws.readyState !== WS.OPEN) {
            logger.error(`${this.name}: send ws message failed for websocket not open yet: ${JSON.stringify(message)}`);
            return;
        }

        message = typeof message === 'object' ? JSON.stringify(message) : message;

        // logger.info(`${this.name}:: ${__callee}| ${message}`);

        try {
            ws.send(message, (err,) => {
                if (err) {
                    // logger.error(`${this.name}:: ${__callee}| error: ${err.stack}`);
                }
            });
        } catch (err) {
            // logger.error(`${this.name}:: ${__callee}| error: ${err.stack}`);
        }
    }

    _send_order_via_rest() {
        logger.info(`${this.name}: no implementation for _send_order_via_rest!`);
    }

    _cancel_order_via_rest() {
        logger.info(`${this.name}: no implementation for _cancel_order_via_rest!`);
    }

    _inspect_order_via_rest() {
        logger.info(`${this.name}: no implementation for _inspect_order_via_rest!`);
    }

    _query_position_via_rest() {
        logger.info(`${this.name}: no implementation for _query_position_via_rest!`);
    }

    _query_account_via_rest() {
        logger.info(`${this.name}: no implementation for _query_account_via_rest!`);
    }
}

module.exports = ExchangeBase;