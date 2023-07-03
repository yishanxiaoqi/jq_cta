require("../config/typedef.js");
const fs = require("fs");
const WS = require("ws");
const moment = require("moment");
const assert = require("assert");
const randomID = require("random-id");
const EventEmitter = require("events");
const querystring = require("querystring");
const rp = require("request-promise-native");

const apiconfig = require("../config/apiconfig.json");
const logger = require("../module/logger.js");
const request = require('../module/request.js');
const utils = require("../utils/util_func");
const stratutils = require("../utils/strat_util.js");
const emitter = new EventEmitter.EventEmitter();

const { cal_bar_otime } = require("../utils/strat_util.js");

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

        this.init_status_map();
        this.init_order_map();  // this will set order_map to be empty
        this.init_summary();

        // idf::exchange.symbol.contract_type
        this.prices = {};
        this.klines = {}
        this.cur_bar_otime = {};
        this.pre_bar_otime = {};

        // set-up
        this.interval = this.cfg["interval"];
        this.contract_type = CONTRACT_TYPE.PERP;

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

        this.load_klines();

        setInterval(() => {
            fs.writeFile(`./config/status_map_${this.alias}.json`, JSON.stringify(this.status_map), function (err) {
                if (err) logger.info(`${this.alias}::err`);
            });
            fs.writeFile(`./config/order_map_${this.alias}.json`, JSON.stringify(this.order_map), function (err) {
                if (err) logger.info(`${this.alias}::err`);
            });
        }, 1000 * 3);

        setInterval(() => {
            // 每隔2分钟查询一下active orders
            this.query_active_orders();
        }, 1000 * 60 * 2);

        setInterval(() => {
            // 每隔1小时将status_map做一个记录
            let ts = moment().format('YYYYMMDDHHmmssSSS'), month = moment().format('YYYY-MM');
            fs.writeFile(`./log/status_map_${this.alias}_${month}.log`, ts + ": " + JSON.stringify(this.status_map) + "\n", { flag: "a+" }, (err) => {
                if (err) logger.info(`${this.alias}::err`);
            });
        }, 1000 * 60 * 60);

        // setTimeout(() => {
        //     this._test_query_orders();
        // }, 1000 * 3);
    }

    query_active_orders() {
        let that = this;
        that.cfg["idfs"].forEach((idf) => {
            let [exchange, symbol, contract_type] = idf.split(".");
            let act_id = that.cfg[idf]["act_id"];
            that.query_orders({
                exchange: exchange,
                symbol: symbol,
                contract_type: contract_type,
                account_id: act_id,
            });
        });
    }

    init_order_map() {
        let that = this;

        // 注意exists和require的路径设置是不一样的
        that.order_map = (!fs.existsSync(`./config/order_map_${that.alias}.json`))? {}: require(`../config/order_map_${that.alias}`);

        // TODO: how to differ from new_start and first initialization
        that.cfg["idfs"].forEach((idf) => {
            if (that.cfg["clear_existing_status"]) {
                that.order_map[idf] = {};
            } else {
                that.order_map[idf] = (that.order_map[idf]) ? that.order_map[idf] : {};
            }
        });
    }

    init_status_map() {
        let that = this;

        that.status_map = (!fs.existsSync(`./config/status_map_${that.alias}.json`))? {}: require(`../config/status_map_${that.alias}`);
                    
        that.cfg["idfs"].forEach((idf) => {
            if ((that.status_map[idf] === undefined) || (that.cfg["clear_existing_status"])) {
                that.status_map[idf] = {
                    "status": "EMPTY",
                    "anti_order_sent": false,
                    "pos": 0,
                    "real_pos": "",
                    "triggered": "",
                    "up": "",
                    "dn": "",
                    "long_enter": "",
                    "high_since_long": "",
                    "short_enter": "",
                    "low_since_short": "",
                    "bar_n": "",
                    "bar_enter_n": 0,
                    "ep": "",
                    "af": "",
                    "sar": "",
                    "stoploss_price": "",
                    "fee": 0,
                    "quote_ccy": 0,
                    "net_profit": 0
                }
            }
        });
    }

    init_summary() {
        let that = this;
        that.summary = {};
        that.summary["overall"] = {};
        let status_list = that.cfg["idfs"].map((idf) => that.status_map[idf]["status"]);
        let long_num = status_list.map((element) => element === "LONG").reduce((a, b) => a + b, 0);
        let short_num = status_list.map((element) => element === "SHORT").reduce((a, b) => a + b, 0);
        that.summary["overall"]["long_num"] = long_num;
        that.summary["overall"]["short_num"] = short_num;
    }

    load_klines() {
        logger.info("Loading the klines from https://fapi.binance.com/fapi/v1/klines/");
        let that = this;

        let interval = that.cfg["interval"];
        let num = (interval === "1d") ? 24 : parseInt(interval.split("h")[0]);
        assert(["1d", "12h", "8h", "6h", "4h", "3h", "2h", "1h"].includes(interval));

        that.cfg["idfs"].forEach((idf) => {
            that.klines[idf] = { "ts": [], "open": [], "high": [], "low": [], "ready": false };
            let symbol = idf.split(".")[1];
            let n_klines = (that.cfg[idf]["track_ATR_n"] + 1) * num;
            let url = "https://fapi.binance.com/fapi/v1/klines/?symbol=" + symbol + "&contractType=PERPETUAL&interval=1h&limit=" + n_klines;
            request.get({
                url: url, json: true
            }, function (error, res, body) {
                let high = Number.NEGATIVE_INFINITY, low = Number.POSITIVE_INFINITY;
                for (let i = body.length - 1; i >= 0; i--) {
                    let ts = utils.get_human_readable_timestamp(body[i][0]);
                    let hour = parseInt(ts.slice(8, 10));
                    high = Math.max(high, parseFloat(body[i][2]));
                    low = Math.min(low, parseFloat(body[i][3]));
                    if ((interval === "1h") || (hour % num === that.cfg[idf]["splitAt"])) {
                        that.klines[idf]["ts"].push(ts);
                        that.klines[idf]["open"].push(parseFloat(body[i][1]));
                        that.klines[idf]["high"].push(high);
                        that.klines[idf]["low"].push(low);
                        high = Number.NEGATIVE_INFINITY;
                        low = Number.POSITIVE_INFINITY;
                    }
                }
            });
            setTimeout(() => that.klines[idf]["ready"] = true, 5000);
        });
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
            // console.log("private open", JSON.stringify(evt));
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
                    console.log("=== reconnecting....")
                    this._init_websocket();
                }
            }, 30000);

            // 100毫秒后订阅频道
            setTimeout(() => {
                const sub_id = +randomID(6, '0');
                const sub_streams = this.cfg["symbols"].map((symbol) => { return `${symbol.toLowerCase()}@aggTrade` });
                this._send_ws_message({ method: "SUBSCRIBE", params: sub_streams, id: sub_id });
            }, 100);
        });

        this.ws.on("close", (code, reason) => {
            logger.warn(`${this.name}:: private websocket is DISCONNECTED. reason: ${reason} code: ${code}`);
            console.log(`${this.name}:: private websocket is DISCONNECTED. reason: ${reason} code: ${code}`);
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

    on_order_update(order_update) {
        let that = this;

        let exchange = order_update["exchange"];
        let symbol = order_update["symbol"];
        let contract_type = order_update["contract_type"];

        let order_status = order_update["order_info"]["status"];
        let direction = order_update["metadata"]["direction"];
        let client_order_id = order_update["metadata"]["client_order_id"];
        let update_type = order_update["metadata"]["update_type"];
        let act_id = order_update["metadata"]["account_id"];

        let idf = [exchange, symbol, contract_type].join(".");
        
        // 不是本策略的订单更新，自动过滤
        if (client_order_id.slice(0, 3) !== that.alias) return;
        logger.info(`${that.alias}::on_order_update|${JSON.stringify(order_update)}`);

        let label = client_order_id.slice(3, 5);
        if (!Object.values(LABELMAP).includes(label)) {
            logger.info(`${that.alias}::on_order_update|unknown order label ${label}!`);
            return;
        }
        label = stratutils.get_key_by_value(LABELMAP, label);   
        let order_idf = [act_id, symbol, direction, label, client_order_id].join("|");

        if (order_status === ORDER_STATUS.SUBMITTED) {
            let submit_price = order_update["order_info"]["submit_price"];
            let original_amount = order_update["order_info"]["original_amount"];
            logger.info(`${that.alias}::on_order_update|${order_idf} order ${original_amount} placed @${submit_price} after ${update_type}!`);
            
            // 对手单发送成功，1秒后允许修改对手单
            if (label.slice(0, 4) === "ANTI") {
                setTimeout(() => that.status_map[idf]["anti_order_sent"] = false, 1000);  
            }

        } else if (order_status === ORDER_STATUS.CANCELLED) {
            logger.info(`${that.alias}::on_order_update|${order_idf} order cancelled after ${update_type}!`);
            if (update_type === "cancelled") {
                // 订单已经撤销，100毫秒后从order_map中删除该订单（1分钟之后的原因是防止on_response还要用）
                logger.info(`${that.alias}::on_order_update|${order_idf} order cancelled, will be removed from order_map in 200ms!`);
                setTimeout(() => delete that.order_map[idf][client_order_id], 100);
            } else if (update_type === "expired") {
                // Just expired (usually the stop order triggered), Do nothing here!
            } else {
                logger.info(`${that.alias}::Unhandled update type: ${update_type}`);
            }
        } else if ((order_status === ORDER_STATUS.FILLED) || (order_status === ORDER_STATUS.PARTIALLY_FILLED)) {
            let original_amount = order_update["order_info"]["original_amount"];
            let filled = order_update["order_info"]["filled"];
            let submit_price = order_update["order_info"]["submit_price"];
            let avg_executed_price = order_update["order_info"]["avg_executed_price"];
            let fee = order_update["metadata"]["fee"];

            logger.info(`${that.alias}::on_order_update|${order_idf} order ${filled}/${original_amount} filled @${avg_executed_price}/${submit_price}!`);

            // 对于UP ORDER无论是完全成交还是部分成交，都撤销DN ORDER；DN ORDER同理
            // "DN"如果还在order_map里面，说明还没被撤销；如果不在了，说明已经撤销了，不需要再进行撤销
            // 同理："UP"如果还在order_map里面，说明还没被撤销；如果不在了，说明已经撤销了，不需要再进行撤销
            if ((label === "UP") && ("DN" in that.order_map[idf])) {
                // The UP ORDER got filled, cancel the DN order
                that.cancel_order({
                    exchange: exchange,
                    symbol: symbol,
                    contract_type: contract_type,
                    client_order_id: that.order_map[idf]["DN"]["client_order_id"],
                    account_id: act_id,
                });
                // 这里删除label，在on_order_update里面删除client_order_id
                delete that.order_map[idf]["DN"];
            } else if ((label === "DN") && ("UP" in that.order_map[idf])) {
                // The DN ORDER got filled, cancel the UP order
                that.cancel_order({
                    exchange: exchange,
                    symbol: symbol,
                    contract_type: contract_type,
                    client_order_id: that.order_map[idf]["UP"]["client_order_id"],
                    account_id: act_id,
                });
                // 这里删除label，在on_order_update里面删除client_order_id
                delete that.order_map[idf]["UP"];
            }

            // 计算新成交量
            let new_filled = filled - that.order_map[idf][client_order_id]["filled"];
            that.order_map[idf][client_order_id]["filled"] = filled;

            // 更新position
            that.status_map[idf]["pos"] += (direction === DIRECTION.BUY) ? new_filled : - new_filled;
            that.status_map[idf]["fee"] += fee;
            that.status_map[idf]["quote_ccy"] += (direction === DIRECTION.SELL) ? new_filled * avg_executed_price : - new_filled * avg_executed_price;

            that.status_map[idf]["pos"] = stratutils.transform_with_tick_size(that.status_map[idf]["pos"], QUANTITY_TICK_SIZE[idf]);
            that.status_map[idf]["fee"] = stratutils.transform_with_tick_size(that.status_map[idf]["fee"], 0.01);
            that.status_map[idf]["quote_ccy"] = stratutils.transform_with_tick_size(that.status_map[idf]["quote_ccy"], 0.01);

            // 检查一下status_map变化
            logger.info(`${that.alias}|${symbol}::${JSON.stringify(that.status_map[idf])}`);

            if (order_status === ORDER_STATUS.FILLED) {
                // 订单完全成交，更新status_map
                that.status_map[idf]["status"] = that.order_map[idf][client_order_id]["target"];

                // 订单完全成交，不再是触发状态
                // 如果赋值为undefined，在UI那边会缓存为之前的那个值，影响判断，所以这里赋值为""
                that.status_map[idf]["triggered"] = "";
                if (that.status_map[idf]["status"] === "EMPTY") {
                    // 订单完全成交，仓位变为空，这说明是平仓单
                    // 把that.pre_bar_otime[idf]变成undefined，这样就变成new_start，可以重新发开仓单
                    // 有可能会出现依然无法重新发开仓单的情况，这种大概率是因为bar_enter_n没有进行更新
                    that.pre_bar_otime[idf] = undefined;
                    for (let item of ["bar_n", "ep", "af", "sar", "long_enter", "high_since_long", "short_enter", "low_since_short", "stoploss_price"]) {
                        that.status_map[idf][item] = "";
                    }
                } else {
                    let cutloss_rate = that.cfg[idf]["cutloss_rate"];

                    that.status_map[idf]["bar_n"] = 0;
                    that.status_map[idf]["af"] = that.cfg[idf]["ini_af"];
                    that.status_map[idf]["bar_enter_n"] += 1;
                    that.status_map[idf]["ep"] = avg_executed_price;

                    if (that.status_map[idf]["status"] === "LONG") {
                        // 仓位变为LONG，但实际上是dn break，因此用low_sinc_short
                        that.status_map[idf]["long_enter"] = "";
                        that.status_map[idf]["high_since_long"] = "";
                        that.status_map[idf]["short_enter"] = avg_executed_price;
                        that.status_map[idf]["low_since_short"] = avg_executed_price;
                        that.status_map[idf]["sar"] = avg_executed_price * (1 + cutloss_rate);
                    } else {
                        // 仓位变为SHORT，但实际上是up break，因此用high_since_long
                        that.status_map[idf]["long_enter"] = avg_executed_price;
                        that.status_map[idf]["high_since_long"] = avg_executed_price;
                        that.status_map[idf]["short_enter"] = "";
                        that.status_map[idf]["low_since_short"] = "";
                        that.status_map[idf]["sar"] = avg_executed_price * (1 - cutloss_rate);
                    }

                    that.status_map[idf]["ep"] = stratutils.transform_with_tick_size(that.status_map[idf]["ep"], PRICE_TICK_SIZE[idf]);
                    that.status_map[idf]["sar"] = stratutils.transform_with_tick_size(that.status_map[idf]["sar"], PRICE_TICK_SIZE[idf]);    
                }

                // 订单完全成交，在order_map中删去该订单（注意：完全成交才删除，且当场删除！）
                delete that.order_map[idf][label.slice(0, 6)];

                // remove the client_order_id from order_map 100ms later, as the on_response may need to use it!
                setTimeout(() => delete that.order_map[idf][client_order_id], 100);

                // 检查LONG和SHORT的个数
                let status_list = that.cfg["idfs"].map((idf) => that.status_map[idf]["status"]);
                let long_num = status_list.map((element) => element === "LONG").reduce((a, b) => a + b, 0);
                let short_num = status_list.map((element) => element === "SHORT").reduce((a, b) => a + b, 0);
                that.summary["overall"]["long_num"] = long_num;
                that.summary["overall"]["short_num"] = short_num;

                // 如果超过LONG的个数超过了max_num，所有的DN开仓单都要撤销
                if (long_num >= that.cfg["max_num"]) {
                    logger.info(`${that.alias}::long_num exceeds max_num, cancel all the DN orders!`);
                    that.cfg["idfs"].forEach((idf) => {
                        let [exg, syb, con] = idf.split(".");       // 不同于exchange, symbol和contract_type
                        if ((that.order_map[idf]["DN"] !== undefined) && (that.order_map[idf]["status"] !== "TBA")) {
                            let up_client_order_id = that.order_map[idf]["DN"]["client_order_id"];
                            if (up_client_order_id !== undefined) {
                                that.cancel_order({
                                    exchange: exg,
                                    symbol: syb,
                                    contract_type: con,
                                    client_order_id: up_client_order_id,
                                    account_id: act_id,
                                });
                            }
                            delete that.order_map[idf]["DN"];
                        }
                    });
                }

                // 如果超过SHORT的个数超过了max_num，所有的UP开仓单都要撤销
                if (short_num >= that.cfg["max_num"]) {
                    logger.info(`${that.alias}::short_num exceeds max_num, cancel all the UP orders!`);
                    that.cfg["idfs"].forEach((idf) => {
                        let [exg, syb, con] = idf.split(".");       // 不同于exchange, symbol和contract_type
                        if ((that.order_map[idf]["UP"] !== undefined) && (that.order_map[idf]["status"] !== "TBA"))  {
                            let up_client_order_id = that.order_map[idf]["UP"]["client_order_id"];
                            if (up_client_order_id !== undefined) {
                                that.cancel_order({
                                    exchange: exg,
                                    symbol: syb,
                                    contract_type: con,
                                    client_order_id: up_client_order_id,
                                    account_id: act_id,
                                });
                            }
                            delete that.order_map[idf]["UP"];
                        }
                    });
                }

            } else {
                // 订单部分成交，处于触发状态
                that.status_map[idf]["status"] = "TBA";
                that.status_map[idf]["triggered"] = label;
            }

            // record the order filling details
            let ts = order_update["metadata"]["timestamp"];
            let filled_info = [act_id, exchange, symbol, contract_type, client_order_id, original_amount, filled, submit_price, avg_executed_price, fee].join(",");
            let order_info = (that.order_map[idf][client_order_id] === undefined) ? "" : Object.entries(that.order_map[idf][client_order_id]).filter((element) => element[0] !== "ToBeDeleted").map((element) => element[1]).join(",");
            let output_string = [ts, filled_info, order_info].join(",");
            output_string += (order_status === ORDER_STATUS.FILLED) ? ",filled\n" : ",partially_filled\n";
            fs.writeFile(`./log/order_filling_${this.alias}.csv`, output_string, { flag: "a+" }, (err) => {
                if (err) logger.info(`${this.alias}::${err}`);
            });
        } else {
            logger.info(`${this.alias}::on_order_update|Unhandled order update status: ${order_status}!`)
        }
    }

    on_market_data_ready(market_data) {
        logger.info(JSON.stringify(market_data));
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
        let that = this;

        let exchange = trade["exchange"];
        let symbol = trade["symbol"];
        let contract_type = trade["contract_type"];
        let price = trade["metadata"][0][2];
        let ts = trade["metadata"][0][1];

        let idf = [exchange, symbol, contract_type].join(".");


        if (!that.cfg["idfs"].includes(idf)) return;
        if (!that.klines[idf]["ready"]) return;
        that.prices[idf] = { "price": price, "upd_ts": ts };

        // logger.info(symbol, ts, that.cur_bar_otime[idf], that.pre_bar_otime[idf]);
        that.cur_bar_otime[idf] = cal_bar_otime(ts, that.interval, that.cfg[idf]["splitAt"]);
        // if the pre_bar_otime is undefined, it means the strategy is re-started
        let new_start = (that.pre_bar_otime[idf] === undefined);
        // new interal is not new_start, new bar means a new bar starts
        let new_bar = (!new_start) && (that.cur_bar_otime[idf] !== that.pre_bar_otime[idf]);

        if (new_start) {
            logger.info(`${that.alias}::${idf}::NEW START!`);
        } else if (new_bar) {
            logger.info(`${that.alias}::${idf}::NEW BAR!`);
            // 如果一些订单已经触发但是迟迟不能成交，必须进行处理
            // TODO: 如果在new_bar的一瞬间正在部分成交（虽然是小概率事件），怎么办？
            that.status_map[idf]["bar_enter_n"] = 0;
            if (that.status_map[idf]["status"] === "TBA") that.deal_with_TBA(idf);
        }

        // 更新kline数据，这里应该用>会不会更好？
        if (that.cur_bar_otime[idf] > that.klines[idf]["ts"][0]) {
            that.klines[idf]["ts"].unshift(that.cur_bar_otime[idf]);
            that.klines[idf]["ts"].pop();
            that.klines[idf]["open"].unshift(price);
            that.klines[idf]["open"].pop();
            that.klines[idf]["high"].unshift(price);
            that.klines[idf]["high"].pop();
            that.klines[idf]["low"].unshift(price);
            that.klines[idf]["low"].pop();
        } else if (that.cur_bar_otime[idf] === that.klines[idf]["ts"][0]) {
            that.klines[idf]["high"][0] = Math.max(price, that.klines[idf]["high"][0]);
            that.klines[idf]["low"][0] = Math.min(price, that.klines[idf]["low"][0]);
        } else {
            logger.debug(`${that.alias}::${idf}::cur_bar_otime is smaller than klines ts[0]?`);
        }

        // update bar open time and net_profit
        that.pre_bar_otime[idf] = that.cur_bar_otime[idf];

        // 下单逻辑模块
        that.status_map[idf]["net_profit"] = that.status_map[idf]["quote_ccy"] + that.status_map[idf]["pos"] * price - that.status_map[idf]["fee"];
        that.status_map[idf]["net_profit"] = stratutils.transform_with_tick_size(that.status_map[idf]["net_profit"], 0.01);
        that.main_execuation(new_start, new_bar, idf);
    }

    deal_with_TBA(idf) {
        let that = this;
        let [exchange, symbol, contract_type] = idf.split(".");
        let act_id = that.cfg[idf]["act_id"];

        let triggered = that.status_map[idf]["triggered"];
        let up_price = that.status_map[idf]["up"];
        let dn_price = that.status_map[idf]["dn"];

        let cutloss_rate = that.cfg[idf]["cutloss_rate"];
        let orders_to_be_cancelled = [];
        let orders_to_be_submitted = [];

        if (triggered === "UP") {
            // 开仓单开了一半，剩下的撤单，直接转为对应的status
            logger.info(`${that.alias}::${act_id}|${idf} deal with TBA: cancel the remaining UP order!`);
            let up_client_order_id = that.order_map[idf]["UP"]["client_order_id"];
            orders_to_be_cancelled.push(up_client_order_id);
            that.status_map[idf]["status"] = "SHORT";
        } else if (triggered === "DN") {
            // 开仓单开了一半，剩下的放弃，直接转为对应的status
            logger.info(`${that.alias}::${act_id}|${idf} deal with TBA: cancel the remaining DN order!`);
            let dn_client_order_id = that.order_map[idf]["DN"]["client_order_id"];
            orders_to_be_cancelled.push(dn_client_order_id);
            that.status_map[idf]["status"] = "LONG";
        } else if ((triggered === "ANTI_L|STOPLOSS") || (triggered === "ANTI_L|REVERSE")) {
            // 平仓单未能成交，撤销该单，改用市价单成交
            // 反手单未能成交，撤销该单，放弃反手，改为市价平仓
            let anti_client_order_id = that.order_map[idf]["ANTI_L"]["client_order_id"];
            orders_to_be_cancelled.push(anti_client_order_id);

            if (that.status_map[idf]["pos"] < 0) {
                // 已经部分反手，放弃剩下的反手
                logger.info(`${that.alias}::${act_id}|${idf} deal with TBA: cancel the remaining ANTI_L order!`);
                that.status_map[idf]["status"] = "SHORT";
            } else if (that.status_map[idf]["pos"] === 0) {
                // 已经平仓，放弃剩下的反手
                logger.info(`${that.alias}::${act_id}|${idf} deal with TBA: cancel the remaining ANTI_L order!`);
                that.status_map[idf]["status"] = "EMPTY";
            } else {
                // 部分平仓，要求继续平仓，市价的0.97倍折出售，放弃剩下的反手
                // 因为binance对限价单价格有限制，通常不能超过标记价格的5%
                logger.info(`${that.alias}::${act_id}|${idf} deal with TBA: cover the LONG position!`);
                let tgt_qty = that.status_map[idf]["pos"];
                let sell_price = stratutils.transform_with_tick_size(that.prices[idf]["price"] * 0.97, PRICE_TICK_SIZE[idf]);
                orders_to_be_submitted.push({ client_order_id: that.alias + LABELMAP["ANTI_L|STOPLOSS"] + randomID(7), label: "ANTI_L|STOPLOSS", target: "EMPTY", quantity: tgt_qty, price: sell_price, direction: DIRECTION.SELL });
            }
        } else if ((triggered === "ANTI_S|STOPLOSS") || (triggered === "ANTI_S|REVERSE")) {
            // 平仓单未能成交，撤销该单，改用市价单成交
            // 反手单未能成交，撤销该单，放弃反手，改为市价平仓
            let anti_client_order_id = that.order_map[idf]["ANTI_S"]["client_order_id"];
            orders_to_be_cancelled.push(anti_client_order_id);

            if (that.status_map[idf]["pos"] > 0) {
                // 已经部分反手，放弃剩下的反手
                logger.info(`${that.alias}::${act_id}|${idf} deal with TBA: cancel the remaining ANTI_S order!`);
                that.status_map[idf]["status"] = "LONG";
            } else if (that.status_map[idf]["pos"] === 0) {
                // 已经平仓，放弃剩下的反手
                logger.info(`${that.alias}::${act_id}|${idf} deal with TBA: cancel the remaining ANTI_S order!`);
                that.status_map[idf]["status"] = "EMPTY";
            } else {
                // 部分平仓，要求继续平仓，市价1.03倍购买，放弃剩下的反手
                // 因为binance对限价单价格有限制，通常不能超过标记价格的5%
                logger.info(`${that.alias}::${act_id}|${idf} deal with TBA: cover the SHORT position!`);
                let tgt_qty = - that.status_map[idf]["pos"];
                let buy_price = stratutils.transform_with_tick_size(that.prices[idf]["price"] * 1.03, PRICE_TICK_SIZE[idf]);
                orders_to_be_submitted.push({ client_order_id: that.alias + LABELMAP["ANTI_S|STOPLOSS"] + randomID(7), label: "ANTI_S|STOPLOSS", target: "EMPTY", quantity: tgt_qty, price: buy_price, direction: DIRECTION.BUY });
            }
        } else {
            logger.info(`${that.alias}::TBA and new_bar handling: unhandled ${that.status_map[idf]["triggered"]}. If nothing, ignore it!`)
        }

        let current_status = that.status_map[idf]["status"];
        if (["LONG", "SHORT"].includes(current_status)) {
            that.status_map[idf]["bar_n"] = 0;    // 这里赋值为0，之后main_execuation中会加一
            that.status_map[idf]["af"] = that.cfg[idf]["ini_af"];
            that.status_map[idf]["sar"] = (current_status === "SHORT")? up_price * (1 - cutloss_rate): dn_price * (1 + cutloss_rate);;
            if (current_status === "SHORT") {
                that.status_map[idf]["long_enter"] = up_price;
                that.status_map[idf]["high_since_long"] = up_price;
            } else {
                that.status_map[idf]["short_enter"] = dn_price;
                that.status_map[idf]["low_since_short"] = dn_price;
            }
        }

        logger.info(`deal with TBA: ${JSON.stringify(that.status_map[idf])}`);

        orders_to_be_cancelled.forEach((client_order_id) => {
            that.cancel_order({
                exchange: exchange,
                symbol: symbol,
                contract_type: contract_type,
                client_order_id: client_order_id,
                account_id: act_id,
            });
        });

        orders_to_be_submitted.forEach((order) => {
            let client_order_id = order.client_order_id, label = order.label, target = order.target, quantity = order.quantity, price = order.price, direction = order.direction;

            // 发送订单，同时建立order_map
            // {"3106609167": {"label": "DN", "target": "LONG", "quantity": 21133, "time": 1669492800445, "filled": 0}}
            that.order_map[idf][client_order_id] = { label: label, target: target, quantity: quantity, time: moment.now(), filled: 0 };
            // {"ANTI_S": { "client_order_id": "3103898618",  "label": "ANTI_S|STOPLOSS", "price": 0.3214, "quantity": 100, "time": 1669492800445}}
            that.order_map[idf][label.slice(0, 6)] = { client_order_id: client_order_id, label: label, price: price, quantity: quantity, time: moment.now() };

            that.send_order({
                label: label,
                target: target,
                exchange: exchange,
                symbol: symbol,
                contract_type: contract_type,
                price: price,
                quantity: quantity,
                direction: direction,
                order_type: ORDER_TYPE.LIMIT,
                account_id: act_id,
                client_order_id: client_order_id
            });
        });
    }

    main_execuation(new_start, new_bar, idf) {
        let that = this;
        let price = that.prices[idf]["price"];
        let [exchange, symbol, contract_type] = idf.split(".");
        let ini_usdt = (that.cfg[idf]["ini_usdt"]) ? that.cfg[idf]["ini_usdt"] : that.cfg["ini_usdt"];
        let act_id = that.cfg[idf]["act_id"];

        // load status_map  -----------------------------------------------
        let bar_enter_n = that.status_map[idf]["bar_enter_n"];

        // para loading -----------------------------------------------
        let stoploss_rate = that.cfg[idf]["stoploss_rate"];
        let track_ATR_multiplier = that.cfg[idf]["track_ATR_multiplier"];
        let delta_af = that.cfg[idf]["delta_af"];
        let bar_enter_limit = that.cfg[idf]["bar_enter_limit"];

        // cal indicators -----------------------------------------------
        let track_ATR = Math.max(...Object.values(that.klines[idf]["high"]).slice(1)) - Math.min(...Object.values(that.klines[idf]["low"]).slice(1));
        let up = that.klines[idf]["open"][0] + track_ATR * track_ATR_multiplier;
        let dn = that.klines[idf]["open"][0] - track_ATR * track_ATR_multiplier;
        let up_price = stratutils.transform_with_tick_size(up, PRICE_TICK_SIZE[idf]);
        let dn_price = stratutils.transform_with_tick_size(dn, PRICE_TICK_SIZE[idf], "round");  // 如果dn_price是负数，会被round成最小价
        that.status_map[idf]["up"] = up_price;
        that.status_map[idf]["dn"] = dn_price;

        if (isNaN(up_price) || (isNaN(dn_price))) return;

        // 重启以后将anti_order_sent置零
        if (new_start) that.status_map[idf]["anti_order_sent"] = false;

        let orders_to_be_cancelled = [];    // client_order_id only
        let orders_to_be_submitted = [];    // {label: "", target: "", tgt_qty: "", price: "", direction: ""}

        if (that.status_map[idf]["status"] === "EMPTY") {
            that.status_map[idf]["anti_order_sent"] = false;

            if ((new_start || new_bar) && (bar_enter_n < bar_enter_limit)) {
                // 计算开仓量
                let up_qty = stratutils.transform_with_tick_size(ini_usdt / up_price, QUANTITY_TICK_SIZE[idf]);
                let dn_qty = stratutils.transform_with_tick_size(ini_usdt / dn_price, QUANTITY_TICK_SIZE[idf]);

                // 如果已经有UP单，撤销之
                if (that.order_map[idf]["UP"] !== undefined) {
                    orders_to_be_cancelled.push(that.order_map[idf]["UP"]["client_order_id"]);
                }

                // 如果已经有DN单，撤销之
                if (that.order_map[idf]["DN"] !== undefined) {
                    orders_to_be_cancelled.push(that.order_map[idf]["DN"]["client_order_id"]);
                }

                let [up_client_order_id, dn_client_order_id] = [that.alias + LABELMAP["UP"] + randomID(7), that.alias + LABELMAP["DN"] + randomID(7)];

                if (that.summary["overall"]["short_num"] < that.cfg["max_num"]) {
                    orders_to_be_submitted.push({ client_order_id: up_client_order_id, label: "UP", target: "SHORT", quantity: up_qty, price: up_price, direction: DIRECTION.SELL });
                }

                if (that.summary["overall"]["long_num"] < that.cfg["max_num"]) {
                    orders_to_be_submitted.push({ client_order_id: dn_client_order_id, label: "DN", target: "LONG", quantity: dn_qty, price: dn_price, direction: DIRECTION.BUY });
                }

            }
        } else if (that.status_map[idf]["status"] === "SHORT") {
            // 注意：SHORT时，实际上是up_break，因此有high_since_long
            if (new_bar) {
                // New bar and update the indicators
                that.status_map[idf]["bar_n"] += 1;
                if (that.status_map[idf]["bar_n"] !== 1) {
                    if (that.klines[idf]["high"][1] > that.status_map[idf]["ep"]) {
                        // if a higher high occurs, update the ep and af value
                        that.status_map[idf]["ep"] = that.klines[idf]["high"][1];
                        that.status_map[idf]["af"] += delta_af;
                        that.status_map[idf]["af"] = stratutils.transform_with_tick_size(that.status_map[idf]["af"], 0.01);
                    }
                    that.status_map[idf]["sar"] = that.status_map[idf]["sar"] + that.status_map[idf]["af"] * (that.status_map[idf]["ep"] - that.status_map[idf]["sar"]);
                    that.status_map[idf]["sar"] = stratutils.transform_with_tick_size(that.status_map[idf]["sar"], PRICE_TICK_SIZE[idf]);
                }
            } else {
                if (that.status_map[idf]["bar_n"] === 0) {
                    // the first bar when entered, initialize the ep value
                    that.status_map[idf]["ep"] = Math.max(that.status_map[idf]["ep"], price);
                }
            }

            if (that.status_map[idf]["high_since_long"] !== undefined) {
                that.status_map[idf]["high_since_long"] = Math.max(that.status_map[idf]["high_since_long"], price);
            }

            let stoploss_price = Math.max(that.status_map[idf]["high_since_long"] * (1 - stoploss_rate), that.status_map[idf]["sar"]);
            stoploss_price = stratutils.transform_with_tick_size(stoploss_price, PRICE_TICK_SIZE[idf]);
            that.status_map[idf]["stoploss_price"] = stoploss_price;

            if (isNaN(stoploss_price)) {
                logger.info(`${that.alias}: stoploss_price is null: ${that.status_map[idf]["high_since_long"]}, ${that.status_map[idf]["sar"]}, ${stoploss_rate}`)
            }

            // 对手单已经sent，但是还没有成功submitted，不做任何处理
            if (that.status_map[idf]["anti_order_sent"] === true) return;

            // 开仓当天不作任何操作
            if (that.status_map[idf]["bar_n"] === 0) return;

            if (stoploss_price < dn_price) {
                // dn_price更高，对手单为反手单
                // 直接发LIMIT单等待成交，如果已经触发，就想办法在该Bar内成交；如果未触发，则一直等待；
                let tgt_qty = stratutils.transform_with_tick_size(- that.status_map[idf]["pos"] + ini_usdt / dn_price, QUANTITY_TICK_SIZE[idf]);
                if (that.order_map[idf]["ANTI_S"] === undefined) {
                    // 对手单还没有发送
                    orders_to_be_submitted.push({ client_order_id: that.alias + LABELMAP["ANTI_S|REVERSE"] + randomID(7), label: "ANTI_S|REVERSE", target: "LONG", quantity: tgt_qty, price: dn_price, direction: DIRECTION.BUY });
                    that.status_map[idf]["anti_order_sent"] = true;
                } else {
                    // 对手单已发，检查是否需要更改
                    let anti_client_order_id = that.order_map[idf]["ANTI_S"]["client_order_id"];
                    let anti_label = that.order_map[idf]["ANTI_S"]["label"];
                    let anti_price = that.order_map[idf]["ANTI_S"]["price"];
                    let anti_qty = that.order_map[idf]["ANTI_S"]["quantity"];

                    // 若已存的反手单和现行不一致，则撤销重新发
                    if ((anti_label !== "ANTI_S|REVERSE") || (anti_price !== dn_price) || (anti_qty !== tgt_qty)) {
                        orders_to_be_cancelled.push(anti_client_order_id);
                        orders_to_be_submitted.push({ client_order_id: that.alias + LABELMAP["ANTI_S|REVERSE"] + randomID(7), label: "ANTI_S|REVERSE", target: "LONG", quantity: tgt_qty, price: dn_price, direction: DIRECTION.BUY });
                        that.status_map[idf]["anti_order_sent"] = true;
                    }
                }
            } else {
                // 止损价（stoploss_price）更高，反手单为止损单
                // 直接发LIMIT单等待成交，如果已经触发，就想办法在该Bar内成交；如果未触发，则一直等待
                let tgt_qty = stratutils.transform_with_tick_size(- that.status_map[idf]["pos"], QUANTITY_TICK_SIZE[idf]);
                if (that.order_map[idf]["ANTI_S"] === undefined) {
                    // 对手单（止损单）未发送
                    orders_to_be_submitted.push({ client_order_id: that.alias + LABELMAP["ANTI_S|STOPLOSS"] + randomID(7), label: "ANTI_S|STOPLOSS", target: "EMPTY", quantity: tgt_qty, price: stoploss_price, direction: DIRECTION.BUY });
                    that.status_map[idf]["anti_order_sent"] = true;
                } else {
                    // 对手单（止损单）已经发送，检查是否需要更改
                    let anti_client_order_id = that.order_map[idf]["ANTI_S"]["client_order_id"];
                    let anti_label = that.order_map[idf]["ANTI_S"]["label"];
                    let anti_price = that.order_map[idf]["ANTI_S"]["price"];
                    let anti_qty = that.order_map[idf]["ANTI_S"]["quantity"];

                    // 若已存的平仓单（止损单）和现行不一致，则撤销重新发
                    if ((anti_label !== "ANTI_S|STOPLOSS") || (anti_price !== stoploss_price) || (anti_qty !== tgt_qty)) {
                        orders_to_be_cancelled.push(anti_client_order_id);
                        orders_to_be_submitted.push({ client_order_id: that.alias + LABELMAP["ANTI_S|STOPLOSS"] + randomID(7), label: "ANTI_S|STOPLOSS", target: "EMPTY", quantity: tgt_qty, price: stoploss_price, direction: DIRECTION.BUY });
                        that.status_map[idf]["anti_order_sent"] = true;
                    }
                }
            }
        } else if (that.status_map[idf]["status"] === "LONG") {
            // 状态是LONG，但交易逻辑是dn break，因此有low_since_short
            if (new_bar) {
                that.status_map[idf]["bar_n"] += 1;
                if (that.status_map[idf]["bar_n"] !== 1) {
                    if (that.klines[idf]["low"][1] < that.status_map[idf]["ep"]) {
                        that.status_map[idf]["ep"] = that.klines[idf]["low"][1];
                        that.status_map[idf]["af"] += delta_af;
                        that.status_map[idf]["af"] = stratutils.transform_with_tick_size(that.status_map[idf]["af"], 0.01);
                    }
                    that.status_map[idf]["sar"] = that.status_map[idf]["sar"] + that.status_map[idf]["af"] * (that.status_map[idf]["ep"] - that.status_map[idf]["sar"]);
                    that.status_map[idf]["sar"] = stratutils.transform_with_tick_size(that.status_map[idf]["sar"], PRICE_TICK_SIZE[idf]);
                }
            } else {
                if (that.status_map[idf]["bar_n"] === 0) {
                    that.status_map[idf]["ep"] = Math.min(that.status_map[idf]["ep"], price);
                }
            }

            if (that.status_map[idf]["low_since_short"] !== undefined) {
                that.status_map[idf]["low_since_short"] = Math.min(that.status_map[idf]["low_since_short"], price);
            }

            let stoploss_price = Math.min(that.status_map[idf]["low_since_short"] * (1 + stoploss_rate), that.status_map[idf]["sar"]);
            stoploss_price = stratutils.transform_with_tick_size(stoploss_price, PRICE_TICK_SIZE[idf]);
            that.status_map[idf]["stoploss_price"] = stoploss_price;

            if (isNaN(stoploss_price)) {
                logger.info(`stoploss_price is null: ${that.status_map[idf]["low_since_short"]}, ${that.status_map[idf]["sar"]}, ${stoploss_rate}`)
            }

            // logger.info(`${symbol}::SHORT::${JSON.stringify(that.status_map[idf])}`);

            // 对手单已经sent，但是还没有成功submitted，不做任何处理
            if (that.status_map[idf]["anti_order_sent"] === true) return;

            // 开仓当天不作任何操作
            if (that.status_map[idf]["bar_n"] === 0) return;

            if (stoploss_price > up_price) {
                // up_price更低，对手单为反手单
                // 直接发LIMIT单等待成交，如果已经触发，就想办法在该Bar内成交；如果未触发，则一直等待；
                let tgt_qty = stratutils.transform_with_tick_size(that.status_map[idf]["pos"] + ini_usdt / up_price, QUANTITY_TICK_SIZE[idf]);
                if (that.order_map[idf]["ANTI_L"] === undefined) {
                    orders_to_be_submitted.push({ client_order_id: that.alias + LABELMAP["ANTI_L|REVERSE"] + randomID(7), label: "ANTI_L|REVERSE", target: "SHORT", quantity: tgt_qty, price: up_price, direction: DIRECTION.SELL });
                    that.status_map[idf]["anti_order_sent"] = true;
                } else {
                    let anti_client_order_id = that.order_map[idf]["ANTI_L"]["client_order_id"];
                    let anti_label = that.order_map[idf]["ANTI_L"]["label"];
                    let anti_price = that.order_map[idf]["ANTI_L"]["price"];
                    let anti_qty = that.order_map[idf]["ANTI_L"]["quantity"];

                    if ((anti_label !== "ANTI_L|REVERSE") || (anti_price !== up_price) || (anti_qty !== tgt_qty)) {
                        // 若已存的对手单（反手单）和现行不一致，则撤销重新发
                        orders_to_be_cancelled.push(anti_client_order_id);
                        orders_to_be_submitted.push({ client_order_id: that.alias + LABELMAP["ANTI_L|REVERSE"] + randomID(7), label: "ANTI_L|REVERSE", target: "SHORT", quantity: tgt_qty, price: up_price, direction: DIRECTION.SELL });
                        that.status_map[idf]["anti_order_sent"] = true;
                    }
                }

            } else {
                // 止损价（stoploss_price）更低，对手单为止损单
                // 直接发LIMIT单等待成交，如果已经触发，就想办法在该Bar内成交；如果未触发，则一直等待；
                let tgt_qty = stratutils.transform_with_tick_size(that.status_map[idf]["pos"], QUANTITY_TICK_SIZE[idf]);
                if (that.order_map[idf]["ANTI_L"] === undefined) {
                    orders_to_be_submitted.push({ client_order_id: that.alias + LABELMAP["ANTI_L|STOPLOSS"] + randomID(7), label: "ANTI_L|STOPLOSS", target: "EMPTY", quantity: tgt_qty, price: stoploss_price, direction: DIRECTION.SELL });
                    that.status_map[idf]["anti_order_sent"] = true;
                } else {
                    let anti_client_order_id = that.order_map[idf]["ANTI_L"]["client_order_id"];
                    let anti_label = that.order_map[idf]["ANTI_L"]["label"];
                    let anti_price = that.order_map[idf]["ANTI_L"]["price"];
                    let anti_qty = that.order_map[idf]["ANTI_L"]["quantity"];

                    if ((anti_label !== "ANTI_L|STOPLOSS") || (anti_price !== stoploss_price) || (anti_qty !== tgt_qty)) {
                        orders_to_be_cancelled.push(anti_client_order_id);
                        orders_to_be_submitted.push({ client_order_id: that.alias + LABELMAP["ANTI_L|STOPLOSS"] + randomID(7), label: "ANTI_L|STOPLOSS", target: "EMPTY", quantity: tgt_qty, price: stoploss_price, direction: DIRECTION.SELL });
                        that.status_map[idf]["anti_order_sent"] = true;
                    }
                }
            }
        }

        // logger.info(`orders_to_be_cancelled: ${orders_to_be_cancelled}`);
        orders_to_be_cancelled.forEach((client_order_id) => {
            that.cancel_order({
                exchange: exchange,
                symbol: symbol,
                contract_type: contract_type,
                client_order_id: client_order_id,
                account_id: act_id,
            });
        });

        // logger.info(JSON.stringify(orders_to_be_submitted));

        orders_to_be_submitted.forEach((order) => {
            let client_order_id = order.client_order_id, label = order.label, target = order.target, quantity = order.quantity, price = order.price, direction = order.direction;
            
            // 发送订单，同时建立order_map
            // {"3106609167": {"label": "DN", "target": "LONG", "quantity": 21133, "time": 1669492800445, "price": 0.04732, "filled": 0}}
            that.order_map[idf][client_order_id] = { label: label, target: target, quantity: quantity, time: moment.now(), filled: 0 };
            // {"ANTI_S": { "client_order_id": "3103898618",  "label": "ANTI_S|STOPLOSS", "price": 0.3214, "quantity": 100, "time": 1669492800445}}
            that.order_map[idf][label.slice(0, 6)] = { client_order_id: client_order_id, label: label, price: price, quantity: quantity, time: moment.now() };

            that.send_order({
                label: label,
                target: target,
                exchange: exchange,
                symbol: symbol,
                contract_type: contract_type,
                price: price,
                quantity: quantity,
                direction: direction,
                order_type: ORDER_TYPE.LIMIT,
                account_id: act_id,
                client_order_id: client_order_id
            });
        });
    }

    on_response(response) {

        // 过滤不属于本策略的response
        let ref_id = response["ref_id"];
        if (ref_id.slice(0, 3) !== this.alias) return;
        if (response.action !== REQUEST_ACTIONS.QUERY_ORDERS) {
            logger.info(`${this.alias}::on_${response.action}_response| ${JSON.stringify(response)}`);
        }

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
        let that = this;

        let action = response["action"];

        let exchange = response["request"]["exchange"];
        let symbol = response["request"]["symbol"];
        let contract_type = response["request"]["contract_type"];
        let client_order_id = response["request"]["client_order_id"];
        let act_id = response["request"]["account_id"];

        let target = response["request"]["target"];
        let quantity = response["request"]["quantity"];
        let direction = response["request"]["direction"];
        let price = response["request"]["price"];

        let label = client_order_id.slice(3, 5);
        if (!Object.values(LABELMAP).includes(label)) {
            logger.info(`${that.alias}::on_order_update|unknown order label ${label}!`);
            return;
        } else {
            label = stratutils.get_key_by_value(LABELMAP, label);   
        }

        let idf = [exchange, symbol, contract_type].join(".");
        let order_idf = [act_id, symbol, direction, label, client_order_id].join("|");

        if (response["metadata"]["metadata"]["result"] === false) {
            // 发单失败，1分钟后删除该订单信息
            setTimeout(() => delete that.order_map[idf][client_order_id], 1000 * 60);

            let error_code = response["metadata"]["metadata"]["error_code"];
            let error_code_msg = response["metadata"]["metadata"]["error_code_msg"];
            let retry = response["request"]["retry"];

            if (retry === 5) {
                that._send_alarm(`${that.alias}::${order_idf}::Send order retried over 5 times, check the code!`, ALARM_REASON.FAILED, true);
                return;
            } 

            // 所有的发单报错都会发邮件！
            logger.debug(`${that.alias}::on_response|${order_idf}::an error occured during ${action}: ${error_code}: ${error_code_msg}`);

            let resend = false, timeout = 10;    // 注意：这里不能用分号，只能用逗号！
            if ((error_code_msg === "Internal error; unable to process your request. Please try again.") || (error_code_msg === "Timestamp for this request is outside of the recvWindow.") || (error_code_msg === "Timestamp for this request is outside of the ME recvWindow.")) {
                // 如果是"Internal error; unable to process your request. Please try again." 重发
                // 如果是"Timestamp for this request is outside of the recvWindow."，通常是发单失败，同时response发送晚于预期
                // 选择重发
                resend = true;
            } else if (error_code_msg === "Error: socket hang up") {
                resend = true, timeout = 1000 * 2;
            } else if (error_code_msg.slice(0, 48) === 'Unexpected error happened: {"name":"SyntaxError"') {
                // 2秒后重发
                resend = true, timeout = 1000 * 2;
            } else if (error_code_msg.slice(0, 36) === 'RequestError: Error: read ECONNRESET') {
                // 2秒后重发
                resend = true, timeout = 1000 * 2;
            } else if (error_code_msg.slice(0, 20) === "Limit price can't be") {
                // 市价单价格发单限制，调整价格后重发
                let limit_price = parseFloat(error_code_msg.split(" ").slice(-1)[0]);
                let adj_price = stratutils.transform_with_tick_size(limit_price, PRICE_TICK_SIZE[idf]);

                let limit_type = error_code_msg.split(" ")[4];
                if ((limit_type === "higher") && (adj_price > limit_price)) {
                    adj_price = stratutils.transform_with_tick_size(adj_price - PRICE_TICK_SIZE[idf], PRICE_TICK_SIZE[idf]);
                } else if ((limit_type === "lower") && (adj_price < limit_price)) {
                    adj_price = stratutils.transform_with_tick_size(adj_price + PRICE_TICK_SIZE[idf], PRICE_TICK_SIZE[idf]);
                } else {
                    logger.info(`${that.alias}::${order_idf}::limit_type: ${limit_type}.`);
                }

                logger.info(`${that.alias}::${order_idf}::order out of limitation, change from ${price} to ${adj_price}.`);

                price = adj_price, resend = true;

            } else if (error_code_msg === "Exceeded the maximum allowable position at current leverage.") {
                // 杠杆问题，降低杠杆
                let key = KEY[act_id];
                let url = "https://fapi.binance.com/fapi/v1/leverage";
                stratutils.set_leverage_by_rest(symbol, 10, url, key);

                logger.info(`${that.alias}::${order_idf}::change leverage to 10 and resent the order.`);
                resend = true; 
                timeout = 1000 * 2;
            
            } else if (error_code_msg === "Unknown order sent.") {
                // 注意检查
                logger.debug("Unknown order sent during placing order? Please check!");
            } else if (error_code_msg === "Price less than min price.") {
                // 价格低于最低发单价，通常是DN单，那就不设置DN单
                if (label === "DN") {
                    that.status_map[idf]["DN"] = undefined;
                } else {
                    logger.info(`${that.alias}::${order_idf}::price less than min, but not a DN order, check!`);
                }
            } else if (error_code_msg === "Order would immediately trigger.") {
                // The order would be triggered immediately, STOP order才会报这样的错，本策略都是LIMIT ORDER
            } else {
                that._send_alarm(`${that.alias}::on_response|${order_idf}::unknown error occured during ${action}: ${error_code}: ${error_code_msg}`, ALARM_REASON.FAILED, true);
                return;
            }
            that._send_alarm(`${that.alias}::on_response|${order_idf}::an error occured during ${action}: ${error_code}: ${error_code_msg}`, ALARM_REASON.FAILED, false);

            if (resend) {
                logger.info(`${that.alias}::${order_idf}::resend the order in ${timeout} ms!`);
                setTimeout(() => {
                    retry = (retry === undefined) ? 1 : retry + 1; 
                    let new_client_order_id = that.alias + LABELMAP[label] + randomID(7);
                    
                    // 注意：order_map里面的key只有ANTI_L, ANTI_S, UP, DN四种；
                    // 但是label有六种！
                    that.order_map[idf][new_client_order_id] = {label: label, target: target, quantity: quantity, time: moment.now(), filled: 0};
                    that.order_map[idf][label.slice(0, 6)] = { client_order_id: new_client_order_id, label: label, price: price, quantity: quantity, time: moment.now() };
    
                    that.send_order({
                        retry: retry,
                        label: label,
                        target: target,
                        exchange: exchange,
                        symbol: symbol,
                        contract_type: contract_type,
                        price: price,
                        quantity: quantity, 
                        direction: direction,
                        order_type: ORDER_TYPE.LIMIT,
                        account_id: act_id,
                        client_order_id: new_client_order_id
                    });
                }, timeout);
            }
        } else {
            // 订单发送成功
            logger.info(`${this.alias}::on_response|${order_idf} submitted!`);
        }
    }

    on_cancel_order_response(response) {
        let that = this;

        let action = response["action"];

        // 用request里面的数据比较保险
        let exchange = response["request"]["exchange"];
        let symbol = response["request"]["symbol"];
        let contract_type = response["request"]["contract_type"];
        let act_id = response["request"]["account_id"];
        let client_order_id = response["request"]["client_order_id"];
        // 如果报错，返回的metadata里面没有direction
        let direction = response["request"]["direction"];

        let label = client_order_id.slice(3, 5);
        if (!Object.values(LABELMAP).includes(label)) {
            logger.info(`${that.alias}::on_order_update|unknown order label ${label}!`);
            return;
        } else {
            label = stratutils.get_key_by_value(LABELMAP, label);   
        }

        let idf = [exchange, symbol, contract_type].join(".");
        let order_idf = [act_id, symbol, direction, label, client_order_id].join("|");

        if (response["metadata"]["metadata"]["result"] === false) {
            //撤单失败
            let error_code = response["metadata"]["metadata"]["error_code"];
            let error_code_msg = response["metadata"]["metadata"]["error_code_msg"];
            let retry = response["request"]["retry"];

            if (retry === 5) {
                that._send_alarm(`${that.alias}::${order_idf}::Cancel order retried over 5 times, check the code!`, ALARM_REASON.FAILED, true);
                return;
            } 

            //所有的撤单失败也会发邮件报警
            logger.debug(`${that.alias}::on_response|${order_idf}::an error occured during ${action}: ${error_code}: ${error_code_msg}`);

            let recancel = false, timeout = 10;     // 注意：这里不能用分号
            if ((error_code_msg === "Internal error; unable to process your request. Please try again.") || (error_code_msg === "Timestamp for this request is outside of the recvWindow.") || (error_code_msg === "Timestamp for this request is outside of the ME recvWindow.") || (error_code_msg === "Unexpected error happened")) {
                // 重新撤单
                recancel = true;
            } else if (error_code_msg === "Error: socket hang up") {
                recancel = true, timeout = 1000 * 2;
            } else if (error_code_msg.slice(0, 48) === 'Unexpected error happened: {"name":"SyntaxError"') {
                // 2秒后重新撤单
                recancel = true, timeout = 1000 * 2;
            } else if (error_code_msg.slice(0, 36) === 'RequestError: Error: read ECONNRESET') {
                // 2秒后重新撤单
                recancel = true, timeout = 1000 * 2;
            } else {
                that._send_alarm(`${that.alias}::on_response|${order_idf}::unknown error occured during ${action}: ${error_code}: ${error_code_msg}`, '01', true);
                return;
            }

            that._send_alarm(`${that.alias}::on_response|${order_idf}::an error occured during ${action}: ${error_code}: ${error_code_msg}`, '01', false);

            if (recancel) {
                logger.info(`${that.alias}::${order_idf}::recancel the order in ${timeout} ms!`);
                setTimeout(() => {
                    retry = (retry === undefined) ? 1 : retry + 1; 
                    that.cancel_order({
                        retry: retry,
                        exchange: exchange,
                        symbol: symbol,
                        contract_type: contract_type,
                        client_order_id: client_order_id,
                        account_id: act_id,
                    });
                }, timeout);
            }
        } else {
            logger.info(`${that.alias}::on_response|${order_idf} cancelled!`);
        }
    }

    on_query_orders_response(response) {
        let that = this;

        let exchange = response["request"]["exchange"];
        let symbol = response["request"]["symbol"];
        let contract_type = response["request"]["contract_type"];
        let act_id = response["request"]["account_id"];
        let idf = [exchange, symbol, contract_type].join(".");

        if (response["metadata"]["metadata"]["result"] === false) {
            let error_code = response["metadata"]["metadata"]["error_code"];
            let error_code_msg = response["metadata"]["metadata"]["error_code_msg"];
            logger.debug(`${that.alias}::${symbol} an error occured during query orders: ${error_code}: ${error_code_msg}`);
            return
        }

        let orders = response["metadata"]["metadata"]["orders"];
        let active_orders = orders.map(item => item["client_order_id"]);

        // client_order_id|direction|filled|original_amount@price
        let active_orders_string = orders.filter(item => item.client_order_id.slice(0, 3) === that.alias).map(item => `${item["client_order_id"]}|${item["direction"]}|${item["filled"]}|${item["original_amount"]}@${item["price"]}`);
        active_orders_string = active_orders_string.join(", ")

        // 检查异常单
        let wierd_orders = orders.filter(item => !ALIASES.includes(item.client_order_id.slice(0, 3)));
        if (wierd_orders.length !== 0) {
            that._send_alarm(`${that.alias}::wierd orders found: ${JSON.stringify(wierd_orders)}`, ALARM_REASON.BUG, false);
        }

        // logger.info(`${that.alias}::${symbol} active_orders| ${active_orders_string}`);

        let order_map_string = [];

        for (let [key, value] of Object.entries(that.order_map[idf])) {
            if (["UP", "DN", "ANTI_L", "ANTI_S"].includes(key)) {
                // 如"DN": { "client_order_id": "5552202427", "label": "DN", "price": 0.1843, "quantity": 2713, "time": 1674091084105 }
                let client_order_id = value["client_order_id"];
                let time = value["time"];;
                let label = value["label"];
                let price = value["price"];
                let quantity = value["quantity"];
                order_map_string.push(`${client_order_id}|${label}|${quantity}@${price}`);

                if ((!active_orders.includes(client_order_id)) && (moment.now() - time > 1000 * 60 * 10)) {
                    logger.debug(`${that.alias}::${symbol}|${key}|${client_order_id}::order not active (label as key) and submitted over 10 min before, will be deleted, please check it!`);
                    that._send_alarm(`${that.alias}::${symbol}|${key}|${client_order_id}::order not active (label as key) and submitted over 10 min before, will be deleted, please check it!`, '04', false);
                    
                    if (that.order_map[idf][key]["ToBeDeleted"]) {
                        delete that.order_map[idf][key];
                    } else {
                        that.order_map[idf][key]["ToBeDeleted"] = true;
                    }
                    
                }
            } else {
                // 如{"3106609167": {"label": "DN", "target": "LONG", "quantity": 21133, "time": 1669492800445, "price": 0.04732, "filled": 0}}
                let label = value["label"];
                let time = value["time"];

                order_map_string.push(key);

                if (!(active_orders.includes(key)) && (moment.now() - time > 1000 * 60 * 10)) {
                    // 该order不在active orders里面，并且距今已经超过10分钟，直接删掉
                    logger.debug(`${that.alias}::${symbol}|${label}|${key}::order not active (client_order_id as key) and submitted over 10 min before, will be deleted, please check it!`);
                    that._send_alarm(`${that.alias}::${symbol}|${label}|${key}::order not active (client_order_id as key) and submitted over 10 min before, will be deleted, please check it!`, '04', false);

                    if (that.order_map[idf][key]["ToBeDeleted"]) {
                        delete that.order_map[idf][key];
                    } else {
                        that.order_map[idf][key]["ToBeDeleted"] = true;
                    }

                }
            }
        }

        order_map_string = order_map_string.join(", ");

        let index = that.cfg["idfs"].indexOf(idf);
        let item = {};
        item[`${index + 1}|idf`] = idf;
        item[`${index + 1}|order_map`] = order_map_string;
        item[`${index + 1}|active_orders`] = active_orders_string;
        let data = [item];
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
}

var revTrendStrategy = new RevTrendStrategy("RevTrend", "R01");
revTrendStrategy.start();