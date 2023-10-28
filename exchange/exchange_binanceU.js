require("../config/typedef.js");
require("../config/stratdef.js");
const WS = require("ws");
const randomID = require("random-id");
const rp = require("request-promise-native");
const querystring = require("querystring");

const utils = require("../utils/util_func");
const ExchangeBase = require("./exchange_base.js");
const logger = require("../module/logger.js");
const Intercom = require("../module/intercom");
const apiconfig = require("../config/apiconfig.json");
const token = require("../config/token.json");

class ExchangeBinanceU extends ExchangeBase {
    constructor(name, intercom) {
        super(name, intercom);
        
        this.account_ids = Object.keys(token).filter(x => x.split("_")[1] === "binance");
        this.ws_connections = {};
        this.listenKeys = {};
    }

    async _init_websocket() {
        for (let account_id of this.account_ids) this._init_individual_websocket(account_id);
    }
    
    async _init_individual_websocket(account_id) {
        this.ws_connections[account_id] = {};
        if (this.listenKeys[account_id] === undefined) {
            await this.get_listenKey(account_id);
        }

        this.ws_connections[account_id]["ws"] = new WS(apiconfig.BinanceU.privateWebsocketUrl + this.listenKey + "?listenKey=" + this.listenKey);

        this.ws_connections[account_id]["ws"].on("open", (evt) => {
            logger.info(`${this.name}|${account_id}: WS is CONNECTED.`);

            this.ws_connections[account_id]["reconnecting"] = false;
            this.ws_connections[account_id]["connected"] = true;
            this.ws_connections[account_id]["ws_connected_ts"] = Date.now();

            if (this.ws_connections[account_id]["ws_keep_alive_interval"]) {
                clearInterval(this.ws_connections[account_id]["ws_keep_alive_interval"]);
                this.ws_connections[account_id]["ws_keep_alive_interval"] = undefined;
            }
            this.ws_connections[account_id]["ws_keep_alive_interval"] = setInterval(() => {
                this.ws_connections[account_id]["ws"].ping(() => { });
                this.ws_connections[account_id]["ws"].pong(() => { });

                if (Date.now() - this.ws_connections[account_id]["ws_connected_ts"] > 23 * 60 * 60 * 1000) {
                    logger.warn(`${this.name}|${account_id}: reconnect this WS...`)
                    this._reconnect_ws(account_id);
                }
            }, 30000);

            setInterval(() => {
                this.extend_listenKey(account_id);
            }, 1000 * 60 * 50);

            // 100毫秒后订阅频道
            if(account_id === "th_binance_cny_master") {
                setTimeout(() => {
                    const sub_id = +randomID(6, '0');
                    const sub_streams = this._format_subscription_list();
                    this._send_ws_message(this.ws_connections[account_id]["ws"], { method: "SUBSCRIBE", params: sub_streams, id: sub_id });
                }, 100);
            }
        });

        this.ws_connections[account_id]["ws"].on("close", (code, reason) => {
            logger.warn(`${this.name}|${account_id}:: websocket is DISCONNECTED. reason: ${reason} code: ${code}`);
            // logger.error(`${this.name} WS is DISCONNECTED.`);

            if (code === 1006) {
                // 很有可能是VPN连接不稳定
                this._reconnect_ws(account_id);
            }
        });

        this.ws_connections[account_id]["ws"].on("message", (evt) => {
            let jdata;
            try {
                jdata = JSON.parse(evt);
            } catch (ex) {
                logger.error(ex);
                return;
            }

            // if (jdata["e"] !== "aggTrade") {
            //     logger.info(`${this.name}|${account_id}: ${JSON.stringify(jdata)}`);
            // }

            // logger.info(`${this.name}|${account_id}: ${JSON.stringify(jdata)}`);

            if (jdata["e"] === "ORDER_TRADE_UPDATE") {
                // order_update更新
                let order_update = this._format_order_update(jdata, account_id);
                this.intercom.emit("ORDER_UPDATE", order_update, INTERCOM_SCOPE.FEED);
            } else if (["aggTrade", "bookTicker"].includes(jdata["e"])) {
                // trade价格更新
                let market_data = this._format_market_data(jdata);
                this.intercom.emit("MARKET_DATA", market_data, INTERCOM_SCOPE.FEED);
            } else if (jdata["e"] === "ACCOUNT_UPDATE") {
                let account_update = jdata;
                this.intercom.emit("ACCOUNT_UPDATE", account_update, INTERCOM_SCOPE.FEED);
            }
        });

        this.ws_connections[account_id]["ws"].on("error", (evt) => {
            logger.error(`${this.name}|${account_id}: websocket on error: ` + evt);
        });

        this.ws_connections[account_id]["ws"].on("ping", (evt) => {
            logger.info(`${this.name}|${account_id}: websocket on ping, response with pong.`);
            this.ws_connections[account_id]["ws"].pong();
        });
    }

    _reconnect_ws(account_id) {
        if (this.ws_connections[account_id]["reconnecting"]) {
            logger.info(`${this.name}|${account_id}: websocket is already reconnecting.`);
            return;
        }
        this.ws_connections[account_id]["reconnecting"] = true;

        try {
            if (this.ws_connections[account_id]["connected"]) {
                logger.info(`${this.name}|${account_id}: websocket was closed by _reconnect_ws.`);
                this.ws_connections[account_id]["ws"].close();
            }
        } catch (e) {
            logger.error(`${this.name}|${account_id}: error ${e.stack}`);
        }

        setTimeout(() => {
            logger.info(`${this.name}|${account_id}: websocket is reconnecting...`);
            this._init_individual_websocket(account_id);
        }, 100);
    }
  
    async get_listenKey(account_id) {
        let url = apiconfig.BinanceU.restUrl + apiconfig.BinanceU.restUrlListenKey;
        let params = this._get_rest_options(url, {}, account_id);

        var options = {
            url: params["url"] + params["postbody"],
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                "X-MBX-APIKEY": token[account_id].apiKey
            }
        };

        let body = await rp.post(options);
        this.listenKey = JSON.parse(body)["listenKey"];

        logger.info(`${this.name}|${account_id}: listen key received: ${this.listenKey}`);
    }

    async extend_listenKey(account_id) {
        let url = apiconfig.BinanceU.restUrl + apiconfig.BinanceU.restUrlListenKey;
        let params = this._get_rest_options(url, {}, account_id);

        var options = {
            url: params["url"] + params["postbody"],
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                "X-MBX-APIKEY": token[account_id].apiKey
            }
        };

        try {
            let body = await rp.put(options);
            logger.info(`${this.name}|${account_id}: listen key extended: ${JSON.stringify(body)}`);
        } catch (err) {
            logger.error(`${this.name}|${account_id}: listen key extension error: ${JSON.stringify(err)}`);
        }

    }

    _format_subscription_item(subscription_item) {
        // let exchange = subscription_item.split("|")[0];
        let symbol = subscription_item.split("|")[1];
        // let contract_type = subscription_item.split("|")[2];
        let theme = subscription_item.split("|")[3];

        switch(theme){
            case MARKET_DATA.TRADE:
                return `${symbol.toLowerCase()}@aggTrade`;
            case MARKET_DATA.BESTQUOTE:
                return `${symbol.toLowerCase()}@bookTicker`;
        }
    }

    _format_order_update(jdata, account_id) {
        let order_update = {
            exchange: EXCHANGE.BINANCEU,
            symbol: jdata["o"]["s"],
            contract_type: "perp",
            metadata: {
                result: true,
                account_id: account_id,
                order_id: jdata["o"]["i"],
                client_order_id: jdata["o"]["c"],
                direction: (jdata["o"]["S"] === "SELL") ? DIRECTION.SELL : DIRECTION.BUY,
                timestamp: utils.get_human_readable_timestamp(jdata["o"]["T"]),
                fee: jdata["o"]["n"] ? parseFloat(jdata["o"]["n"]) : undefined,
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
        let metadata;
        switch (jdata["e"]) {
            case "aggTrade":
                metadata = [
                    [
                        String(jdata["a"]),   // aggregated trade id
                        utils.get_human_readable_timestamp(jdata["T"]),
                        parseFloat(jdata["p"]),
                        (jdata["m"] ? TRADE_SIDE.SELL : TRADE_SIDE.BUY),
                        parseFloat(jdata["q"])
                    ]
                ];
                market_data = {
                    exchange: EXCHANGE.BINANCEU,
                    symbol: jdata["s"],
                    contract_type: "perp",
                    data_type: MARKET_DATA.TRADE,
                    metadata: metadata,
                    timestamp: utils._util_get_human_readable_timestamp()
                };
                return market_data;
            case "bookTicker":
                metadata = [
                    [
                        String(jdata["u"]),         // updated id
                        utils.get_human_readable_timestamp(jdata["T"]),    // timestamp
                        parseFloat(jdata["a"]),     // best_ask
                        parseFloat(jdata["A"]),     // best_ask_quantity
                        parseFloat(jdata["b"]),     // best_bid
                        parseFloat(jdata["B"])      // best_bid_quantity
                    ]
                ];
                market_data = {
                    exchange: EXCHANGE.BINANCEU,
                    symbol: jdata["s"],
                    contract_type: CONTRACT_TYPE.PERP,
                    data_type: MARKET_DATA.BESTQUOTE,
                    metadata: metadata,
                    timestamp: utils._util_get_human_readable_timestamp()
                };
                return market_data;
        }
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
            case "modified":
                return ORDER_STATUS.MODIFIED; 
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
            case "AMENDMENT":
            case "AMENDMENT - Order Modified":
                return ORDER_UPDATE_TYPE.MODIFIED;
        }
    }

    _get_rest_options(url, params, account_id = "test") {
        let apiSecret = token[account_id].apiSecret;
        let presign = querystring.stringify(params);
        let signature = utils.HMAC("sha256", apiSecret, presign);

        return {
            url: url + "?",
            postbody: presign + "&signature=" + signature
        };
    }

    async _send_order_via_rest(order) {

        let ref_id = order["ref_id"];
        let symbol = order["symbol"];
        let contract_type = order["contract_type"];
        let direction = order["direction"];
        let price = order["price"];
        let stop_price = order["stop_price"];
        let quantity = order["quantity"];
        let order_type = order["order_type"];
        let account_id = order["account_id"];
        let client_order_id = order["client_order_id"];

        let exg_symbol = symbol;
        let exg_direction = direction.toUpperCase();
        let exg_order_type = apiconfig.BinanceU.orderTypeMap[order_type];
        let absAmount = Math.abs(quantity);

        let params;
        let url = apiconfig.BinanceU.restUrl + apiconfig.BinanceU.restUrlPlaceOrder;
        if (order_type === ORDER_TYPE.MARKET) {
            // 市价单走这里
            params = this._get_rest_options(url, {
                symbol: exg_symbol,
                side: exg_direction,
                type: exg_order_type,
                quantity: absAmount,
                newOrderRespType: "FULL",
                newClientOrderId: client_order_id,
                timestamp: Date.now(),
            }, account_id);
        } else if (order_type === ORDER_TYPE.LIMIT) {
            // 限价单走这里
            params = this._get_rest_options(url, {
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
        } else if (order_type === ORDER_TYPE.POST_ONLY) {
            // post_only单走这里
            params = this._get_rest_options(url, {
                symbol: exg_symbol,
                side: exg_direction,
                type: exg_order_type,
                quantity: absAmount,
                timeInForce: "GTX ",
                price: String(price),
                newOrderRespType: "FULL",
                newClientOrderId: client_order_id,
                timestamp: Date.now(),
            }, account_id);
        } else if (order_type === ORDER_TYPE.STOP_MARKET) {
            params = this._get_rest_options(url, {
                symbol: exg_symbol,
                side: exg_direction,
                type: exg_order_type,
                quantity: absAmount,
                stopPrice: String(stop_price),
                newOrderRespType: "FULL",
                newClientOrderId: client_order_id,
                timestamp: Date.now(),
            }, account_id);
        }

        let options = {
            url: params["url"] + params["postbody"],
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                "X-MBX-APIKEY": token[account_id].apiKey
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
                    exchange: EXCHANGE.BINANCEU,
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
                        error_code: 888888,
                        error_code_msg: body["err-msg"]
                    },
                    timestamp: utils._util_get_human_readable_timestamp()
                };
            }
        } catch (ex) {
            logger.error(ex.stack);
            let error =  ex.error ? JSON.parse(ex.error): undefined;
            cxl_resp = {
                exchange: EXCHANGE.BINANCEU,
                symbol: symbol,
                contract_type: contract_type,
                event: ORDER_ACTIONS.SEND,
                metadata: {
                    account_id: account_id,
                    result: false,
                    order_id: 0,
                    error_code: error.code || 999999,
                    error_code_msg: error.msg || ex.toString()
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

    async _cancel_order_via_rest(order) {

        let ref_id = order["ref_id"];
        let symbol = order["symbol"];
        let contract_type = order["contract_type"];
        let order_id = order["order_id"];
        let client_order_id = order["client_order_id"];
        let account_id = order["account_id"];

        let params;
        let cxl_resp;
        let url = apiconfig.BinanceU.restUrl + apiconfig.BinanceU.restUrlCancelOrder;
        if (order_id) {
            // 优先使用order_id进行撤单
            params = this._get_rest_options(url, {
                symbol: symbol,
                orderId: order_id,
                timestamp: Date.now(),
            }, account_id);
        } else {
            params = this._get_rest_options(url, {
                symbol: symbol,
                origClientOrderId: client_order_id,
                timestamp: Date.now(),
            }, account_id);
        }

        var options = {
            url: params["url"] + params["postbody"],
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                "X-MBX-APIKEY": token[account_id].apiKey
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
            let error =  ex.error ? JSON.parse(ex.error): undefined;
            cxl_resp = {
                exchange: EXCHANGE.BINANCEU,
                symbol: symbol,
                contract_type: contract_type,
                event: ORDER_ACTIONS.CANCEL,
                metadata: {
                    account_id: account_id,
                    result: false,
                    error_code: error.code || 999999,
                    error_code_msg: error.msg || ex.toString()
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

    async _modify_order_via_rest(order) {

        let ref_id = order["ref_id"];
        let symbol = order["symbol"];
        let contract_type = order["contract_type"];
        let price = order["price"];
        let quantity = order["quantity"];
        let direction = order["direction"];
        let order_id = order["order_id"];
        let client_order_id = order["client_order_id"];
        let account_id = order["account_id"];

        let params;
        let cxl_resp;
        let url = apiconfig.BinanceU.restUrl + apiconfig.BinanceU.restUrlModifyOrder;
        if (order_id) {
            // 优先使用order_id进行撤单
            params = this._get_rest_options(url, {
                symbol: symbol,
                orderId: order_id,
                side: direction.toUpperCase(),
                quantity: quantity,
                price: price,
                timestamp: Date.now(),
            }, account_id);
        } else {
            params = this._get_rest_options(url, {
                symbol: symbol,
                origClientOrderId: client_order_id,
                side: direction.toUpperCase(),
                quantity: quantity,
                price: price,
                timestamp: Date.now(),
            }, account_id);
        }

        var options = {
            url: params["url"] + params["postbody"],
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                "X-MBX-APIKEY": token[account_id].apiKey
            }
        };

        try {
            let body = await rp.put(options);
            //body, e.g:{ symbol: 'BNBBTC',origClientOrderId: 'Q6KYAotfs3rC4Sh99vBVAv',orderId: 55949780,clientOrderId: 'TNJyVOwfgjJCglNldbogbG' }
            body = JSON.parse(body);
            console.log(JSON.stringify(body));
            if (typeof body !== "undefined" && body["orderId"]) {
                body["result"] = true;
                // BinanceU里面返回的status是NEW
            } else {
                body["result"] = false;
                body["status"] = "modify error";
            }

            let metadata = {
                result: true,
                account_id: account_id,
                order_id: body["orderId"],
                client_order_id: body["clientOrderId"],
                timestamp: body["updateTime"]
            };
            let order_info = {
                original_amount: +body["origQty"],
                avg_executed_price: +body["avgPrice"],
                filled: +body["executedQty"],
                status: this._convert_to_standard_order_status(body["status"])
            };
            cxl_resp = {
                exchange: EXCHANGE.BINANCEU,
                symbol: symbol,
                contract_type: contract_type,
                event: ORDER_ACTIONS.MODIFY,
                metadata: metadata,
                order_info: order_info,
                timestamp: utils._util_get_human_readable_timestamp()
            };
        } catch (ex) {
            logger.error(ex.stack);
            let error =  ex.error ? JSON.parse(ex.error): undefined;
            cxl_resp = {
                exchange: EXCHANGE.BINANCEU,
                symbol: symbol,
                contract_type: contract_type,
                event: ORDER_ACTIONS.MODIFY,
                metadata: {
                    account_id: account_id,
                    result: false,
                    error_code: error.code || 999999,
                    error_code_msg: error.msg || ex.toString()
                },
                order_info: {
                    original_amount: 0,
                    filled: 0,
                    avg_executed_price: 0,
                    status: 'unknown'
                },
                timestamp: utils._util_get_human_readable_timestamp()
            };
        }

        let response = {
            ref_id: ref_id,
            action: ORDER_ACTIONS.MODIFY,
            strategy: this.name,
            metadata: cxl_resp,
            request: order
        }

        return response;
    }

    async _inspect_order_via_rest(order) {
        let ref_id = order["ref_id"];
        let symbol = order["symbol"];
        let contract_type = order["contract_type"];
        let order_id = order["order_id"];
        let client_order_id = order["client_order_id"];
        let account_id = order["account_id"];

        let params;
        let cxl_resp;
        let url = apiconfig.BinanceU.restUrl + apiconfig.BinanceU.restUrlGetOrder;
        if (order_id) {    
            params = this._get_rest_options(url, {
                symbol: symbol,
                orderId: order_id,
                timestamp: Date.now(),
            }, account_id); 
        } else {
            params = this._get_rest_options(url, {
                symbol: symbol,
                origClientOrderId: client_order_id,
                timestamp: Date.now(),
            }, account_id);
        }
    
        var options = {
            url: params["url"] + params["postbody"],
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                "X-MBX-APIKEY": token[account_id].apiKey
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
                    exchange: EXCHANGE.BINANCEU,
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
                    exchange: EXCHANGE.BINANCEU,
                    symbol: symbol,
                    contract_type: contract_type,
                    event: ORDER_ACTIONS.INSPECT,
                    metadata: {
                        account_id: account_id,
                        result: false,
                        error_code: 888888,
                        error_code_msg: body["err-msg"]
                    },
                    timestamp: utils._util_get_human_readable_timestamp(),
                    order_info: order_info
                };
            }
        } catch (ex) {
            logger.error(ex.stack);
            let error =  ex.error ? JSON.parse(ex.error): undefined;
            let order_info = {
                original_amount: 0,
                filled: 0,
                avg_executed_price: 0,
                status: 'unknown'
            };
            cxl_resp = {
                exchange: EXCHANGE.BINANCEU,
                symbol: symbol,
                contract_type: contract_type,
                event: ORDER_ACTIONS.INSPECT,
                metadata: {
                    account_id: account_id,
                    result: false,
                    error_code: error.code || 999999,
                    error_code_msg: error.msg || ex.toString(),
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

    async _query_order_via_rest(order) {
        /**
         * GET /fapi/v1/allOrders (HMAC SHA256)
         * 以下订单不会被查询到：
         * 1. 下单时间超过3天 + cancelled or expired + 没有成交量；或者
         * 2. 下单时间超过90天
         * 其他所有单都会被查询到
         */
        // 
        let ref_id = order["ref_id"];
        let symbol = order["symbol"];
        let contract_type = order["contract_type"];
        let account_id = order["account_id"];

        let url = apiconfig.BinanceU.restUrl + apiconfig.BinanceU.restUrlQueryOrders;
        let params = this._get_rest_options(url, {
            symbol: symbol,
            timestamp: Date.now(),
        }, account_id); 

        var options = {
            url: params["url"] + params["postbody"],
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                "X-MBX-APIKEY": token[account_id].apiKey
            }
        };

        let cxl_resp;
        try {
            let body = await rp.get(options);
            body = JSON.parse(body);

            // BinanceU中订单只有5中状态：NEW, PARTIALLY_FILLED, FILLED, CANCELLED, EXPIRED
            let active_orders = body.filter((order) => (["NEW", "PARTIALLY_FILLED"].includes(order.status)));
            let formatted_active_orders = [];

            for (let i of active_orders) {
                formatted_active_orders.push({
                    symbol: i["symbol"],
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
                exchange: EXCHANGE.BINANCEU,
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

    async _query_position_via_rest(query) {
        let ref_id = query["ref_id"];
        let symbol = query["symbol"];
        let contract_type = query["contract_type"];
        let account_id = query["account_id"];

        let url = apiconfig.BinanceU.restUrl + apiconfig.BinanceU.restUrlQueryPosition;
        let params = this._get_rest_options(url, {
            symbol: symbol,
            timestamp: Date.now(),
        }, account_id); 

        var options = {
            url: params["url"] + params["postbody"],
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                "X-MBX-APIKEY": token[account_id].apiKey
            }
        };

        let cxl_resp;
        try {
            let body = await rp.get(options);
            body = JSON.parse(body);

            let active_positions = body.filter((position) => parseFloat(position.positionAmt) !== 0);
            let formatted_active_positions = [];

            for (let i of active_positions) {
                formatted_active_positions.push({
                    symbol: i["symbol"],
                    position: +i['positionAmt'],
                    entryPrice: +i["entryPrice"],
                    markPrice: +i["markPrice"],
                    unRealizedProfit: +i["unRealizedProfit"],
                    last_updated_time: utils._util_get_human_readable_timestamp(i['updateTime'])
                });
            }

            cxl_resp = {
                exchange: EXCHANGE.BINANCEU,
                symbol: symbol,
                contract_type: contract_type,
                event: REQUEST_ACTIONS.QUERY_ORDERS,
                metadata: {
                    result: true,
                    account_id: account_id,
                    positions: formatted_active_positions,
                    timestamp: utils._util_get_human_readable_timestamp()
                },
                timestamp: utils._util_get_human_readable_timestamp()
            };
        } catch (e) {
            cxl_resp = {
                exchange: EXCHANGE.BINANCEU,
                symbol: symbol,
                contract_type: contract_type,
                event: REQUEST_ACTIONS.QUERY_POSITION,
                metadata: {
                    result: false,
                    account_id: account_id,
                    error_code: e.code || e.statusCode || 999999,
                    error_code_msg: e.msg || e.message,
                    error_stack: e.stack
                },
                timestamp: utils._util_get_human_readable_timestamp()
            };
        }

        let response = {
            ref_id: ref_id,
            action: REQUEST_ACTIONS.QUERY_POSITION,
            strategy: this.name,
            metadata: cxl_resp,
            request: query
        }
    
        return response;
    }

    async _query_account_via_rest(query) {
        let ref_id = query["ref_id"];
        let contract_type = query["contract_type"];
        let account_id = query["account_id"];

        let url = apiconfig.BinanceU.restUrl + apiconfig.BinanceU.restUrlQueryAccount;
        let params = this._get_rest_options(url, {
            timestamp: Date.now(),
        }, account_id); 

        var options = {
            url: params["url"] + params["postbody"],
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                "X-MBX-APIKEY": token[account_id].apiKey
            }
        };

        let cxl_resp;
        try {
            let body = await rp.get(options);
            body = JSON.parse(body);

            let assets_USDT = body["assets"].filter((asset) => asset.asset === "USDT")[0];
            let balance = {
                "wallet_balance_in_USD": +body["totalWalletBalance"],
                "unrealized_pnl_in_USD": +body["totalUnrealizedProfit"],
                "equity_in_USD": +body["totalMarginBalance"],
                "wallet_balance_in_USDT": +assets_USDT["walletBalance"],
                "unrealized_pnl_in_USDT": +assets_USDT["unrealizedProfit"],
                "equity_in_USDT": +assets_USDT["marginBalance"],
                "position_initial_margin_in_USDT": +assets_USDT["positionInitialMargin"],
                "open_order_initial_margin_in_USDT": +assets_USDT["openOrderInitialMargin"],
            }

            let active_positions = body["positions"].filter((position) => parseFloat(position.positionAmt) !== 0);
            let formatted_active_positions = [];

            for (let i of active_positions) {
                formatted_active_positions.push({
                    symbol: i["symbol"],
                    position: +i['positionAmt'],
                    entryPrice: +i["entryPrice"],
                    unRealizedProfit: +i["unrealizedProfit"],
                    positionInitialMargin: +i["positionInitialMargin"],
                    leverage: +i["leverage"],
                    last_updated_time: utils._util_get_human_readable_timestamp(i['updateTime'])
                });
            }

            cxl_resp = {
                exchange: EXCHANGE.BINANCEU,
                contract_type: contract_type,
                event: REQUEST_ACTIONS.QUERY_ACCOUNT,
                metadata: {
                    result: true,
                    account_id: account_id,
                    balance: balance,
                    positions: formatted_active_positions,
                    timestamp: utils._util_get_human_readable_timestamp()
                },
                timestamp: utils._util_get_human_readable_timestamp()
            };
        } catch (e) {
            cxl_resp = {
                exchange: EXCHANGE.BINANCEU,
                symbol: symbol,
                contract_type: contract_type,
                event: REQUEST_ACTIONS.QUERY_ACCOUNT,
                metadata: {
                    result: false,
                    account_id: account_id,
                    error_code: e.code || e.statusCode || 999999,
                    error_code_msg: e.msg || e.message,
                    error_stack: e.stack
                },
                timestamp: utils._util_get_human_readable_timestamp()
            };
        }

        let response = {
            ref_id: ref_id,
            action: REQUEST_ACTIONS.QUERY_ACCOUNT,
            strategy: this.name,
            metadata: cxl_resp,
            request: query
        }
    
        return response;
    }

    async _query_quantitative_rules_via_rest(query) {
        let ref_id = query["ref_id"];
        let symbol = query["symbol"];
        let contract_type = query["contract_type"];
        let account_id = query["account_id"];

        let url = apiconfig.BinanceU.restUrl + apiconfig.BinanceU.restUrlFuturesTradingQuantRule;
        let params = this._get_rest_options(url, {
            symbol: symbol,     // 可有可不有
            timestamp: Date.now(),
        }, account_id); 

        var options = {
            url: params["url"] + params["postbody"],
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                "X-MBX-APIKEY": token[account_id].apiKey
            }
        };

        let cxl_resp;
        try {
            let body = await rp.get(options);
            body = JSON.parse(body);

            cxl_resp = {
                exchange: EXCHANGE.BINANCEU,
                contract_type: contract_type,
                event: REQUEST_ACTIONS.QUERY_QUANTITATIVE_RULES,
                metadata: {
                    result: true,
                    account_id: account_id,
                    indicators: body.indicators,
                    timestamp: utils._util_get_human_readable_timestamp(body['updateTime'])
                },
                timestamp: utils._util_get_human_readable_timestamp()
            };
        } catch (e) {
            cxl_resp = {
                exchange: EXCHANGE.BINANCEU,
                symbol: symbol,
                contract_type: contract_type,
                event: REQUEST_ACTIONS.QUERY_QUANTITATIVE_RULES,
                metadata: {
                    result: false,
                    account_id: account_id,
                    error_code: e.code || e.statusCode || 999999,
                    error_code_msg: e.msg || e.message,
                    error_stack: e.stack
                },
                timestamp: utils._util_get_human_readable_timestamp()
            };
        }

        let response = {
            ref_id: ref_id,
            action: REQUEST_ACTIONS.QUERY_QUANTITATIVE_RULES,
            strategy: this.name,
            metadata: cxl_resp,
            request: query
        }
    
        return response;
    }
}

module.exports = ExchangeBinanceU;

// var intercom_config = [
//     INTERCOM_CONFIG[`LOCALHOST_FEED`],
//     INTERCOM_CONFIG[`LOCALHOST_STRATEGY`]
// ];
// let bn = new ExchangeBinanceU("BinanceU", new Intercom(intercom_config));
// bn.start();