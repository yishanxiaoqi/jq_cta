// 当前只适用于单一交易所单一账号

require("../config/typedef.js");
const fs = require("fs");
const WS = require("ws");
const randomID = require("random-id");
const querystring = require("querystring");
const rp = require("request-promise-native");

const Slack = require("../module/slack");
const logger = require("../module/logger.js");
const Intercom = require("../module/intercom");
const utils = require("../utils/util_func");
const apiconfig = require("../config/apiconfig.json");

class FeedApp {
    constructor(intercom) {
        this.name = "FeedApp";
        this.slack = new Slack.Slack();
        this.intercom = intercom;

        // 默认订阅XEMUSDT的trade数据
        this.symbols = ["XEMUSDT"]; 

        // account_id及其对应的apiKey和apiSecret，目前一个策略只能做一个账号
        this.account_id = "jq_cta_02";
        this.apiKey = "qGKdrATW1ZaSxjhyClx2zez8BHJp9uVrBmCVZ6LbOeNF65GRazB25pwFWpYabDPB";
        this.apiSecret = "u3k0fbR7eqYDKnltU31nWwQ19Jw0RxqUg8XDuMTQoKiBr8mN7gRQbQN6ocIndDAG";

        this.listenKey = undefined;
        this.on_market_data_subscription_handler = this.on_market_data_subscription.bind(this);
    }

    on_market_data_subscription(idfs_list){
        logger.info(`${this.name}: no on_market_data_subscription implementation yet.`)
    }

    _register_events() {
        let that = this;
        // 收听策略端的订阅请求
        this.intercom.on("MARKET_DATA_SUBSCRIPTION", that.on_market_data_subscription_handler, INTERCOM_SCOPE.STRATEY);
    }

    start() {
        this._register_events();
        this._init_websocket();
    }

    async _init_websocket() {
        if (this.listenKey === undefined) {
            await this.get_listenKey();
        }

        this.ws = new WS(apiconfig.privateWebsocketUrl + this.listenKey + "?listenKey=" + this.listenKey);

        this.ws.on("open", (evt) => {
            logger.info(`${this.name}: private WS is CONNECTED.`);
            this.ws_connected_ts = Date.now();

            if (this.ws_keep_alive_interval) {
                clearInterval(this.ws_keep_alive_interval);
                this.ws_keep_alive_interval = undefined;
            }
            this.ws_keep_alive_interval = setInterval(() => {
                this.ws.ping(() => { });
                this.ws.pong(() => { });

                if (Date.now() - this.ws_connected_ts > 23 * 60 * 60 * 1000) {
                    logger.warn("")
                    this._init_websocket();
                }
            }, 30000);

            // 100毫秒后订阅频道
            setTimeout(() => {
                const sub_id = +randomID(6, '0');
                const sub_streams = this.symbols.map((symbol) => { return `${symbol.toLowerCase()}@aggTrade` });
                this._send_ws_message({ method: "SUBSCRIBE", params: sub_streams, id: sub_id });
            }, 100);
        });

        this.ws.on("close", (code, reason) => {
            logger.warn(`${this.name}:: private websocket is DISCONNECTED. reason: ${reason} code: ${code}`);
            logger.error(`${this.name} private WS is DISCONNECTED.`);

            if (code === 1006) {
                // 很有可能是VPN连接不稳定
                this._init_websocket();
            }
        });

        this.ws.on("message", (evt) => {
            let that = this;
            let jdata;
            try {
                jdata = JSON.parse(evt);
            } catch (ex) {
                logger.error(ex);
                return;
            }

            // console.log("private WS: ", JSON.stringify(jdata));

            if (jdata["e"] === "ORDER_TRADE_UPDATE") {
                // order_update更新
                let order_update = this._format_order_update(jdata);
                this.intercom.emit("ORDER_UPDATE", order_update, INTERCOM_SCOPE.FEED);
            } else if (jdata["e"] ===  "aggTrade") {
                // trade价格更新
                let market_data = this._format_market_data(jdata);
                this.intercom.emit("MARKET_DATA", market_data, INTERCOM_SCOPE.FEED);
            } else if (jdata["e"] === "ACCOUNT_UPDATE") {
                // let account_update = this._format_market_data(jdata);
                let account_update = jdata;
                this.intercom.emit("ACCOUNT_UPDATE", account_update, INTERCOM_SCOPE.FEED);
            }
        });

        this.ws.on("error", (evt) => {
            logger.error("private_websocket on error: " + evt);
            console.log("error", evt);
        });

        this.ws.on("ping", (evt) => {
            console.log("private ping", evt);
            this.ws.pong();
        });
    }

    async get_listenKey() {
        let params = this._get_rest_options(apiconfig.restUrlListenKey, {}, this.account_id);

        var options = {
            url: params["url"] + params["postbody"],
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                "X-MBX-APIKEY": this.apiKey
            }
        };

        let body = await rp.post(options);
        this.listenKey = JSON.parse(body)["listenKey"];

        logger.info(`${this.name}: listen key received: ${this.listenKey}`);
    }

    _format_order_update(jdata) {
        let order_update = {
            exchange: "BinanceU",
            symbol: jdata["o"]["s"],
            contract_type: "perp",
            metadata: {
                result: true,
                account_id: this.account_id,
                order_id: jdata["o"]["i"],
                client_order_id: jdata["o"]["c"],
                direction: (jdata["o"]["S"] === "SELL") ? DIRECTION.SELL : DIRECTION.BUY,
                timestamp: jdata["o"]["T"],
                fee: jdata["o"]["n"] ? parseFloat(jdata["o"]["n"]): undefined,
                update_type: this._convert_to_standard_order_update_type(jdata["o"]["x"])
            },
            timestamp: utils._util_get_human_readable_timestamp(),
            order_info: {
                original_amount: parseFloat(jdata["o"]["q"]),
                filled: parseFloat(jdata["o"]["z"]),
                new_filled: parseFloat(jdata["o"]["l"]),
                avg_executed_price: parseFloat(jdata["o"]["ap"]),
                submit_price: parseFloat(jdata["o"]["p"]),
                status: this._convert_to_standard_order_status(jdata["o"]["X"])
            }
        };
        return order_update;
    }

    _format_market_data(jdata) {
        let market_data;
        switch (jdata["e"]) {
            case "aggTrade":
                let updated_trades = [
                    [
                        String(jdata["f"]),
                        utils.get_human_readable_timestamp(jdata["T"]),
                        parseFloat(jdata["p"]),
                        (jdata["m"] ? TRADE_SIDE.SELL : TRADE_SIDE.BUY),
                        parseFloat(jdata["q"])
                    ]
                ];
                market_data = {
                    exchange: "BinanceU",
                    symbol: jdata["s"],
                    contract_type: "perp",
                    data_type: MARKET_DATA.TRADE,
                    metadata: updated_trades,
                    timestamp: utils._util_get_human_readable_timestamp()
                };
                return market_data;

        }
    }

    _get_rest_options(apiEndpoint, params, account_id = "test") {
        let that = this;
        let presign = querystring.stringify(params);
        let signature = utils.HMAC("sha256", that.apiSecret, presign);
        let url = apiconfig.restUrl + apiEndpoint;
        return {
            url: url + "?",
            postbody: presign + "&signature=" + signature
        };
    }

    _convert_to_standard_order_status(status) {
        switch (status) {
            case "CANCELED":
            case "CANCELED was: PARTIALLY FILLED":
            case "INSUFFICIENT MARGIN was: PARTIALLY FILLED":
            case "canceled":
            case "cancelled":
            case "Canceled":
            case "partial-canceled":
            case "-1":
                return ORDER_STATUS.CANCELLED;
            case "FILLED":
            case "filled":
            case "Filled":
            case "EXECUTED":
            case "0":
                return ORDER_STATUS.FILLED;
            case "NEW":
            case "submitted":
            case "New":
            case "new":
            case "ACTIVE":
            case "1":
            case "live":
                return ORDER_STATUS.SUBMITTED;
            case "PartiallyFilled":
            case "PARTIALLY_FILLED":
            case "partial-filled":
            case "partiallyFilled":
            case "PARTIALLY FILLED":
            case "partially_filled":
            case "2":
                return ORDER_STATUS.PARTIALLY_FILLED;
            default:
                logger.warn(`No predefined order status conversion rule in ${this.name} for ${status}`);
                return "unknown";
        }
    }

    _convert_to_standard_order_update_type(update_type) {
        switch (update_type) {
            case "NEW":
                return ORDER_UPDATE_TYPE.SUBMITTED;
            case "CANCELED":
                return ORDER_UPDATE_TYPE.CANCELLED;
            case "CALCULATED - Liquidation Execution":
                return ORDER_UPDATE_TYPE.LIQUIDATED;
            case "EXPIRED":
                return ORDER_UPDATE_TYPE.EXPIRED;
            case "TRADE":
                return ORDER_UPDATE_TYPE.EXECUTED;
            case "AMENDMENT - Order Modified":
                return ORDER_UPDATE_TYPE.MODIFIED;
        }
    }

    _send_ws_message(message) {
        if (this.ws['readyState'] !== WS.OPEN) {
            // logger.error(`${this.name}::${__callee}| send ws message failed for websocket not open yet: ${message}`);
            return;
        }

        message = typeof message === 'object' ? JSON.stringify(message) : message;

        // logger.info(`${this.name}:: ${__callee}| ${message}`);

        try {
            this.ws.send(message, (err,) => {
                if (err) {
                    // logger.error(`${this.name}:: ${__callee}| error: ${err.stack}`);
                }
            });
        } catch (err) {
            // logger.error(`${this.name}:: ${__callee}| error: ${err.stack}`);
        }
    }
}

module.exports = FeedApp;

var intercom_config = [
    INTERCOM_CONFIG[`LOCALHOST_FEED`],
    INTERCOM_CONFIG[`LOCALHOST_STRATEGY`]
];
var feed_app = new FeedApp(new Intercom(intercom_config));
feed_app.start();

// process.on('SIGINT', async () => {
//     logger.info(`${strategy.alias}::SIGINT`);
//     setTimeout(() => process.exit(), 3000)
// });

// process.on('exit', async () => {
//     logger.info(`${strategy.alias}:: exit`);
// });

// process.on('uncaughtException', (err) => {
//     logger.error(`uncaughtException: ${JSON.stringify(err.stack)}`);
// });

// process.on('unhandledRejection', (reason, p) => {
//     logger.error(`unhandledRejection: ${p}, reason: ${reason}`);
// });