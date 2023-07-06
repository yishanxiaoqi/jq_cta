require("../config/typedef.js");
const randomID = require("random-id");
const rp = require("request-promise-native");
const querystring = require("querystring");

const apiconfig = require("../config/apiconfig.json");
const logger = require("../module/logger.js");
const Slack = require("../module/slack");
const utils = require("../utils/util_func");

class StrategyBase {
    constructor(name, alias, intercom) {
        this.name = name;
        this.alias = alias;
        this.intercom = intercom;
        this.slack = new Slack.Slack();

        // account_id及其对应的apiKey和apiSecret，目前一个策略只能做一个账号
        this.account_id = "jq_cta_02";
        this.apiKey = "qGKdrATW1ZaSxjhyClx2zez8BHJp9uVrBmCVZ6LbOeNF65GRazB25pwFWpYabDPB";
        this.apiSecret = "u3k0fbR7eqYDKnltU31nWwQ19Jw0RxqUg8XDuMTQoKiBr8mN7gRQbQN6ocIndDAG";

        this.on_market_data_handler = this.on_market_data_ready.bind(this);
        this.on_order_update_handler = this.on_order_update.bind(this);
        this.on_response_handler = this.on_response.bind(this);
        this.on_account_update_handler = this.on_account_update.bind(this);
    }

    start() {
        this._register_events();
        this.subscribe_market_data();
    }

    _register_events() {
        let that = this;

        // redis
        this.intercom.on("MARKET_DATA", that.on_market_data_handler, INTERCOM_SCOPE.FEED);
        this.intercom.on("ORDER_UPDATE", that.on_order_update_handler, INTERCOM_SCOPE.FEED);
        this.intercom.on("ACCOUNT_UPDATE", that.on_account_update_handler, INTERCOM_SCOPE.FEED);

        // eventhandler
        this.intercom.on("REQUEST_RESPONSE", that.on_response_handler);
    }

    subscribe_market_data() {
        logger.info(`${this.name}: no implement for subscribe market data.`)
    }

    on_market_data_ready(market_data) {
        switch (market_data['data_type']) {
            case MARKET_DATA.ORDERBOOK:
                this._on_market_data_orderbook_ready(market_data);
                break;
            case MARKET_DATA.BESTQUOTE:
                this._on_market_data_bestquote_ready(market_data);
                break;
            case MARKET_DATA.TRADE:
                this._on_market_data_trade_ready(market_data);
                break;
            case MARKET_DATA.PRICE:
                this._on_market_data_price_ready(market_data);
                break;
            case MARKET_DATA.KLINE:
                this._on_market_data_kline_ready(market_data);
                break;
            case MARKET_DATA.INDEX:
                this._on_market_data_index_ready(market_data);
                break;
            case MARKET_DATA.RATE:
                this._on_market_data_rate_ready(market_data);
                break;
            case MARKET_DATA.LIQUIDATION:
                this._on_market_data_liquidation_ready(market_data);
                break;
            default:
                logger.error(`${this.alias}::on_market_data_ready|unsupported market data type received: ${market_data['data_type']}`);
        }
    }

    _on_market_data_trade_ready(trade) {
        logger.info(`${this.alias}: no implementation for market data trade ready.`)
    }

    on_order_update(order_update) {
        logger.info(`${this.alias}: no implementation for order update.`)
    }

    on_response(response) {
        // 过滤不属于本策略的response
        let ref_id = response["ref_id"];
        logger.info(`${this.alias}::on_${response.action}_response| ${JSON.stringify(response)}`);
        if (ref_id.slice(0, 3) !== this.alias) return;

        switch (response.action) {
            case REQUEST_ACTIONS.QUERY_ORDERS:
                this.on_query_orders_response(response);
                break;
            case REQUEST_ACTIONS.SEND_ORDER:
                this.on_send_order_response(response);
                break;
            case REQUEST_ACTIONS.CANCEL_ORDER:
                this.on_cancel_order_response(response);
                break;
            case REQUEST_ACTIONS.MODIFY_ORDER:
                this.on_modify_order_response(response);
                break;            
            case REQUEST_ACTIONS.INSPECT_ORDER:
                this.on_inspect_order_response(response);
                break;
            default:
                logger.debug(`Unhandled request action: ${response.action}`);
        }
    }

    on_send_order_response(response) {
        logger.info(`${this.alias}: no implementation for send order response response.`)
    }

    on_cancel_order_response(response) {
        logger.info(`${this.alias}: no implementation for cancel order response response.`)
    }

    on_query_orders_response(response) {
        logger.info(`${this.alias}: no implementation for query order response response.`)
    }

    on_account_update(account_update) {
        logger.info(`${this.name}: ${JSON.stringify(account_update)}`);
        if (!account_update["a"]) {
            logger.warn(`${this.name}: no data update in account update?`);
            return;
        }

        if (account_update["a"]["B"].length > 0) {
            let balance = account_update["a"]["B"];
            this.on_balance_update(balance);
        }
        if (account_update["a"]["P"].length > 0) {
            let position = account_update["a"]["P"];
            this.on_position_update(position);
        }
    }

    on_balance_update(balance) {
        // logger.info(`${this.name}: no implementation for balance update!`);
    }

    on_position_update(position) {
        // logger.info(`${this.name}: no implementation for position update!`);
    }


    async send_order(order, ref_id = this.alias + randomID(27)) {
        logger.debug(`Emitting send order request from ${this.name}|${this.alias}|${order["symbol"]}|${order["label"]}|${order["client_order_id"]}`);

        // 这里可以放一些下单信息的检查和更新
        if (order["ref_id"] === undefined) order["ref_id"] = ref_id;
        let response = await this._send_order_via_rest(order);

        console.log("order details", JSON.stringify(order));
        
        this.intercom.emit("REQUEST_RESPONSE", response);
    }

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

        let exg_symbol = symbol;
        let exg_direction = direction.toUpperCase();
        let exg_order_type = apiconfig.orderTypeMap[order_type];
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
                symbol: symbol,
                orderId: order_id,
                timestamp: Date.now(),
            }, account_id);
        } else {
            params = this._get_rest_options(restUrlCancelOrder, {
                symbol: symbol,
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
                symbol: symbol,
                orderId: order_id,
                timestamp: Date.now(),
            }, account_id); 
        } else {
            params = this._get_rest_options(restUrlGetOrder, {
                symbol: symbol,
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
                exchange: this.name,
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
            symbol: symbol,
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
}

module.exports = StrategyBase;