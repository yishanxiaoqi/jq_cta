require("../config/typedef.js");
const WS = require("ws");
const querystring = require("querystring");
const rp = require("request-promise-native");

const utils = require("../utils/util_func");
const apiconfig = require("../config/apiconfig.json");
const token = require("../config/token.json");

class ExchangeBase {
    constructor(name, intercom) {
        this.name = name;           // 交易所名字：如BinanceU, Bybit
        this.intercom = intercom;

        this.on_market_data_subscription_handler = this.on_market_data_subscription.bind(this);
    }

    start() {
        this._register_events();
        this._init_websocket();
    }

    _register_events() {
        // 收听策略端的订阅请求
        this.intercom.on("MARKET_DATA_SUBSCRIPTION", this.on_market_data_subscription_handler, INTERCOM_SCOPE.STRATEY);
    }

    on_market_data_subscription(subscription_list) {
        logger.info(`${this.name}: no on_market_data_subscription implementation yet.`)
    }



    send_order() {

    }

    cancel_order() {

    }

    modify_order() {

    }

    _get_rest_options(url, params, account_id = "test") {
        console.log(account_id);
        let apiSecret = token[account_id].apiSecret;
        
        let presign = querystring.stringify(params);
        let signature = utils.HMAC("sha256", apiSecret, presign);
        return {
            url: url + "?",
            postbody: presign + "&signature=" + signature
        };
    }

    _send_ws_message(ws, message) {
        if (ws['readyState'] !== WS.OPEN) {
            // logger.error(`${this.name}::${__callee}| send ws message failed for websocket not open yet: ${message}`);
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