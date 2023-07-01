require("../config/typedef.js");
const WS = require("ws");
const randomID = require("random-id");
const EventEmitter = require("events");
const querystring = require("querystring");
const rp = require("request-promise-native");

const apiconfig = require("../config/apiconfig.json");
const logger = require("../module/logger.js");
const utils = require("../utils/util_func");
const emitter = new EventEmitter.EventEmitter();

class RevTrendStrategy {
    constructor(name, alias) {
        this.name = name;
        this.alias = alias;
        this.intercom = emitter;

        this.cfg = require(`../config/cfg_${alias}.json`);

        this.account_id = "jq_cta_02";
        this.apiKey = "qGKdrATW1ZaSxjhyClx2zez8BHJp9uVrBmCVZ6LbOeNF65GRazB25pwFWpYabDPB";
        this.apiSecret = "u3k0fbR7eqYDKnltU31nWwQ19Jw0RxqUg8XDuMTQoKiBr8mN7gRQbQN6ocIndDAG";

        this.listenKey = undefined;

        this.on_market_data_handler = this.on_market_data_ready.bind(this);
        this.on_order_update_handler = this.on_order_update.bind(this);
        this.on_response_handler = this.on_response.bind(this);
        this.on_account_update_handler = this.on_account_update.bind(this);
    }

    _register_events() {
        let that = this;
        this.intercom.on("MARKET_DATA", that.on_market_data_handler);
        this.intercom.on("ORDER_UPDATE", that.on_order_update_handler);
        this.intercom.on("REQUEST_RESPONSE", that.on_response_handler);
        this.intercom.on("ACCOUNT_UPDATE", that.on_account_update_handler);
    }

    start() {
        this._register_events();
        this._init_websocket();

        setTimeout(() => {
            this._test_query_orders();
        }, 1000 * 3);
    }

    _test_send_order() {
        this.send_order({
            exchange: EXCHANGE.BINANCEU,
            symbol: "BTCUSDT",
            contract_type: CONTRACT_TYPE.PERP,
            price: 32000,
            quantity: 0.001,
            direction: DIRECTION.SELL,
            order_type: ORDER_TYPE.LIMIT,
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

    async _init_websocket() {
        if (this.listenKey === undefined) {
            await this.get_listenKey();
        }

        this.ws = new WS(apiconfig.privateWebsocketUrl + this.listenKey + "?listenKey=" + this.listenKey);

        this.ws.on("open", (evt) => {
            console.log("private open", JSON.stringify(evt));
            logger.info(`${this.name} private WS is CONNECTED.`);

            this.ws_connected_ts = Date.now();

            if (this.ws_keep_alive_interval) {
                clearInterval(this.ws_keep_alive_interval);
                this.ws_keep_alive_interval = undefined;
            }
            this.ws_keep_alive_interval = setInterval(() => {
                this.ws.ping(() => { });
                this.ws.pong(() => { });

                if (Date.now() - this.ws_connected_ts > 23 * 60 * 60 * 1000) {
                    this._init_websocket();
                }
            }, 30000);

            // 2秒后订阅频道
            setTimeout(() => {
                const sub_id = +randomID(6, '0');
                const sub_streams = this.cfg["symbols"].map((symbol) => { return `${symbol.toLowerCase()}@aggTrade` });
                this._send_ws_message({ method: "SUBSCRIBE", params: sub_streams, id: sub_id });
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

            if (jdata["e"] === "ORDER_TRADE_UPDATE") {
                // order_update更新
                let order_update = this._format_order_update(jdata);
                this.intercom.emit("ORDER_UPDATE", order_update);
            } else if (jdata["e"] ===  "aggTrade") {
                // trade价格更新
                let market_data = this._format_market_data(jdata);
                this.intercom.emit("MARKET_DATA", market_data);
            } else if (jdata["e"] === "ACCOUNT_UPDATE") {
                // let account_update = this._format_market_data(jdata);
                let account_update = jdata;
                this.intercom.emit("ACCOUNT_UPDATE", account_update);
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

        console.log(this.listenKey);
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
                direction: (jdata["o"]["s"] === "SELL") ? DIRECTION.SELL : DIRECTION.BUY,
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
        return order_update;
    }

    _format_market_data(jdata) {
        let market_data;
        switch (jdata["e"]) {
            case "aggTrade":
                let updated_trades = [
                    [
                        String(jdata["f"]),
                        jdata["T"],
                        parseFloat(jdata["p"]),
                        (jdata["m"] ? TRADE_SIDE.SELL : TRADE_SIDE.BUY),
                        parseFloat(jdata["q"])
                    ]
                ];
                market_data = {
                    exchange: "BinanceU",
                    contract_type: "perp",
                    symbol: this._get_external_symbol(jdata["s"]),
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

    _get_external_symbol(symbol) {
        let extSymbol = utils._util_get_key_by_value(apiconfig.symbolMap, symbol);
        return extSymbol;
    }

    on_order_update(order_update) {
        console.log("ON_ORDER_UPDATE", JSON.stringify(order_update));
    }

    on_market_data_ready(market_data) {
        console.log("MARKET_DATA", JSON.stringify(market_data));
    }

    on_response(response) {
        console.log("RESPONSE", JSON.stringify(response));
        return;
    }

    on_account_update(account_update) {
        console.log("ACCOUNT_UPDATE", JSON.stringify(account_update));
        return;
    }

    async send_order(order, ref_id = this.alias + randomID(27)) {
        logger.debug(`Emitting send order request from ${this.name}|${this.alias}|${order["symbol"]}|${order["label"]}|${order["client_order_id"]}`);

        // 这里可以放一些下单信息的检查和更新
        if (order["ref_id"] === undefined) order["ref_id"] = ref_id;
        let response = await this._send_order_via_rest(order);

        this.intercom.emit("REQUEST_RESPONSE", response);
    }

    // async _send_order_via_rest(symbol, contract_type, direction, price, quantity, order_type, account_id, account_type, post_only, order_id, client_order_id) {
    async _send_order_via_rest(order) {

        let ref_id = order["ref_id"];
        let symbol = order["symbol"];
        let contract_type = order["contract_type"];
        let direction = order["direction"];
        let price = order["price"];
        let quantity = order["quantity"];
        let order_type = order["order_type"];
        let account_id = order["account_id"];
        let client_order_id = order["client_order_id"];

        let exg_symbol = apiconfig.symbolMap[symbol].toUpperCase();
        let exg_direction = direction.toUpperCase();
        let exg_order_type = apiconfig.orderTypeMap[order_type];

        price = Math.round(price * apiconfig.pricePrecision[symbol]) / apiconfig.pricePrecision[symbol];
        let absAmount = Math.abs(quantity);

        let params;
        if (order_type === "market") {
            // 市价单走这里
            params = this._get_rest_options(apiconfig.restUrlPlaceOrder, {
                symbol: exg_symbol,
                side: exg_direction,
                type: exg_order_type,
                quantity: absAmount,
                newOrderRespType: "FULL",
                newClientOrderId: client_order_id,
                timestamp: Date.now(),
            }, account_id);
        } else {
            // 限价单走这里
            params = this._get_rest_options(apiconfig.restUrlPlaceOrder, {
                symbol: exg_symbol,
                side: exg_direction,
                type: exg_order_type,
                quantity: absAmount,
                timeInForce: "GTC",
                price: String(price),
                newOrderRespType: "FULL",
                newClientOrderId: client_order_id,
                timestamp: Date.now(),
            }, account_id);
        }

        let options = {
            url: params["url"] + params["postbody"],
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                "X-MBX-APIKEY": this.apiKey
            }
        }

        let cxl_resp;
        try {
            let body = await rp.post(options);

            if (typeof body === "string") {
                body = JSON.parse(body);
            }

            if (body.orderId) {
                let metadata = {
                    result: true,
                    account_id: account_id,
                    order_id: body["orderId"],
                    client_order_id: body["clientOrderId"],
                    timestamp: body["updateTime"]
                }
                cxl_resp = {
                    exchange: this.name,
                    symbol: symbol,
                    contract_type: contract_type,
                    event: ORDER_ACTIONS.SEND,
                    metadata: metadata,
                    timestamp: utils._util_get_human_readable_timestamp()
                };
            } else {
                cxl_resp = {
                    exchange: EXCHANGE.BINANCEU,
                    symbol: symbol,
                    contract_type: contract_type,
                    event: ORDER_ACTIONS.SEND,
                    metadata: {
                        account_id: account_id,
                        result: false,
                        order_id: 0,
                        error_code: 999999,
                        error_code_msg: body["err-msg"]
                    },
                    timestamp: utils._util_get_human_readable_timestamp()
                };
            }
        } catch (ex) {
            logger.error(ex.stack);
            cxl_resp = {
                exchange: EXCHANGE.BINANCEU,
                symbol: symbol,
                contract_type: contract_type,
                event: ORDER_ACTIONS.SEND,
                metadata: {
                    account_id: account_id,
                    result: false,
                    order_id: 0,
                    error_code: 999999,
                    error_code_msg: ex.toString()
                },
                timestamp: utils._util_get_human_readable_timestamp()
            };
        }

        let response = {
            ref_id: ref_id,
            action: ORDER_ACTIONS.SEND,
            strategy: this.name,
            metadata: cxl_resp,
            request: order
        }

        return response;
    }

    async cancel_order(order, ref_id = this.alias + randomID(27)) {
        logger.debug(`Emitting cancel order request from ${this.name}|${this.alias}|${order["symbol"]}|${order["label"]}|${order["client_order_id"]}`);

        // 这里可以放一些下单信息的检查和更新
        if (order["ref_id"] === undefined) order["ref_id"] = ref_id;
        let response = await this._cancel_order_via_rest(order);

        this.intercom.emit("REQUEST_RESPONSE", response);
    }

    async _cancel_order_via_rest(order) {

        let ref_id = order["ref_id"];
        let symbol = order["symbol"];
        let contract_type = order["contract_type"];
        let order_id = order["order_id"];
        let client_order_id = order["client_order_id"];
        let account_id = order["account_id"];

        let restUrlCancelOrder = apiconfig.restUrlCancelOrder;

        let params;
        let cxl_resp;
        if (order_id) {
            // 优先使用order_id进行撤单
            params = this._get_rest_options(restUrlCancelOrder, {
                symbol: apiconfig.symbolMap[symbol].toUpperCase(),
                orderId: order_id,
                timestamp: Date.now(),
            }, account_id);
        } else {
            params = this._get_rest_options(restUrlCancelOrder, {
                symbol: apiconfig.symbolMap[symbol].toUpperCase(),
                origClientOrderId: client_order_id,
                timestamp: Date.now(),
            }, account_id);
        }

        var options = {
            url: params["url"] + params["postbody"],
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                "X-MBX-APIKEY": this.apiKey
            }
        };

        try {
            let body = await rp.delete(options);
            //body, e.g:{ symbol: 'BNBBTC',origClientOrderId: 'Q6KYAotfs3rC4Sh99vBVAv',orderId: 55949780,clientOrderId: 'TNJyVOwfgjJCglNldbogbG' }
            body = JSON.parse(body);
            if (typeof body !== "undefined" && body["orderId"]) {
                body["result"] = true;
                body["status"] = ORDER_STATUS.CANCELLED;
            } else {
                body["result"] = false;
                body["status"] = "cancel error";
            }

            let metadata = {
                result: true,
                account_id: account_id,
                order_id: body["orderId"],
                client_order_id: body["clientOrderId"],
                timestamp: body["updateTime"]
            }
            cxl_resp = {
                exchange: EXCHANGE.BINANCEU,
                symbol: symbol,
                contract_type: contract_type,
                event: ORDER_ACTIONS.CANCEL,
                metadata: metadata,
                timestamp: utils._util_get_human_readable_timestamp()
            };
        } catch (ex) {
            logger.error(ex.stack);
            cxl_resp = {
                exchange: EXCHANGE.BINANCEU,
                symbol: symbol,
                contract_type: contract_type,
                event: ORDER_ACTIONS.CANCEL,
                metadata: {
                    account_id: account_id,
                    result: false,
                    error_code: 999999,
                    error_code_msg: ex.toString()
                },
                timestamp: utils._util_get_human_readable_timestamp()
            };
        }

        let response = {
            ref_id: ref_id,
            action: ORDER_ACTIONS.CANCEL,
            strategy: this.name,
            metadata: cxl_resp,
            request: order
        }

        return response;
    }

    async inspect_order(order, ref_id = this.alias + randomID(27)) {
        logger.debug(`Emitting inspect order request from ${this.name}|${this.alias}|${order["symbol"]}|${order["label"]}|${order["client_order_id"]}`);

        if (order["ref_id"] === undefined) order["ref_id"] = ref_id;
        let response = await this._inspect_order_via_rest(order);

        this.intercom.emit("REQUEST_RESPONSE", response);
    }

    async _inspect_order_via_rest(order) {
        let ref_id = order["ref_id"];
        let symbol = order["symbol"];
        let contract_type = order["contract_type"];
        let order_id = order["order_id"];
        let client_order_id = order["client_order_id"];
        let account_id = order["account_id"];

        let restUrlGetOrder = apiconfig.restUrlGetOrder;

        let params;
        let cxl_resp;
        if (order_id) {    
            params = this._get_rest_options(restUrlGetOrder, {
                symbol: apiconfig.symbolMap[symbol].toUpperCase(),
                orderId: order_id,
                timestamp: Date.now(),
            }, account_id); 
        } else {
            params = this._get_rest_options(restUrlGetOrder, {
                symbol: apiconfig.symbolMap[symbol].toUpperCase(),
                origClientOrderId: client_order_id,
                timestamp: Date.now(),
            }, account_id);
        }
    
        var options = {
            url: params["url"] + params["postbody"],
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                "X-MBX-APIKEY": this.apiKey
            }
        };

        try {
            let body = await rp.get(options);
            body = JSON.parse(body);

            if (body.orderId === order_id) {
                body["result"] = true;
                body.order_id = order_id;
                body.account_id = account_id;
                // + 符号可以把变量变成数字型
                let order_info = {
                    original_amount: +body["origQty"],
                    avg_executed_price: +body["avgPrice"],
                    filled: +body["executedQty"],
                    status: this._convert_to_standard_order_status(body["status"])
                };
                cxl_resp = {
                    exchange: this.name,
                    symbol: symbol,
                    contract_type: contract_type,
                    event: ORDER_ACTIONS.INSPECT,
                    metadata: body,
                    timestamp: utils._util_get_human_readable_timestamp(),
                    order_info: order_info
                };
            } else {
                let order_info = {
                    original_amount: 0,
                    filled: 0,
                    avg_executed_price: 0,
                    status: 'unknown'
                };
                cxl_resp = {
                    exchange: this.name,
                    symbol: symbol,
                    contract_type: contract_type,
                    event: ORDER_ACTIONS.INSPECT,
                    metadata: {
                        account_id: account_id,
                        result: false,
                        error_code: 999999,
                        error_code_msg: body["err-msg"]
                    },
                    timestamp: utils._util_get_human_readable_timestamp(),
                    order_info: order_info
                };
            }
        } catch (ex) {
            logger.error(ex.stack);
            let order_info = {
                original_amount: 0,
                filled: 0,
                avg_executed_price: 0,
                status: 'unknown'
            };
            cxl_resp = {
                exchange: this.name,
                symbol: symbol,
                contract_type: contract_type,
                event: ORDER_ACTIONS.INSPECT,
                metadata: {
                    account_id: account_id,
                    result: false,
                    error_code: 999999,
                    error_code_msg: ex.toString(),
                    order_id: order_id
                },
                timestamp: utils._util_get_human_readable_timestamp(),
                order_info: order_info
            };
        }

        let response = {
            ref_id: ref_id,
            action: ORDER_ACTIONS.INSPECT,
            strategy: this.name,
            metadata: cxl_resp,
            request: order
        }
    
        return response;
    }

    async query_orders(order, ref_id = this.alias + randomID(27)) {
        // 只返回active orders
        logger.debug(`Emitting query orders request from ${this.name}|${this.alias}`);

        if (order["ref_id"] === undefined) order["ref_id"] = ref_id;
        let response = await this._query_order_via_rest(order);

        this.intercom.emit("REQUEST_RESPONSE", response);
    }

    async _query_order_via_rest(order) {
        let ref_id = order["ref_id"];
        let symbol = order["symbol"];
        let contract_type = order["contract_type"];
        let account_id = order["account_id"];

        let restUrlQueryOrders = apiconfig.restUrlQueryOrders;
        
        let params = this._get_rest_options(restUrlQueryOrders, {
            symbol: apiconfig.symbolMap[symbol].toUpperCase(),
            timestamp: Date.now(),
        }, account_id); 

        var options = {
            url: params["url"] + params["postbody"],
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                "X-MBX-APIKEY": this.apiKey
            }
        };

        let cxl_resp;
        try {
            let body = await rp.get(options);
            body = JSON.parse(body);

            let active_orders = body.filter((order) => order.status === ORDER_STATUS.SUBMITTED.toUpperCase());
            let formatted_active_orders = [];

            for (let i of active_orders) {
                formatted_active_orders.push({
                    order_id: i["orderId"],
                    client_order_id: i['clientOrderId'],
                    original_amount: +i["origQty"],
                    avg_executed_price: +i["avgPrice"],
                    filled: +i["executedQty"],
                    status: this._convert_to_standard_order_status(i["status"], +i["executedQty"], +i["origQty"]),
                    direction: i["side"].toLowerCase(),
                    price: +i["price"],
                    contract_type: contract_type,
                    create_time: utils._util_get_human_readable_timestamp(i["time"]),
                    last_updated_time: utils._util_get_human_readable_timestamp(i['updateTime'])
                });
            }

            cxl_resp = {
                exchange: this.name,
                symbol: symbol,
                contract_type: contract_type,
                event: REQUEST_ACTIONS.QUERY_ORDERS,
                metadata: {
                    result: true,
                    account_id: account_id,
                    api_rate_limit: this.api_rate_limit,
                    orders: formatted_active_orders,
                    timestamp: utils._util_get_human_readable_timestamp()
                },
                timestamp: utils._util_get_human_readable_timestamp()
            };
        } catch (e) {
            cxl_resp = {
                exchange: EXCHANGE.BINANCEU,
                symbol: symbol,
                contract_type: contract_type,
                event: REQUEST_ACTIONS.QUERY_ORDERS,
                metadata: {
                    result: false,
                    account_id: account_id,
                    api_rate_limit: this.api_rate_limit,
                    error_code: e.code || e.statusCode || 999999,
                    error_code_msg: e.msg || e.message,
                    error_stack: e.stack
                },
                timestamp: utils._util_get_human_readable_timestamp()
            };
        }

        let response = {
            ref_id: ref_id,
            action: REQUEST_ACTIONS.QUERY_ORDERS,
            strategy: this.name,
            metadata: cxl_resp,
            request: order
        }
    
        return response;
    }
}

var revTrendStrategy = new RevTrendStrategy("RevTrend", "R01");
revTrendStrategy.start();