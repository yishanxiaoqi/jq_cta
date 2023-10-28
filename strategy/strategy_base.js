require("../config/typedef.js");
const randomID = require("random-id");
const rp = require("request-promise-native");

const utils = require("../utils/util_func.js");
const logger = require("../module/logger.js");
const BinanceU = require("../exchange/exchange_binanceU.js");
const OKX = require("../exchange/exchange_okx.js");
const ExchangeBase = require("../exchange/exchange_base.js");

class StrategyBase {
    constructor(name, alias, intercom) {
        this.name = name;
        this.alias = alias;
        this.intercom = intercom;

        this.on_market_data_handler = this.on_market_data_ready.bind(this);
        this.on_order_update_handler = this.on_order_update.bind(this);
        this.on_response_handler = this.on_response.bind(this);
        this.on_account_update_handler = this.on_account_update.bind(this);

        this.exchanges = {};
        this.exchanges["BinanceU"] = new BinanceU("BinanceU", intercom);
        this.exchanges["OKX"] = new OKX("OKX", intercom);
    }

    start() {
        this._register_events();
        this.subscribe_market_data();
    }

    slack_publish(publish) {
        this.intercom.emit("SLACK_PUBLISH", publish, INTERCOM_SCOPE.STRATEGY);
    }

    _register_events() {
        let that = this;

        // redis
        this.intercom.on(INTERCOM_CHANNEL.MARKET_DATA, that.on_market_data_handler, INTERCOM_SCOPE.FEED);
        this.intercom.on(INTERCOM_CHANNEL.ORDER_UPDATE, that.on_order_update_handler, INTERCOM_SCOPE.FEED);
        this.intercom.on(INTERCOM_CHANNEL.ACCOUNT_UPDATE, that.on_account_update_handler, INTERCOM_SCOPE.FEED);
        this.intercom.on(INTERCOM_CHANNEL.WS_RESPONSE, that.on_response_handler, INTERCOM_SCOPE.FEED);

        // eventhandler
        this.intercom.on(INTERCOM_CHANNEL.REQUEST_RESPONSE, that.on_response_handler);
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

    _on_market_data_bestquote_ready(bestquote) {
        // logger.info(`${this.alias}: no implementation for market data bestquote ready.`)
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
            case REQUEST_ACTIONS.QUERY_POSITION:
                this.on_query_position_response(response);
                break;
            case REQUEST_ACTIONS.QUERY_ACCOUNT:
                this.on_query_account_response(response);
                break;
            case REQUEST_ACTIONS.QUERY_QUANTITATIVE_RULES:
                this.on_query_quantitative_rules_response(response);
                break;
            default:
                logger.debug(`Unhandled request action: ${response.action}`);
        }
    }

    on_send_order_response(response) {
        logger.info(`${this.alias}: no implementation for send order response.`)
    }

    on_cancel_order_response(response) {
        logger.info(`${this.alias}: no implementation for cancel order response.`)
    }

    on_inspect_order_response(response) {
        logger.info(`${this.alias}: no implementation for inspect order response.`)
    }

    on_modify_order_response(response) {
        logger.info(`${this.alias}: no implementation for modify order response.`)
    }

    on_query_orders_response(response) {
        logger.info(`${this.alias}: no implementation for query order response.`)
    }

    on_query_position_response(response) {
        logger.info(`${this.alias}: no implementation for query position response.`)
    }

    on_query_account_response(response) {
        logger.info(`${this.alias}: no implementation for query account response.`)
    }

    on_query_quantitative_rules_response(response) {
        // logger.info(`${this.alias}: no implementation for query quantitative rules response.`)
    }

    on_account_update(account_update) {
        // logger.info(`${this.alias}: ${JSON.stringify(account_update)}`);
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
        let idf = [order.exchange, order.symbol, order.contract_type].join(".");
        logger.debug(`Emitting send order request from ${this.name}|${this.alias}|${idf}|${order.client_order_id}|${order.label}|${order.quantity}@${order.price}`);

        // 这里可以放一些下单信息的检查和更新
        if (order["ref_id"] === undefined) order["ref_id"] = ref_id;
        order["send_time"] = utils._util_get_human_readable_timestamp();

        if (order.exchange === EXCHANGE.OKX) {
            order["action"] = ORDER_ACTIONS.SEND;
            this.intercom.emit("OKX_TRADE", order, INTERCOM_SCOPE.STRATEGY);
        } else {    
            let response = await this.exchanges[order.exchange]._send_order_via_rest(order);
            this.intercom.emit(INTERCOM_CHANNEL.REQUEST_RESPONSE, response);
        }
    }

    async cancel_order(order, ref_id = this.alias + randomID(27)) {
        let idf = [order.exchange, order.symbol, order.contract_type].join(".");
        logger.debug(`Emitting cancel order request from ${this.name}|${this.alias}|${idf}|${order["client_order_id"]}|${order["label"]}`);

        // 这里可以放一些下单信息的检查和更新
        if (order["ref_id"] === undefined) order["ref_id"] = ref_id;
        order["send_time"] = utils._util_get_human_readable_timestamp();

        if (order.exchange === EXCHANGE.OKX) {
            order["action"] = ORDER_ACTIONS.CANCEL;
            this.intercom.emit("OKX_TRADE", order, INTERCOM_SCOPE.STRATEGY);
        } else {
            let response = await this.exchanges[order.exchange]._cancel_order_via_rest(order);
            this.intercom.emit(INTERCOM_CHANNEL.REQUEST_RESPONSE, response);
        }
    }

    async inspect_order(order, ref_id = this.alias + randomID(27)) {
        let idf = [order.exchange, order.symbol, order.contract_type].join(".");
        logger.debug(`Emitting inspect order request from ${this.name}|${this.alias}|${idf}|${order["client_order_id"]}|${order["label"]}`);

        if (order["ref_id"] === undefined) order["ref_id"] = ref_id;
        order["send_time"] = utils._util_get_human_readable_timestamp();

        let response = await this.exchanges[order.exchange]._inspect_order_via_rest(order);
        this.intercom.emit(INTERCOM_CHANNEL.REQUEST_RESPONSE, response);
    }

    async modify_order(order, ref_id = this.alias + randomID(27)) {
        let idf = [order.exchange, order.symbol, order.contract_type].join(".");
        logger.debug(`Emitting modify order request from ${this.name}|${this.alias}|${idf}`);

        if (order["ref_id"] === undefined) order["ref_id"] = ref_id;
        order["send_time"] = utils._util_get_human_readable_timestamp();

        if (order.exchange === EXCHANGE.OKX) {
            order["action"] = ORDER_ACTIONS.MODIFY;
            this.intercom.emit("OKX_TRADE", order, INTERCOM_SCOPE.STRATEGY);
        } else {
            let response = await this.exchanges[order.exchange]._modify_order_via_rest(order);
            this.intercom.emit(INTERCOM_CHANNEL.REQUEST_RESPONSE, response);
        }
    }

    async query_orders(order, ref_id = this.alias + randomID(27)) {
        // 只返回active orders
        // logger.debug(`Emitting query orders request from ${this.name}|${this.alias}`);

        if (order["ref_id"] === undefined) order["ref_id"] = ref_id;
        order["send_time"] = utils._util_get_human_readable_timestamp();

        let response = await this.exchanges[order.exchange]._query_order_via_rest(order);
        this.intercom.emit(INTERCOM_CHANNEL.REQUEST_RESPONSE, response);
    }

    async query_position(query, ref_id = this.alias + randomID(27)) {
        logger.debug(`Emitting query positions request from ${this.name}|${this.alias}`);

        // 这里可以放一些下单信息的检查和更新
        if (query["ref_id"] === undefined) query["ref_id"] = ref_id;
        query["send_time"] = utils._util_get_human_readable_timestamp();

        let response = await this.exchanges[query.exchange]._query_position_via_rest(query);
        this.intercom.emit(INTERCOM_CHANNEL.REQUEST_RESPONSE, response);
    }

    async query_account(query, ref_id = this.alias + randomID(27)) {
        // 目前来看query_account覆盖了query_position的功能
        // 区别在于query position可以指定一个symbol进行query
        logger.debug(`Emitting query balance request from ${this.name}|${this.alias}|${query.account_id}`);

        // 这里可以放一些下单信息的检查和更新
        if (query["ref_id"] === undefined) query["ref_id"] = ref_id;
        query["send_time"] = utils._util_get_human_readable_timestamp();

        let response = await this.exchanges[query.exchange]._query_account_via_rest(query);
        this.intercom.emit(INTERCOM_CHANNEL.REQUEST_RESPONSE, response);
    }

    async query_quantitative_rules(query, ref_id = this.alias + randomID(27)) {
        logger.debug(`Emitting quantitative rules indicators request from ${this.name}|${this.alias}`);

        // 这里可以放一些下单信息的检查和更新
        if (query["ref_id"] === undefined) query["ref_id"] = ref_id;
        query["send_time"] = utils._util_get_human_readable_timestamp();

        let response = await this.exchanges[query.exchange]._query_quantitative_rules_via_rest(query);
        this.intercom.emit(INTERCOM_CHANNEL.REQUEST_RESPONSE, response);
    }
}

module.exports = StrategyBase;