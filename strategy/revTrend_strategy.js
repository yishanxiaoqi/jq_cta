const WS = require("ws");
const randomID = require("random-id");
const EventEmitter = require("events");
const querystring = require("querystring");
const rp = require("request-promise-native");

const logger = require("../module/logger.js");
const utils = require("../utils/util_func");
const emitter = new EventEmitter.EventEmitter();

/** const values */
DIRECTION = {
    BUY: "Buy",
    SELL: "Sell",
    COVER: "Cover",
    SHORT: "Short"
}

ORDER_UPDATE_TYPE = {
    SUBMITTED: "submitted",
    CANCELLED: "cancelled",
    EXECUTED: "executed",
    EXPIRED: "expired",
    LIQUIDATED: "liquidated"
}

ORDER_STATUS = {
    SUBMITTED: "new",
    CANCELLED: "cancelled",
    FILLED: "filled",
    PARTIALLY_FILLED: "partially_filled"
}

class RevTrendStrategy {
    constructor(name, alias) {
        this.name = name;
        this.alias = alias;
        this.intercom = emitter;

        this.cfg = require(`../config/cfg_${alias}.json`);

        this.account_id = "jq_cta_02";
        this.apiKey = "qGKdrATW1ZaSxjhyClx2zez8BHJp9uVrBmCVZ6LbOeNF65GRazB25pwFWpYabDPB";
        this.apiSecret = "u3k0fbR7eqYDKnltU31nWwQ19Jw0RxqUg8XDuMTQoKiBr8mN7gRQbQN6ocIndDAG";

        this.restUrl = "https://fapi.binance.com";
        this.restUrlListenKey = "/fapi/v1/listenKey";
        this.privateWebsocketUrl = "wss://fstream-auth.binance.com/ws/";
        this.listenKey = undefined;
    }

    start() {
        this._init_websocket();
    }

    async _init_websocket() {
        if (this.listenKey === undefined) {
            await this.get_listenKey();
        } 

        this.ws = new WS(this.privateWebsocketUrl + this.listenKey + "?listenKey=" + this.listenKey);
        
        this.ws.on("open", (evt) => {
            console.log("private open", JSON.stringify(evt));
            logger.info(`${this.name} private WS is CONNECTED.`);

            this.ws_connected_ts = Date.now();

            if (this.ws_keep_alive_interval) {
                clearInterval(this.ws_keep_alive_interval);
                this.ws_keep_alive_interval = undefined;
            }
            this.ws_keep_alive_interval = setInterval(() => {
                this.ws.ping(() => {});
                this.ws.pong(() => {});

                if (Date.now() - this.ws_connected_ts > 23 * 60 * 60 * 1000) {
                    this._init_websocket();
                }
            }, 30000);

            // 2秒后订阅频道
            setTimeout(() => {                
                const sub_id = +randomID(6, '0');
                const sub_streams = this.cfg["symbols"].map((symbol) => {return `${symbol.toLowerCase()}@aggTrade`});
                this._send_ws_message({method: "SUBSCRIBE", params: sub_streams, id: sub_id});
            }, 2000);
        });

        this.ws.on("close", (code, reason) => {
            logger.warn(`${this.name}:: private websocket is DISCONNECTED. reason: ${reason} code: ${code}`);
            console.log(`${this.name}:: private websocket is DISCONNECTED. reason: ${reason} code: ${code}`);
            logger.error(`${this.name} private WS is DISCONNECTED.`);

            if (code === 1006) {
                // 很有可能是VPN连接不稳定
                this._reconnect();
            }
        });

        this.ws.on("message", (evt) => {
            console.log("private message", evt);
            let that = this;
            let jdata;
            try {
                jdata = JSON.parse(evt);
            } catch (ex) {
                logger.error(ex);
                return;
            }

            console.log("private WS: ", JSON.stringify(jdata));

            if (jdata["o"]) {
                let order_update = {
                    exchange: "BinanceU",
                    symbol: jdata["o"]["s"],
                    contract_type: "perp",
                    metadata: {
                        result: true,
                        account_id: this.account_id,
                        order_id: jdata["o"]["i"],
                        client_order_id: jdata["o"]["c"],
                        direction: (jdata["o"]["s"] === "SELL") ? DIRECTION.SELL: DIRECTION.BUY,
                        timestamp: jdata["o"]["T"],
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

                // console.log(JSON.stringify(order_update));
                // let ex_act_id = ["BinanceU", account_id].join("|");
                // console.log(ex_act_id);
                this.intercom.emit("ORDER_UPDATE", order_update);
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
        let params = this._get_rest_options(this.restUrlListenKey, {}, this.account_id);

        var options = {
            url: params["url"] + params["postbody"],
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                "X-MBX-APIKEY": this.apiKey
            }
        };

        let body = await rp.post(options);
        this.listenKey = JSON.parse(body)["listenKey"];

        console.log(this.listenKey);
    }

    _get_rest_options(apiEndpoint, params, account_id = "test") {
        let that = this;
        let presign = querystring.stringify(params);
        let signature = utils.HMAC("sha256", that.apiSecret, presign);
        let url = this.restUrl + apiEndpoint;
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

    _convert_to_standard_order_update_type (update_type) {
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

var revTrendStrategy = new RevTrendStrategy("RevTrend", "R01");
revTrendStrategy.start();