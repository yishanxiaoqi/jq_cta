require("../config/typedef.js");
require("../config/stratdef.js");
const WS = require("ws");
const CryptoJS = require("crypto-js");
const randomID = require("random-id");
const rp = require("request-promise-native");

const utils = require("../utils/util_func.js");
const ExchangeBase = require("./exchange_base.js");
const logger = require("../module/logger.js");
const Intercom = require("../module/intercom.js");
const apiconfig = require("../config/apiconfig.json");
const token = require("../config/token.json");
const randomId = require("random-id");

class ExchangeOKX extends ExchangeBase {
    constructor(name, intercom) {
        super(name, intercom);
        
        this.account_ids = Object.keys(token).filter(x => x.split("_")[1] === "okx");
        this.conns = {};
        this.ws_trades = {};        // 用ref_id为key，order为value

        this.on_trade_handler = this.on_trade.bind(this);
    }

    _register_events() {
        // 监听策略端的订阅请求，目前为止都是启动时自动订阅
        this.intercom.on("MARKET_DATA_SUBSCRIPTION", this.on_market_data_subscription_handler, INTERCOM_SCOPE.STRATEY);

        // 监听策略端的交易请求，因为OKX可以通过OKX发单
        this.intercom.on("OKX_TRADE", this.on_trade_handler, INTERCOM_SCOPE.STRATEGY);
    }

    on_trade(order) {
        switch (order.action) {
            case ORDER_ACTIONS.SEND:
                this._send_order_via_ws(order);
                break;
            case ORDER_ACTIONS.CANCEL:
                this._cancel_order_via_ws(order);
                break;
            case ORDER_ACTIONS.MODIFY:
                this._modify_order_via_ws(order);
                break;
            default:
                logger.error(`No predefined order action during OKX_TRADE in ${this.name} for ${order.action}`);
        }
    }

    async _init_websocket() {
        let subscription_list = this._format_subscription_list();
        let need_public_url = subscription_list.some((item) => ["tickers"].includes(item.channel));
        let need_business_url = subscription_list.some((item) => ["trades-all"].includes(item.channel));

        let wsnames = ["private"];
        if (need_public_url) wsnames.push("public");
        if (need_business_url) wsnames.push("business");

        for (let wsname of wsnames) {
            this.conns[wsname] = {};
            this._init_individual_websocket(wsname, subscription_list);
        }
    }

    async _init_individual_websocket(wsname, subscription_list) {
        this.conns[wsname].ws = new WS(apiconfig.OKX[`${wsname}WebsocketUrl`]);

        this.conns[wsname].ws.on("open", (evt) => {
            logger.info(`${this.name}: ${wsname} ws is CONNECTED.`);

            this.conns[wsname]["ws_connected_ts"] = Date.now();

            if (this.conns[wsname].ws_keep_alive_interval) {
                clearInterval(this.conns[wsname].ws_keep_alive_interval);
                this.conns[wsname].ws_keep_alive_interval = undefined;
            }
            
            this.conns[wsname].ws_keep_alive_interval = setInterval(() => {
                // 每隔5秒ping以下，交易所会返回一个pong
                if (this.conns[wsname].ws.readyState === WS.OPEN) this.conns[wsname].ws.ping();

                if (new Date() - this.conns[wsname]["heartbeat"] > 1000 * 10) {
                    logger.warn(`${this.name}: ${wsname} ws is disconnected, reconnecting ...`);
                    this._init_websocket(wsname, subscription_list);
                }
            }, 5000);

            if (wsname === "private") {
                for (let account_id of this.account_ids) {
                    // login
                    let timestamp = "" + Math.round(Date.now() / 1000);
                    let sign = CryptoJS.enc.Base64.stringify(CryptoJS.HmacSHA256(timestamp +'GET'+ '/users/self/verify', token[account_id].apiSecret));
                    let args = [
                        {
                            "apiKey": token[account_id].apiKey,
                            "passphrase": token[account_id].passphrase,
                            "timestamp": timestamp,
                            "sign": sign
                        }
                    ]
                    this._send_ws_message(this.conns[wsname].ws, { op: "login", args: args });

                    // let order_update_args = [{"channel": "orders", "instType": "SWAP", "instId": "CRV-USDT-SWAP"}];
                    let order_update_args = [{"channel": "orders", "instType": "SWAP"}];
                    setTimeout(() => {
                        this._send_ws_message(this.conns[wsname].ws, { op: "subscribe", args: order_update_args });
                    }, 1000);
                }
            } else {
                if (wsname === "public") subscription_list = subscription_list.filter(x => ["tickers"].includes(x.channel));
                if (wsname === "business") subscription_list = subscription_list.filter(x => ["trades-all"].includes(x.channel));
                this._send_ws_message(this.conns[wsname].ws, { op: "subscribe", args: subscription_list });
            }
        });
        
        this.conns[wsname].ws.on("close", (code, reason) => {
            let readyState = this.conns[wsname].ws.readyState;
            // 最好这里发一个warning
            logger.warn(`${this.name}:: ${wsname} ws is closed. reason: ${reason} code: ${code}. Now the state is ${readyState}.`);

            // code:
            // 1006: 可能是VPN连接不稳定
            // 4004: No data received in 30s.
            if (readyState === WS.CLOSED) {
                logger.warn(`${this.name}:: ${wsname} ws (state: ${readyState}) reconnecting ...`);
                this._init_websocket(wsname, subscription_list);
            }
        });
        
        this.conns[wsname].ws.on("error", (evt) => {
            logger.error(`${this.name}: ${wsname} ws on error: ` + evt);
        });
        
        this.conns[wsname].ws.on("message", (evt) => {
            let jdata;
            try {
                jdata = JSON.parse(evt);
            } catch (ex) {
                logger.error(ex);
                return;
            }

            // logger.info(`${this.name}: ${wsname} ${JSON.stringify(jdata)}`);

            if (("arg" in jdata) && ("data" in jdata)) {
                
                switch(jdata["arg"]["channel"]) {
                    case "trades-all":
                    case "tickers":
                        let market_data = this._format_market_data(jdata);
                        // logger.info(JSON.stringify(market_data));
                        this.intercom.emit(INTERCOM_CHANNEL.MARKET_DATA, market_data, INTERCOM_SCOPE.FEED);
                        break;
                    case "orders":
                        logger.info(`${this.name}: ${wsname} ${JSON.stringify(jdata)}`);
                        let order_updates = this._format_order_update(jdata);
                        for (let order_update of order_updates) {
                            this.intercom.emit(INTERCOM_CHANNEL.ORDER_UPDATE, order_update, INTERCOM_SCOPE.FEED);
                            logger.info(`${this.name}: ${wsname} ${JSON.stringify(order_update)}`);
                        }
                        break;
                    default:
                        logger.error(`${this.name}: unkown channel from ${wsname} ws: ${JSON.stringify(jdata)}`);
                }
            } else if (("op" in jdata) && ("data" in jdata)) {

                console.log(JSON.stringify(jdata));

                switch (jdata.op) {
                    case "order":
                    case "cancel-order":
                    case "amend-order":
                        // 目前不支持批量下单、撤单或改单，返回的ws repsonse的data里面就应该只有一个data
                        let response = this._format_ws_response(jdata);
                        console.log(response);
                        this.intercom.emit(INTERCOM_CHANNEL.WS_RESPONSE, response, INTERCOM_SCOPE.FEED);
                        break;
                    case "batch-orders":
                    case "batch-cancel-orders":
                    case "batch-amend-orders":
                    default:
                        logger.error(`${this.name}: unsupported op from ${wsname} ws: ${JSON.stringify(jdata)}`);
                }

            } else {
                logger.info(`${this.name}: ${wsname} WS: ${JSON.stringify(jdata)}`);
            }
        });

        this.conns[wsname].ws.on("ping", (evt) => {
            // OKX不会主动发送ping，所以这段代码没什么用
            logger.info(`${this.name}: ${wsname} websocket on ping: ` + evt);
        });

        this.conns[wsname].ws.on("pong", () => {
            // logger.info(`${this.name}: ${wsname} websocket on pong: `);
            this.conns[wsname]["heartbeat"] = new Date();
        });
    }

    _format_subscription_item(subscription_item) {
        // let exchange = subscription_item.split("|")[0];
        let symbol = subscription_item.split("|")[1];
        let contract_type = subscription_item.split("|")[2];
        let theme = subscription_item.split("|")[3];

        let instId = this._format_symbol_to_instId(symbol, contract_type);

        return {
            "channel": apiconfig.OKX.marketDataThemeMap[theme],
            "instId": instId
        }
    }

    _format_market_data(jdata) {
        let market_data;
        let metadata;
        switch (jdata["arg"]["channel"]) {
            case "trades-all":
                metadata = [
                    [
                        String(jdata["data"][0]["tradeId"]),   // aggregated trade id
                        utils.get_human_readable_timestamp(+jdata["data"][0]["ts"]),
                        parseFloat(jdata["data"][0]["px"]),
                        jdata["data"][0]["side"],
                        parseFloat(jdata["data"][0]["sz"])
                    ]
                ];
                market_data = {
                    exchange: EXCHANGE.OKX,
                    symbol: this._format_instId_to_symbol(jdata["arg"]["instId"]),
                    contract_type: CONTRACT_TYPE.PERP,
                    data_type: MARKET_DATA.TRADE,
                    metadata: metadata,
                    timestamp: utils._util_get_human_readable_timestamp()
                };
                return market_data;
            case "tickers":
                metadata = [
                    [
                        String(jdata["data"][0]["ts"]),            // ts as updated id
                        utils.get_human_readable_timestamp(+jdata["data"][0]["ts"]),    // timestamp
                        parseFloat(jdata["data"][0]["askPx"]),     // best_ask
                        parseFloat(jdata["data"][0]["askSz"]),     // best_ask_quantity
                        parseFloat(jdata["data"][0]["bidPx"]),     // best_bid
                        parseFloat(jdata["data"][0]["bidSz"])      // best_bid_quantity
                    ]
                ];
                market_data = {
                    exchange: EXCHANGE.OKX,
                    symbol: this._format_instId_to_symbol(jdata["arg"]["instId"]),
                    contract_type: CONTRACT_TYPE.PERP,
                    data_type: MARKET_DATA.BESTQUOTE,
                    metadata: metadata,
                    timestamp: utils._util_get_human_readable_timestamp()
                };
                return market_data;
        }
    }

    _format_order_update(jdata) {
        let uid = jdata.arg.uid;

        let order_updates = [];
        for (let data of jdata.data) {
            let instId = data.instId;
            let instType = data.instType;

            let symbol = this._format_instId_to_symbol(instId);
            let contract_type = this._format_instType_to_contract_type(instType);

            let order_update = {
                exchange: EXCHANGE.OKX,
                symbol: symbol,
                contract_type: contract_type,
                metadata: {
                    result: true,
                    account_id: apiconfig.OKX.accountIdMap[uid],
                    order_id: data.ordId,
                    client_order_id: data.clOrdId,
                    direction: (data.side === "sell") ? DIRECTION.SELL : DIRECTION.BUY,
                    timestamp: utils.get_human_readable_timestamp(+data.uTime),
                    fee: - parseFloat(data.fillFee),
                    update_type: this._convert_to_standard_order_update_type(data.state)
                },
                timestamp: utils._util_get_human_readable_timestamp(),
                order_info: {
                    original_amount: parseFloat(data.sz),
                    filled: parseFloat(data.accFillSz),
                    new_filled: parseFloat(data.fillSz),
                    avg_executed_price: parseFloat(data.avgPx),
                    submit_price: parseFloat(data.px),
                    status: this._convert_to_standard_order_status(data.state)
                }
            };
            order_updates.push(order_update);
        }

        return order_updates;
    }

    _format_ws_response(jdata) {
        let ref_id = jdata.id;
        let request = this.ws_trades[ref_id];
        let account_id = request.account_id;
        let symbol = request.symbol;
        let contract_type = request.contract_type;

        let cxl_resp;
        let metadata;
        let action;
        switch(jdata.op) {
            case "order":
            case "batch-orders":
                action = ORDER_ACTIONS.SEND;
                break;
            case "cancel-order":
            case "batch-cancel-orders":
                action = ORDER_ACTIONS.CANCEL;
                break;
            case "amend-order":
            case "batch-amend-orders":
                action = ORDER_ACTIONS.MODIFY;
                break;
        }

        if (jdata.code === "0") {
            let data = jdata.data[0];
            metadata = {
                result: true,
                account_id: account_id,
                order_id: data.ordId,
                client_order_id: data.clOrdId
            }
        } else {
            if (jdata.data.length === 0) {
                metadata = {
                    result: false,
                    account_id: account_id,
                    order_id: 0,
                    error_code: parseInt(jdata.code) || 888888,
                    error_code_msg: jdata.msg
                }
            } else {
                let data = jdata.data[0];
                metadata = {
                    result: false,
                    account_id: account_id,
                    order_id: data.ordId,
                    error_code: parseInt(data.sCode) || 999999,
                    error_code_msg: data.sMsg
                }
            }
        }

        cxl_resp = {
            exchange: EXCHANGE.OKX,
            symbol: symbol,
            contract_type: contract_type,
            event: action,
            metadata: metadata,
            timestamp: utils._util_get_human_readable_timestamp()
        };

        let response = {
            ref_id: ref_id,
            action: action,
            metadata: cxl_resp,
            request: request
        }

        setTimeout(() => delete this.ws_trades[ref_id], 1000 * 10);

        return response;
    }

    _format_instId_to_symbol(instId) {
        return instId.split("-").slice(0, 2).join("");
    }

    _format_symbol_to_instId(symbol, contract_type) {
        let exg_symbol = apiconfig.OKX.symbolMap[symbol];
        let instId;
        switch(contract_type) {
            case CONTRACT_TYPE.SPOT:
                instId = exg_symbol;
            case CONTRACT_TYPE.PERP:
                instId = exg_symbol + "-" + "SWAP";
                break;
            case CONTRACT_TYPE.FUTURES:
                instId = exg_symbol + "-" + "FUTURES";
                break;
        }
        return instId;
    }

    _format_instType_to_contract_type(instType) {
        switch(instType) {
            case "SPOT":
                return CONTRACT_TYPE.SPOT;
            case "SWAP":
                return CONTRACT_TYPE.PERP;
            case "FUTURES":
                return CONTRACT_TYPE.FUTURES;
        }
    }

    _convert_to_standard_order_status(status) {
        switch (status) {
            case "live":
                return ORDER_STATUS.SUBMITTED;
            case "canceled":
            case "mmp_canceled":
                return ORDER_STATUS.CANCELLED;
            case "partially_filled":
                return ORDER_STATUS.PARTIALLY_FILLED;
            case "filled":
                return ORDER_STATUS.FILLED;
            default:
                logger.warn(`No predefined order status conversion rule in ${this.name} for ${status}`);
                return "unknown";
        }
    }

    _convert_to_standard_order_update_type(update_type) {
        // OKX返回的order_update里面只有state 
        switch (update_type) {
            case "live":
                return ORDER_UPDATE_TYPE.SUBMITTED;
            case "canceled":
            case "mmp_canceled":
                return ORDER_UPDATE_TYPE.CANCELLED;
            case "partially_filled":
            case "filled":
                return ORDER_UPDATE_TYPE.EXECUTED;
            default:
                logger.warn(`No predefined order update type in ${this.name} for ${update_type}`);
                return "unknown";
        }
    }

    _get_rest_options(endpoint, method, account_id = '123456', params = undefined) {
        let timestamp = new Date().toISOString();
        let url = apiconfig.OKX.restUrl + endpoint;

        let sign_string = timestamp + method + endpoint;
        sign_string += (method === "POST") ? JSON.stringify(params) : "";
        let sign = CryptoJS.enc.Base64.stringify(CryptoJS.HmacSHA256(sign_string, token[account_id].apiSecret));

        let headers = {
            'Content-Type':'application/json',
            'OK-ACCESS-KEY': token[account_id].apiKey,
            'OK-ACCESS-SIGN': sign,
            'OK-ACCESS-TIMESTAMP': timestamp,
            'OK-ACCESS-PASSPHRASE': token[account_id].passphrase
        };

        console.log(JSON.stringify({
            url: url,
            headers: headers,
            body: params ? JSON.stringify(params) : undefined
        }));

        // 注意这里：三个参数，url, headers和body（一定是body，不能是data！！！
        return {
            url: url,
            headers: headers,
            body: params ? JSON.stringify(params) : undefined
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

        let instId = this._format_symbol_to_instId(symbol, contract_type);

        let options;
        // let url = apiconfig.OKX.restUrl + apiconfig.OKX.restUrlPlaceOrder;
        if (order_type === "market") {
            // 市价单走这里
            options = this._get_rest_options(apiconfig.OKX.restUrlPlaceOrder, "POST", account_id, {
                instId: instId,
                tdMode: "cross",
                clOrdId: client_order_id,
                side: direction.toLowerCase(),
                ordType: "market",
                sz: quantity
            });
        } else if (order_type === "limit") {
            // 限价单走这里
            options = this._get_rest_options(apiconfig.OKX.restUrlPlaceOrder, "POST", account_id, {
                instId: instId,
                tdMode: "cross",
                clOrdId: client_order_id,
                side: direction.toLowerCase(),
                ordType: "limit",
                px: price,
                sz: quantity
            });
        }

        let cxl_resp;
        let metadata;
        try {
            let body = await rp.post(options);

            if (typeof body === "string") {
                body = JSON.parse(body);
            }

            if (body.code === "0") {
                // 发单成功
                metadata = {
                    result: true,
                    account_id: account_id,
                    order_id: body.data[0].ordId,
                    client_order_id: body.data[0].clOrdId
                }
            } else {
                metadata = {
                    result: false,
                    account_id: account_id,
                    order_id: 0,
                    error_code: parseInt(body.data[0].sCode) || 888888,
                    error_code_msg: body.data[0].sMsg
                }
            }
        } catch (ex) {
            logger.error(ex.stack);
            let error =  ex.error ? JSON.parse(ex.error): undefined;
            metadata = {
                account_id: account_id,
                result: false,
                order_id: 0,
                error_code: error.code || 999999,
                error_code_msg: error.msg || ex.toString()
            }
        }

        cxl_resp = {
            exchange: EXCHANGE.OKX,
            symbol: symbol,
            contract_type: contract_type,
            event: ORDER_ACTIONS.SEND,
            metadata: metadata,
            timestamp: utils._util_get_human_readable_timestamp()
        };

        let response = {
            ref_id: ref_id,
            action: ORDER_ACTIONS.SEND,
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

        let instId = this._format_symbol_to_instId(symbol, contract_type);

        let options;
        if (order_id) {
            // 优先使用order_id进行撤单
            options = this._get_rest_options(apiconfig.OKX.restUrlCancelOrder, "POST", account_id, {
                ordId: order_id,
                instId: instId
            });
        } else {
            options = this._get_rest_options(apiconfig.OKX.restUrlCancelOrder, "POST", account_id, {
                clOrdId: client_order_id,
                instId: instId
            });
        }

        let metadata;
        try {
            let body = await rp.post(options);
            body = JSON.parse(body);

            if (body.code === '0') {
                metadata = {
                    result: true,
                    account_id: account_id,
                    order_id: body.data[0].ordId,
                    client_order_id: body.data[0].clOrdId
                }
            } else {
                metadata = {
                    result: false,
                    account_id: account_id,
                    error_code: parseInt(body.data[0].sCode) || 888888,
                    error_code_msg: body.data[0].sMsg
                }
            }
        } catch (ex) {
            logger.error(ex.stack);
            let error =  ex.error ? JSON.parse(ex.error): undefined;
            metadata = {
                account_id: account_id,
                result: false,
                error_code: error.code || 999999,
                error_code_msg: error.msg || ex.toString()
            }
        }

        let cxl_resp = {
            exchange: EXCHANGE.OKX,
            symbol: symbol,
            contract_type: contract_type,
            event: ORDER_ACTIONS.CANCEL,
            metadata: metadata,
            timestamp: utils._util_get_human_readable_timestamp()
        };

        let response = {
            ref_id: ref_id,
            action: ORDER_ACTIONS.CANCEL,
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

        let instId = this._format_symbol_to_instId(symbol, contract_type);
        let endpoint = (order_id) ? apiconfig.OKX.restUrlPlaceOrder + `?ordId=${order_id}&instId=${instId}` : apiconfig.OKX.restUrlPlaceOrder + `?clOrdId=${client_order_id}&instId=${instId}`;
        let options = this._get_rest_options(endpoint, "GET", account_id);

        let metadata;
        let order_info;
        try {
            let body = await rp.get(options);
            body = JSON.parse(body);

            if (body.code === "0") {
                metadata = {
                    result: true,
                    account_id: account_id,
                    order_id: body.data[0].ordId,
                    client_order_id: body.data[0].clOrdId
                }
                // + 符号可以把变量变成数字型
                order_info = {
                    original_amount: +body.data[0].sz,
                    avg_executed_price: +body.data[0].avgPx,
                    filled: +body.data[0].accFillSz,
                    status: this._convert_to_standard_order_status(body.data[0].state)
                };
            } else {
                metadata = {
                    result: false,
                    account_id: account_id,
                    error_code: parseInt(body.code) || 888888,
                    error_code_msg: body.msg
                };
                order_info = {
                    original_amount: 0,
                    filled: 0,
                    avg_executed_price: 0,
                    status: 'unknown'
                };
            }
        } catch (ex) {
            logger.error(ex.stack);
            let error =  ex.error ? JSON.parse(ex.error): undefined;

            metadata = {
                account_id: account_id,
                result: false,
                error_code: error.code || 999999,
                error_code_msg: error.msg || ex.toString(),
                order_id: order_id
            },
            order_info = {
                original_amount: 0,
                filled: 0,
                avg_executed_price: 0,
                status: 'unknown'
            };
        }

        let cxl_resp = {
            exchange: EXCHANGE.OKX,
            symbol: symbol,
            contract_type: contract_type,
            event: ORDER_ACTIONS.INSPECT,
            metadata: metadata,
            timestamp: utils._util_get_human_readable_timestamp(),
            order_info: order_info
        };

        let response = {
            ref_id: ref_id,
            action: ORDER_ACTIONS.INSPECT,
            metadata: cxl_resp,
            request: order
        }
    
        return response;
    }
    
    async _modify_order_via_rest(order) {
        // OKX可以对部分成交的订单进行修改
        // 修改的数量<=该笔订单已成交数量时，该订单的状态会修改为完全成交状态。
        // 目前仅支持修改数量和价格
        let ref_id = order["ref_id"];
        let symbol = order["symbol"];
        let contract_type = order["contract_type"];
        let order_id = order["order_id"];
        let client_order_id = order["client_order_id"];
        let account_id = order["account_id"];

        let newSz = order["quantity"];
        let newPx = order["price"];

        let instId = this._format_symbol_to_instId(symbol, contract_type);
        let options;
        if (order_id) {
            options = this._get_rest_options(apiconfig.OKX.restUrlModifyOrder, "POST", account_id, {
                ordId: order_id,
                newSz: newSz,
                newPx: newPx,
                instId: instId
            });
        } else {
            options = this._get_rest_options(apiconfig.OKX.restUrlModifyOrder, "POST", account_id, {
                clOrdId: client_order_id,
                newSz: newSz,
                newPx: newPx,
                instId: instId
            });
        }

        console.log(options);

        let metadata;
        let order_info;
        try {
            let body = await rp.post(options);
            body = JSON.parse(body);

            console.log(JSON.stringify(body));

            if (body.code === "0") {
                metadata = {
                    result: true,
                    account_id: account_id,
                    order_id: body.data[0].ordId,
                    client_order_id: body.data[0].clOrdId
                }
            } else {
                if (body.data.length === 0) {
                    metadata = {
                        result: false,
                        account_id: account_id,
                        error_code: parseInt(body.code) || 888888,
                        error_code_msg: body.msg
                    }
                } else {
                    metadata = {
                        result: false,
                        account_id: account_id,
                        error_code: parseInt(body.data[0].sCode) || 888888,
                        error_code_msg: body.data[0].sMsg
                    }
                }
            }
        } catch (ex) {
            logger.error(ex.stack);
            let error =  ex.error ? JSON.parse(ex.error): undefined;

            metadata = {
                account_id: account_id,
                result: false,
                error_code: error.code || 999999,
                error_code_msg: error.msg || ex.toString(),
                order_id: order_id
            }
        }

        let cxl_resp = {
            exchange: EXCHANGE.OKX,
            symbol: symbol,
            contract_type: contract_type,
            event: ORDER_ACTIONS.MODIFY,
            metadata: metadata,
            timestamp: utils._util_get_human_readable_timestamp()
        };

        let response = {
            ref_id: ref_id,
            action: ORDER_ACTIONS.MODIFY,
            metadata: cxl_resp,
            request: order
        }
    
        return response;
    }


    async _query_order_via_rest(order) {
        /**
         * GET /api/v5/trade/orders-pending?ordType=post_only,fok,ioc&instType=SPOT
         * 查询到满足所有条件的active orders
         */
        // 
        let ref_id = order["ref_id"];
        let symbol = order["symbol"];
        let contract_type = order["contract_type"];
        let account_id = order["account_id"];

        let instId = this._format_symbol_to_instId(symbol, contract_type);
        let endpoint = apiconfig.OKX.restUrlQueryOrders + `?instId=${instId}`;
        // let endpoint = apiconfig.OKX.restUrlQueryOrders;
        let options = this._get_rest_options(endpoint, "GET", account_id);

        let cxl_resp;
        try {
            let metadata;
            let body = await rp.get(options);
            body = JSON.parse(body);

            let formatted_active_orders;
            if (body.code === "0") {
                formatted_active_orders = [];
                // BinanceU中订单只有5中状态：NEW, PARTIALLY_FILLED, FILLED, CANCELLED, EXPIRED
                let active_orders = body.data;

                for (let i of active_orders) {
                    formatted_active_orders.push({
                        order_id: i["ordId"],
                        client_order_id: i['clOrdId'],
                        original_amount: +i["sz"],
                        avg_executed_price: +i["avgPx"],
                        filled: +i["fillSz"],
                        status: this._convert_to_standard_order_status(i["state"]),
                        direction: i["side"].toLowerCase(),
                        price: +i["px"],
                        contract_type: contract_type,
                        create_time: utils._util_get_human_readable_timestamp(i["cTime"]),
                        last_updated_time: utils._util_get_human_readable_timestamp(i['uTime'])
                    });
                }

                metadata = {
                    result: true,
                    account_id: account_id,
                    orders: formatted_active_orders,
                    timestamp: utils._util_get_human_readable_timestamp()
                }
            } else {
                metadata = {
                    result: false,
                    account_id: account_id,
                    error_code: parseInt(body.code) || 888888,
                    error_code_msg: body.msg,
                    timestamp: utils._util_get_human_readable_timestamp()
                }
            }

            cxl_resp = {
                exchange: EXCHANGE.OKX,
                symbol: symbol,
                contract_type: contract_type,
                event: REQUEST_ACTIONS.QUERY_ORDERS,
                metadata: metadata,
                timestamp: utils._util_get_human_readable_timestamp()
            };
        } catch (e) {
            cxl_resp = {
                exchange: EXCHANGE.OKX,
                symbol: symbol,
                contract_type: contract_type,
                event: REQUEST_ACTIONS.QUERY_ORDERS,
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
            action: REQUEST_ACTIONS.QUERY_ORDERS,
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

        let url = apiconfig.OKX.restUrl + apiconfig.OKX.restUrlQueryPosition;
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
                exchange: EXCHANGE.OKX,
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
                exchange: EXCHANGE.OKX,
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
            metadata: cxl_resp,
            request: query
        }
    
        return response;
    }

    async _query_account_via_rest(query) {
        let ref_id = query["ref_id"];
        let contract_type = query["contract_type"];
        let account_id = query["account_id"];

        let url = apiconfig.OKX.restUrl + apiconfig.OKX.restUrlQueryAccount;
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
                exchange: EXCHANGE.OKX,
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
                exchange: EXCHANGE.OKX,
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
            metadata: cxl_resp,
            request: query
        }
    
        return response;
    }
    
    async _send_order_via_ws(order) {
        let ref_id = order["ref_id"];
        let symbol = order["symbol"];
        let contract_type = order["contract_type"];
        let direction = order["direction"];
        let price = order["price"];
        let quantity = order["quantity"];
        let order_type = order["order_type"];
        let client_order_id = order["client_order_id"];

        let instId = this._format_symbol_to_instId(symbol, contract_type);

        // args里面不允许出现交易所定义以外的参数
        let args = [{
            side: direction.toLowerCase(),
            instId: instId,
            tdMode: "cross",
            ordType: order_type,
            sz: quantity,
            px: price,
            clOrdId: client_order_id
        }]

        this.ws_trades[ref_id] = order;
        console.log(this.conns["private"].ws.readystate);
        this._send_ws_message(this.conns["private"].ws, { id: ref_id, op: "order", args: args });
    }

    async _cancel_order_via_ws(order) {
        let ref_id = order["ref_id"];
        let symbol = order["symbol"];
        let contract_type = order["contract_type"];
        let order_id = order["order_id"];
        let client_order_id = order["client_order_id"];

        let instId = this._format_symbol_to_instId(symbol, contract_type);

        let args;
        if (order_id) {
            args = [{ instId: instId, ordId: order_id }]
        } else if (client_order_id) {
            args = [{ instId: instId, clOrdId: client_order_id }]
        } else {
            logger.warn(`${this.name}|${ref_id}:: Neither order id nor client order id is given during cancelling order.`);
        }

        this.ws_trades[ref_id] = order;
        this._send_ws_message(this.conns["private"].ws, { id: ref_id, op: "cancel-order", args: args });
    }

    async _modify_order_via_ws(order) {
        let ref_id = order["ref_id"];
        let symbol = order["symbol"];
        let contract_type = order["contract_type"];
        let order_id = order["order_id"];
        let client_order_id = order["client_order_id"];

        let newSz = order["quantity"];
        let newPx = order["price"];

        let instId = this._format_symbol_to_instId(symbol, contract_type);

        let args;
        if (order_id) {
            args = [{ instId: instId, ordId: order_id, newPx: newPx, newSz: newSz }]
        } else if (client_order_id) {
            args = [{ instId: instId, clOrdId: client_order_id, newPx: newPx, newSz: newSz }]
        } else {
            logger.warn(`${this.name}|${ref_id}:: Neither order id nor client order id is given during modifying order.`);
        }

        this.ws_trades[ref_id] = order;
        this._send_ws_message(this.conns["private"].ws, { id: ref_id, op: "amend-order", args: args });
    }
}

module.exports = ExchangeOKX;

// var intercom_config = [
//     INTERCOM_CONFIG[`LOCALHOST_FEED`],
//     INTERCOM_CONFIG[`LOCALHOST_STRATEGY`]
// ];
// let okx = new ExchangeOKX("OKX", new Intercom(intercom_config));
// okx._init_websocket();