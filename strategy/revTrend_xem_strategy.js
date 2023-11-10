require("../config/typedef.js");
const fs = require("fs");
const moment = require("moment");
const assert = require("assert");
const randomID = require("random-id");

const Intercom = require("../module/intercom");
const logger = require("../module/logger.js");
const request = require('../module/request.js');
const utils = require("../utils/util_func");
const stratutils = require("../utils/strat_util.js");
const StrategyBase = require("./strategy_base.js");

class RevTrendXEMStrategy extends StrategyBase {
    constructor(name, alias, intercom) {
        super(name, alias, intercom);

        this.cfg = require(`../config/cfg_${alias}.json`);

        this.init_status_map();
        this.init_order_map();  // this will set order_map to be empty
        this.init_summary();

        // idf::exchange.symbol.contract_type
        this.prices = {};
        this.klines = {}
        this.cur_bar_otime = {};
        this.pre_bar_otime = {};

        // set-up
        this.contract_type = CONTRACT_TYPE.PERP;
    }

    start() {
        this._register_events();
        this.subscribe_market_data();

        this.load_klines();

        setInterval(() => {
            fs.writeFile(`./config/status_map_${this.alias}.json`, JSON.stringify(this.status_map), function (err) {
                if (err) logger.info(`${this.alias}::err`);
            });
            fs.writeFile(`./config/order_map_${this.alias}.json`, JSON.stringify(this.order_map), function (err) {
                if (err) logger.info(`${this.alias}::err`);
            });
            this.refresh_ui();
        }, 1000 * 3);

        setInterval(() => {
            // 每隔1分钟查询一下active orders
            this.query_active_orders();
        }, 1000 * 60 * 1);

        setInterval(() => {
            // 每隔1小时将status_map做一个记录
            let ts = moment().format('YYYYMMDDHHmmssSSS'), month = moment().format('YYYY-MM');
            fs.writeFile(`./log/status_map_${this.alias}_${month}.log`, ts + ": " + JSON.stringify(this.status_map) + "\n", { flag: "a+" }, (err) => {
                if (err) logger.info(`${this.alias}::err`);
            });
        }, 1000 * 60 * 60);
    }

    refresh_ui() {
        let that = this;
        let sendData = {
            "tableName": this.alias,
            "tabName": "PortfolioMonitor",
            "data": []
        }

        that.cfg["entries"].forEach((entry, index) => {
            if (!(entry in that.status_map)) return;
            let item = {};
            let idf  = entry.split(".").slice(0, 3).join(".");
            item[`${index + 1}|entry`] = entry;
            item[`${index + 1}|status`] = that.status_map[entry]["status"];
            item[`${index + 1}|triggered`] = that.status_map[entry]["triggered"];
            item[`${index + 1}|pos`] = that.status_map[entry]["pos"];
            item[`${index + 1}|fee`] = that.status_map[entry]["fee"];
            item[`${index + 1}|np`] = that.status_map[entry]["net_profit"];
            item[`${index + 1}|price`] = (that.prices[idf])? that.prices[idf]["price"]: "";
            item[`${index + 1}|sp`] = that.status_map[entry]["stoploss_price"];
            item[`${index + 1}|up`] = that.status_map[entry]["up"];
            item[`${index + 1}|dn`] = that.status_map[entry]["dn"];
            sendData["data"].push(item);
        });

        this.intercom.emit("UI_update", sendData, INTERCOM_SCOPE.UI);
    }

    query_active_orders() {
        this.query_orders({
            exchange: EXCHANGE.BINANCEU,
            contract_type: CONTRACT_TYPE.PERP,
            account_id: "th_binance_cny_sub01"
        });
    }

    init_order_map() {
        let that = this;

        // 注意exists和require的路径设置是不一样的
        that.order_map = (!fs.existsSync(`./config/order_map_${that.alias}.json`)) ? {} : require(`../config/order_map_${that.alias}`);

        // TODO: how to differ from new_start and first initialization
        that.cfg["entries"].forEach((entry) => {
            if (that.cfg["clear_existing_status"]) {
                that.order_map[entry] = {};
            } else {
                that.order_map[entry] = (that.order_map[entry]) ? that.order_map[entry] : {};
            }
        });
    }

    init_status_map() {
        let that = this;

        that.status_map = (!fs.existsSync(`./config/status_map_${that.alias}.json`)) ? {} : require(`../config/status_map_${that.alias}`);

        that.cfg["entries"].forEach((entry) => {
            if ((that.status_map[entry] === undefined) || (that.cfg["clear_existing_status"])) {
                that.status_map[entry] = {
                    "status": "EMPTY",
                    "anti_order_sent": false,
                    "pos": 0,
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
        let status_list = that.cfg["entries"].map((entry) => that.status_map[entry]["status"]);
        let long_num = status_list.map((element) => element === "LONG").reduce((a, b) => a + b, 0);
        let short_num = status_list.map((element) => element === "SHORT").reduce((a, b) => a + b, 0);
        that.summary["overall"]["long_num"] = long_num;
        that.summary["overall"]["short_num"] = short_num;
    }

    load_klines() {
        logger.info("Loading the klines from https://fapi.binance.com/fapi/v1/klines/");
        let that = this;

        that.cfg["entries"].forEach((entry) => {
            let interval = entry.split(".")[3];
            assert(["1d", "12h", "8h", "6h", "4h", "3h", "2h", "1h", "30m", "15m", "5m"].includes(interval));
            that.klines[entry] = { "ts": [], "open": [], "high": [], "low": [], "ready": false };
            let symbol = entry.split(".")[1];

            if (interval.endsWith("m")) { 
                let num = parseInt(interval.split("m")[0]);
                let n_klines = that.cfg[entry]["track_ATR_n"] + 1;
                let url = "https://fapi.binance.com/fapi/v1/klines/?symbol=" + symbol + "&contractType=PERPETUAL&interval=" + interval + "&limit=" + n_klines;
                request.get({
                    url: url, json: true
                }, function (error, res, body) {
                    for (let i = body.length - 1; i >= 0; i--) {
                        let ts = utils.get_human_readable_timestamp(body[i][0]);
                        that.klines[entry]["ts"].push(ts);
                        that.klines[entry]["open"].push(parseFloat(body[i][1]));
                        that.klines[entry]["high"].push(parseFloat(body[i][2]));
                        that.klines[entry]["low"].push(parseFloat(body[i][3]));
                    }
                });
            } else {
                let num = (interval === "1d") ? 24 : parseInt(interval.split("h")[0]);
                let n_klines = (that.cfg[entry]["track_ATR_n"] + 1) * num;
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
                        if ((interval === "1h") || (hour % num === that.cfg[entry]["splitAt"])) {
                            that.klines[entry]["ts"].push(ts);
                            that.klines[entry]["open"].push(parseFloat(body[i][1]));
                            that.klines[entry]["high"].push(high);
                            that.klines[entry]["low"].push(low);
                            high = Number.NEGATIVE_INFINITY;
                            low = Number.POSITIVE_INFINITY;
                        }
                    }
                });
            }


            setTimeout(() => {
                that.klines[entry]["ready"] = true;
            }, 5000);
        });
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
        let interval = (client_order_id.slice(3, 4) === "0")? client_order_id.slice(4, 6): client_order_id.slice(3, 6);
        let track_ATR_multiplier_str = client_order_id.slice(6, 9);
        let entry = [exchange, symbol, contract_type, interval, track_ATR_multiplier_str].join(".");

        // 不是本策略的订单更新，自动过滤
        // XEM01h020UPXCcikxD
        if (client_order_id.slice(0, 3) !== that.alias) return;
        logger.info(`${that.alias}|${client_order_id}::on_order_update|${JSON.stringify(order_update)}!`);

        let label = client_order_id.slice(9, 11);
        if (!Object.values(LABELMAP).includes(label)) {
            logger.info(`${that.alias}|${client_order_id}::on_order_update|unknown order label ${label}!`);
            return;
        }
        label = stratutils.get_key_by_value(LABELMAP, label);
        let order_idf = [act_id, entry, label, client_order_id].join("|");

        if (order_status === ORDER_STATUS.SUBMITTED) {
            let submit_price = order_update["order_info"]["submit_price"];
            let original_amount = order_update["order_info"]["original_amount"];
            logger.info(`${that.alias}::on_order_update|${order_idf} order ${original_amount} placed @${submit_price} after ${update_type}!`);

            // 对手单发送成功，5秒后允许修改对手单
            // 为了尽可能避免触发quantitative rules，这里设置为5秒
            if (label.slice(0, 4) === "ANTI") {
                setTimeout(() => that.status_map[entry]["anti_order_sent"] = false, 1000 * 5);
            }

        } else if (order_status === ORDER_STATUS.CANCELLED) {
            logger.info(`${that.alias}::on_order_update|${order_idf} order cancelled after ${update_type}!`);
            if (update_type === "cancelled") {
                // 订单已经撤销，100毫秒后从order_map中删除该订单（1分钟之后的原因是防止on_response还要用）
                logger.info(`${that.alias}::on_order_update|${order_idf} order cancelled, will be removed from order_map in 200ms!`);
                setTimeout(() => delete that.order_map[entry][client_order_id], 100);
            } else if (update_type === "expired") {
                // Just expired (usually the stop order triggered), Do nothing here!
            } else {
                logger.info(`${that.alias}::Unhandled update type: ${update_type}`);
            }
        } else if ((order_status === ORDER_STATUS.FILLED) || (order_status === ORDER_STATUS.PARTIALLY_FILLED)) {
            let original_amount = order_update["order_info"]["original_amount"];
            let filled = order_update["order_info"]["filled"];
            let new_filled = order_update["order_info"]["new_filled"];
            let submit_price = order_update["order_info"]["submit_price"];
            let avg_executed_price = order_update["order_info"]["avg_executed_price"];
            let fee = order_update["metadata"]["fee"];

            logger.info(`${that.alias}::on_order_update|${order_idf} order ${filled}/${original_amount} filled @${avg_executed_price}/${submit_price}!`);

            // 对于UP ORDER无论是完全成交还是部分成交，都撤销DN ORDER；DN ORDER同理
            // "DN"如果还在order_map里面，说明还没被撤销；如果不在了，说明已经撤销了，不需要再进行撤销
            // 同理："UP"如果还在order_map里面，说明还没被撤销；如果不在了，说明已经撤销了，不需要再进行撤销
            if ((label === "UP") && ("DN" in that.order_map[entry])) {
                // The UP ORDER got filled, cancel the DN order
                that.cancel_order({
                    exchange: exchange,
                    symbol: symbol,
                    contract_type: contract_type,
                    client_order_id: that.order_map[entry]["DN"]["client_order_id"],
                    account_id: act_id,
                });
                // 这里删除label，在on_order_update里面删除client_order_id
                delete that.order_map[entry]["DN"];
            } else if ((label === "DN") && ("UP" in that.order_map[entry])) {
                // The DN ORDER got filled, cancel the UP order
                that.cancel_order({
                    exchange: exchange,
                    symbol: symbol,
                    contract_type: contract_type,
                    client_order_id: that.order_map[entry]["UP"]["client_order_id"],
                    account_id: act_id,
                });
                // 这里删除label，在on_order_update里面删除client_order_id
                delete that.order_map[entry]["UP"];
            }

            // 更新order_map
            that.order_map[entry][client_order_id]["filled"] = filled;

            // 更新position
            that.status_map[entry]["pos"] += (direction === DIRECTION.BUY) ? new_filled : - new_filled;
            that.status_map[entry]["fee"] += fee;
            that.status_map[entry]["quote_ccy"] += (direction === DIRECTION.SELL) ? new_filled * avg_executed_price : - new_filled * avg_executed_price;

            that.status_map[entry]["pos"] = stratutils.transform_with_tick_size(that.status_map[entry]["pos"], QUANTITY_TICK_SIZE[idf]);
            that.status_map[entry]["fee"] = stratutils.transform_with_tick_size(that.status_map[entry]["fee"], 0.001);
            that.status_map[entry]["quote_ccy"] = stratutils.transform_with_tick_size(that.status_map[entry]["quote_ccy"], 0.01);

            // 检查一下status_map变化
            logger.info(`${that.alias}|${entry}::${JSON.stringify(that.status_map[entry])}`);
            logger.info(`${that.alias}|${entry}::${JSON.stringify(that.order_map[entry])}`);

            if (order_status === ORDER_STATUS.FILLED) {
                // 订单完全成交，更新status_map
                that.status_map[entry]["status"] = that.order_map[entry][client_order_id]["target"];

                // 订单完全成交，不再是触发状态
                // 如果赋值为undefined，在UI那边会缓存为之前的那个值，影响判断，所以这里赋值为""
                that.status_map[entry]["triggered"] = "";
                if (that.status_map[entry]["status"] === "EMPTY") {
                    // 订单完全成交，仓位变为空，这说明是平仓单
                    // 把that.pre_bar_otime[idf]变成undefined，这样就变成new_start，可以重新发开仓单
                    // 有可能会出现依然无法重新发开仓单的情况，这种大概率是因为bar_enter_n没有进行更新
                    that.pre_bar_otime[entry] = undefined;
                    that.status_map[entry]["anti_order_sent"] = undefined;
                    for (let item of ["bar_n", "ep", "af", "sar", "long_enter", "high_since_long", "short_enter", "low_since_short", "stoploss_price"]) {
                        that.status_map[entry][item] = "";
                    }
                } else {
                    let cutloss_rate = that.cfg[entry]["cutloss_rate"];

                    that.status_map[entry]["bar_n"] = 0;
                    that.status_map[entry]["af"] = that.cfg[entry]["ini_af"];
                    that.status_map[entry]["bar_enter_n"] += 1;
                    that.status_map[entry]["ep"] = avg_executed_price;

                    if (that.status_map[entry]["status"] === "LONG") {
                        // 仓位变为LONG，但实际上是dn break，因此用low_sinc_short
                        that.status_map[entry]["long_enter"] = "";
                        that.status_map[entry]["high_since_long"] = "";
                        that.status_map[entry]["short_enter"] = avg_executed_price;
                        that.status_map[entry]["low_since_short"] = avg_executed_price;
                        that.status_map[entry]["sar"] = avg_executed_price * (1 + cutloss_rate);
                    } else {
                        // 仓位变为SHORT，但实际上是up break，因此用high_since_long
                        that.status_map[entry]["long_enter"] = avg_executed_price;
                        that.status_map[entry]["high_since_long"] = avg_executed_price;
                        that.status_map[entry]["short_enter"] = "";
                        that.status_map[entry]["low_since_short"] = "";
                        that.status_map[entry]["sar"] = avg_executed_price * (1 - cutloss_rate);
                    }

                    that.status_map[entry]["ep"] = stratutils.transform_with_tick_size(that.status_map[entry]["ep"], PRICE_TICK_SIZE[idf]);
                    that.status_map[entry]["sar"] = stratutils.transform_with_tick_size(that.status_map[entry]["sar"], PRICE_TICK_SIZE[idf]);
                }

                // 订单完全成交，在order_map中删去该订单（注意：完全成交才删除，且当场删除！）
                delete that.order_map[entry][label.slice(0, 6)];

                // remove the client_order_id from order_map 100ms later, as the on_response may need to use it!
                setTimeout(() => delete that.order_map[entry][client_order_id], 100);

                // 检查LONG和SHORT的个数
                let status_list = that.cfg["entries"].map((entry) => that.status_map[entry]["status"]);
                let long_num = status_list.map((element) => element === "LONG").reduce((a, b) => a + b, 0);
                let short_num = status_list.map((element) => element === "SHORT").reduce((a, b) => a + b, 0);
                that.summary["overall"]["long_num"] = long_num;
                that.summary["overall"]["short_num"] = short_num;
            } else {
                // 订单部分成交，处于触发状态
                that.status_map[entry]["status"] = "TBA";
                that.status_map[entry]["triggered"] = label;
            }

            // record the order filling details
            let ts = order_update["metadata"]["timestamp"];
            let filled_info = [act_id, entry, exchange, symbol, contract_type, interval, client_order_id, original_amount, filled, submit_price, avg_executed_price, fee].join(",");
            let order_info = (that.order_map[entry][client_order_id] === undefined) ? "" : Object.entries(that.order_map[entry][client_order_id]).filter((element) => element[0] !== "ToBeDeleted").map((element) => element[1]).join(",");
            let output_string = [ts, filled_info, order_info].join(",");
            output_string += (order_status === ORDER_STATUS.FILLED) ? ",filled\n" : ",partially_filled\n";
            fs.writeFile(`./log/order_filling_${this.alias}.csv`, output_string, { flag: "a+" }, (err) => {
                if (err) logger.info(`${this.alias}::${err}`);
            });
        } else {
            logger.info(`${this.alias}::on_order_update|Unhandled order update status: ${order_status}!`)
        }
    }

    on_response(response) {
        // 过滤不属于本策略的response
        let ref_id = response["ref_id"];
        if (response.action !== REQUEST_ACTIONS.QUERY_ORDERS) {
            logger.info(`${this.alias}::on_${response.action}_response| ${JSON.stringify(response)}`);
        }
        
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

    _on_market_data_trade_ready(trade) {
        let that = this;

        let exchange = trade["exchange"];
        let symbol = trade["symbol"];
        let contract_type = trade["contract_type"];
        let price = trade["metadata"][0][2];
        let ts = trade["metadata"][0][1];

        let idf = [exchange, symbol, contract_type].join(".");

        if (!that.cfg["idfs"].includes(idf)) return;
        that.prices[idf] = { "price": price, "upd_ts": ts };

        let corr_entries = that.cfg["entries"].filter((entry) => entry.split(".").slice(0, 3).join(".") === idf);
        for (let entry of corr_entries) {
            if (!that.klines[entry]["ready"]) return;

            let interval = entry.split(".")[3];
            // logger.info(symbol, ts, that.cur_bar_otime[entry], that.pre_bar_otime[idf]);
            that.cur_bar_otime[entry] = stratutils.cal_bar_otime(ts, interval, that.cfg[entry]["splitAt"]);
            // if the pre_bar_otime is undefined, it means the strategy is re-started
            let new_start = (that.pre_bar_otime[entry] === undefined);
            // new interal is not new_start, new bar means a new bar starts
            let new_bar = (!new_start) && (that.cur_bar_otime[entry] !== that.pre_bar_otime[entry]);

            if (new_start) {
                logger.info(`${that.alias}::${entry}::NEW START!`);
            } else if (new_bar) {
                logger.info(`${that.alias}::${entry}::NEW BAR!`);
                // 如果一些订单已经触发但是迟迟不能成交，必须进行处理
                // TODO: 如果在new_bar的一瞬间正在部分成交（虽然是小概率事件），怎么办？
                that.status_map[entry]["bar_enter_n"] = 0;
                if (that.status_map[entry]["status"] === "TBA") that.deal_with_TBA(entry);
            }

            // 更新kline数据，这里应该用>会不会更好？
            if (that.cur_bar_otime[entry] > that.klines[entry]["ts"][0]) {
                that.klines[entry]["ts"].unshift(that.cur_bar_otime[entry]);
                that.klines[entry]["ts"].pop();
                that.klines[entry]["open"].unshift(price);
                that.klines[entry]["open"].pop();
                that.klines[entry]["high"].unshift(price);
                that.klines[entry]["high"].pop();
                that.klines[entry]["low"].unshift(price);
                that.klines[entry]["low"].pop();
            } else if (that.cur_bar_otime[entry] === that.klines[entry]["ts"][0]) {
                that.klines[entry]["high"][0] = Math.max(price, that.klines[entry]["high"][0]);
                that.klines[entry]["low"][0] = Math.min(price, that.klines[entry]["low"][0]);
            } else {
                logger.debug(`${that.alias}::${entry}::cur_bar_otime is smaller than klines ts[0]?`);
            }

            // update bar open time and net_profit
            that.pre_bar_otime[entry] = that.cur_bar_otime[entry];

            // 下单逻辑模块
            that.status_map[entry]["net_profit"] = that.status_map[entry]["quote_ccy"] + that.status_map[entry]["pos"] * price - that.status_map[entry]["fee"];
            that.status_map[entry]["net_profit"] = stratutils.transform_with_tick_size(that.status_map[entry]["net_profit"], 0.01);
            that.main_execuation(new_start, new_bar, entry);
        }
    }

    deal_with_TBA(entry) {
        logger.info(`${this.alias}|${entry}::deal with TBA: ${JSON.stringify(this.order_map)}`);
        let that = this;
        let [exchange, symbol, contract_type, interval, track_ATR_multiplier_str] = entry.split(".");
        let act_id = that.cfg[entry]["act_id"];
        let idf =  [exchange, symbol, contract_type].join(".");

        let triggered = that.status_map[entry]["triggered"];
        let up_price = that.status_map[entry]["up"];
        let dn_price = that.status_map[entry]["dn"];

        let cutloss_rate = that.cfg[entry]["cutloss_rate"];
        let orders_to_be_cancelled = [];
        let orders_to_be_submitted = [];

        if (triggered === "UP") {
            // 开仓单开了一半，剩下的撤单，直接转为对应的status
            logger.info(`${that.alias}::${act_id}|${idf} deal with TBA: cancel the remaining UP order!`);
            let up_client_order_id = that.order_map[entry]["UP"]["client_order_id"];
            orders_to_be_cancelled.push(up_client_order_id);
            that.status_map[entry]["status"] = "SHORT";
        } else if (triggered === "DN") {
            // 开仓单开了一半，剩下的放弃，直接转为对应的status
            logger.info(`${that.alias}::${act_id}|${idf} deal with TBA: cancel the remaining DN order!`);
            let dn_client_order_id = that.order_map[entry]["DN"]["client_order_id"];
            orders_to_be_cancelled.push(dn_client_order_id);
            that.status_map[entry]["status"] = "LONG";
        } else if ((triggered === "ANTI_L|STOPLOSS") || (triggered === "ANTI_L|REVERSE")) {
            // 平仓单未能成交，撤销该单，改用市价单成交
            // 反手单未能成交，撤销该单，放弃反手，改为市价平仓
            let anti_client_order_id = that.order_map[entry]["ANTI_L"]["client_order_id"];
            orders_to_be_cancelled.push(anti_client_order_id);

            if (that.status_map[entry]["pos"] < 0) {
                // 已经部分反手，放弃剩下的反手
                logger.info(`${that.alias}::${act_id}|${idf} deal with TBA: cancel the remaining ANTI_L order!`);
                that.status_map[entry]["status"] = "SHORT";
            } else if (that.status_map[entry]["pos"] === 0) {
                // 已经平仓，放弃剩下的反手
                logger.info(`${that.alias}::${act_id}|${idf} deal with TBA: cancel the remaining ANTI_L order!`);
                that.status_map[entry]["status"] = "EMPTY";
            } else {
                // 部分平仓，要求继续平仓，市价的0.97倍折出售，放弃剩下的反手
                // 因为binance对限价单价格有限制，通常不能超过标记价格的5%
                logger.info(`${that.alias}::${act_id}|${idf} deal with TBA: cover the LONG position!`);
                let tgt_qty = that.status_map[entry]["pos"];
                let sell_price = stratutils.transform_with_tick_size(that.prices[idf]["price"] * 0.97, PRICE_TICK_SIZE[idf]);
                orders_to_be_submitted.push({ client_order_id: that.alias + interval.padStart(3, '0') + track_ATR_multiplier_str + LABELMAP["ANTI_L|STOPLOSS"] + randomID(7), label: "ANTI_L|STOPLOSS", target: "EMPTY", quantity: tgt_qty, price: sell_price, direction: DIRECTION.SELL });
            }
        } else if ((triggered === "ANTI_S|STOPLOSS") || (triggered === "ANTI_S|REVERSE")) {
            // 平仓单未能成交，撤销该单，改用市价单成交
            // 反手单未能成交，撤销该单，放弃反手，改为市价平仓
            let anti_client_order_id = that.order_map[entry]["ANTI_S"]["client_order_id"];
            orders_to_be_cancelled.push(anti_client_order_id);

            if (that.status_map[entry]["pos"] > 0) {
                // 已经部分反手，放弃剩下的反手
                logger.info(`${that.alias}::${act_id}|${idf} deal with TBA: cancel the remaining ANTI_S order!`);
                that.status_map[entry]["status"] = "LONG";
            } else if (that.status_map[entry]["pos"] === 0) {
                // 已经平仓，放弃剩下的反手
                logger.info(`${that.alias}::${act_id}|${idf} deal with TBA: cancel the remaining ANTI_S order!`);
                that.status_map[entry]["status"] = "EMPTY";
            } else {
                // 部分平仓，要求继续平仓，市价1.03倍购买，放弃剩下的反手
                // 因为binance对限价单价格有限制，通常不能超过标记价格的5%
                logger.info(`${that.alias}::${act_id}|${entry} deal with TBA: cover the SHORT position!`);
                let tgt_qty = - that.status_map[entry]["pos"];
                let buy_price = stratutils.transform_with_tick_size(that.prices[idf]["price"] * 1.03, PRICE_TICK_SIZE[idf]);
                orders_to_be_submitted.push({ client_order_id: that.alias + interval.padStart(3, '0') + track_ATR_multiplier_str + LABELMAP["ANTI_S|STOPLOSS"] + randomID(7), label: "ANTI_S|STOPLOSS", target: "EMPTY", quantity: tgt_qty, price: buy_price, direction: DIRECTION.BUY });
            }
        } else {
            logger.info(`${that.alias}|${entry}::TBA and new_bar handling: unhandled ${that.status_map[entry]["triggered"]}. If nothing, ignore it!`)
        }

        let current_status = that.status_map[entry]["status"];
        if (["LONG", "SHORT"].includes(current_status)) {
            that.status_map[entry]["bar_n"] = 0;    // 这里赋值为0，之后main_execuation中会加一
            that.status_map[entry]["af"] = that.cfg[entry]["ini_af"];
            that.status_map[entry]["sar"] = (current_status === "SHORT") ? up_price * (1 - cutloss_rate) : dn_price * (1 + cutloss_rate);;
            if (current_status === "SHORT") {
                that.status_map[entry]["long_enter"] = up_price;
                that.status_map[entry]["high_since_long"] = up_price;
            } else {
                that.status_map[entry]["short_enter"] = dn_price;
                that.status_map[entry]["low_since_short"] = dn_price;
            }
        }

        logger.info(`${this.alias}|${entry}:: ${JSON.stringify(that.status_map[entry])}`);

        orders_to_be_cancelled.forEach((client_order_id) => {
            that.cancel_order({
                exchange: exchange,
                symbol: symbol,
                contract_type: contract_type,
                client_order_id: client_order_id,
                account_id: act_id
            });
        });

        orders_to_be_submitted.forEach((order) => {
            let client_order_id = order.client_order_id, label = order.label, target = order.target, quantity = order.quantity, price = order.price, direction = order.direction;

            // 发送订单，同时建立order_map
            // {"3106609167": {"label": "DN", "target": "LONG", "quantity": 21133, "time": 1669492800445, "filled": 0}}
            that.order_map[entry][client_order_id] = { label: label, target: target, quantity: quantity, time: moment.now(), filled: 0 };
            // {"ANTI_S": { "client_order_id": "3103898618",  "label": "ANTI_S|STOPLOSS", "price": 0.3214, "quantity": 100, "time": 1669492800445}}
            that.order_map[entry][label.slice(0, 6)] = { client_order_id: client_order_id, label: label, price: price, quantity: quantity, time: moment.now() };

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

    main_execuation(new_start, new_bar, entry) {
        let that = this;
        let [exchange, symbol, contract_type, interval, track_ATR_multiplier_str] = entry.split(".");
        let idf =  [exchange, symbol, contract_type].join(".");
        let price = that.prices[idf]["price"];
        let ini_usdt = (that.cfg[entry]["ini_usdt"]) ? that.cfg[entry]["ini_usdt"] : that.cfg["ini_usdt"];
        let act_id = that.cfg[entry]["act_id"];

        // load status_map  -----------------------------------------------
        let bar_enter_n = that.status_map[entry]["bar_enter_n"];

        // para loading -----------------------------------------------
        let stoploss_rate = that.cfg[entry]["stoploss_rate"];
        let track_ATR_multiplier = that.cfg[entry]["track_ATR_multiplier"];
        let delta_af = that.cfg[entry]["delta_af"];
        let bar_enter_limit = that.cfg[entry]["bar_enter_limit"];

        // cal indicators -----------------------------------------------
        let track_ATR = Math.max(...Object.values(that.klines[entry]["high"]).slice(1)) - Math.min(...Object.values(that.klines[entry]["low"]).slice(1));
        let up = that.klines[entry]["open"][0] + track_ATR * track_ATR_multiplier;
        let dn = that.klines[entry]["open"][0] - track_ATR * track_ATR_multiplier;
        let up_price = stratutils.transform_with_tick_size(up, PRICE_TICK_SIZE[idf]);
        let dn_price = stratutils.transform_with_tick_size(dn, PRICE_TICK_SIZE[idf], "round");  // 如果dn_price是负数，会被round成最小价
        that.status_map[entry]["up"] = up_price;
        that.status_map[entry]["dn"] = dn_price;

        if (isNaN(up_price) || (isNaN(dn_price))) return;

        // 重启以后将anti_order_sent置零
        if (new_start) that.status_map[entry]["anti_order_sent"] = false;

        let orders_to_be_cancelled = [];    // client_order_id only
        let orders_to_be_submitted = [];    // {label: "", target: "", tgt_qty: "", price: "", direction: ""}

        if (that.status_map[entry]["status"] === "EMPTY") {
            that.status_map[entry]["anti_order_sent"] = false;

            if ((new_start || new_bar) && (bar_enter_n < bar_enter_limit)) {
                // 计算开仓量
                let up_qty = stratutils.transform_with_tick_size(ini_usdt / up_price, QUANTITY_TICK_SIZE[idf]);
                let dn_qty = stratutils.transform_with_tick_size(ini_usdt / dn_price, QUANTITY_TICK_SIZE[idf]);

                // 如果已经有UP单，撤销之
                if (that.order_map[entry]["UP"] !== undefined) {
                    orders_to_be_cancelled.push(that.order_map[entry]["UP"]["client_order_id"]);
                }

                // 如果已经有DN单，撤销之
                if (that.order_map[entry]["DN"] !== undefined) {
                    orders_to_be_cancelled.push(that.order_map[entry]["DN"]["client_order_id"]);
                }

                let [up_client_order_id, dn_client_order_id] = [that.alias + interval.padStart(3, '0') + track_ATR_multiplier_str + LABELMAP["UP"] + randomID(7), that.alias + interval.padStart(3, '0') + track_ATR_multiplier_str + LABELMAP["DN"] + randomID(7)];

                if (that.summary["overall"]["short_num"] < that.cfg["max_num"]) {
                    orders_to_be_submitted.push({ client_order_id: up_client_order_id, label: "UP", target: "SHORT", quantity: up_qty, price: up_price, direction: DIRECTION.SELL });
                }

                if (that.summary["overall"]["long_num"] < that.cfg["max_num"]) {
                    orders_to_be_submitted.push({ client_order_id: dn_client_order_id, label: "DN", target: "LONG", quantity: dn_qty, price: dn_price, direction: DIRECTION.BUY });
                }

            }
        } else if (that.status_map[entry]["status"] === "SHORT") {
            // 注意：SHORT时，实际上是up_break，因此有high_since_long
            if (new_bar) {
                // New bar and update the indicators
                that.status_map[entry]["bar_n"] += 1;
                if (that.status_map[entry]["bar_n"] !== 1) {
                    if (that.klines[entry]["high"][1] > that.status_map[entry]["ep"]) {
                        // if a higher high occurs, update the ep and af value
                        that.status_map[entry]["ep"] = that.klines[entry]["high"][1];
                        that.status_map[entry]["af"] += delta_af;
                        that.status_map[entry]["af"] = stratutils.transform_with_tick_size(that.status_map[entry]["af"], 0.01);
                    }
                    that.status_map[entry]["sar"] = that.status_map[entry]["sar"] + that.status_map[entry]["af"] * (that.status_map[entry]["ep"] - that.status_map[entry]["sar"]);
                    that.status_map[entry]["sar"] = stratutils.transform_with_tick_size(that.status_map[entry]["sar"], PRICE_TICK_SIZE[idf]);
                }
            } else {
                if (that.status_map[entry]["bar_n"] === 0) {
                    // the first bar when entered, initialize the ep value
                    that.status_map[entry]["ep"] = Math.max(that.status_map[entry]["ep"], price);
                }
            }

            if (that.status_map[entry]["high_since_long"] !== undefined) {
                that.status_map[entry]["high_since_long"] = Math.max(that.status_map[entry]["high_since_long"], price);
            }

            let stoploss_price = Math.max(that.status_map[entry]["high_since_long"] * (1 - stoploss_rate), that.status_map[entry]["sar"]);
            stoploss_price = stratutils.transform_with_tick_size(stoploss_price, PRICE_TICK_SIZE[idf]);
            that.status_map[entry]["stoploss_price"] = stoploss_price;

            if (isNaN(stoploss_price)) {
                logger.info(`${that.alias}: stoploss_price is null: ${that.status_map[entry]["high_since_long"]}, ${that.status_map[entry]["sar"]}, ${stoploss_rate}`)
            }

            // 对手单已经sent，但是还没有成功submitted，不做任何处理
            if (that.status_map[entry]["anti_order_sent"] === true) return;

            // 下面一行代码注释掉，意味着开仓当天可以止损或者反手
            // if (that.status_map[entry]["bar_n"] === 0) return;

            if (stoploss_price < dn_price) {
                // dn_price更高，对手单为反手单
                // 直接发LIMIT单等待成交，如果已经触发，就想办法在该Bar内成交；如果未触发，则一直等待；
                let tgt_qty = stratutils.transform_with_tick_size(- that.status_map[entry]["pos"] + ini_usdt / dn_price, QUANTITY_TICK_SIZE[idf]);
                if (that.order_map[entry]["ANTI_S"] === undefined) {
                    // 对手单还没有发送
                    orders_to_be_submitted.push({ client_order_id: that.alias + interval.padStart(3, '0') + track_ATR_multiplier_str + LABELMAP["ANTI_S|REVERSE"] + randomID(7), label: "ANTI_S|REVERSE", target: "LONG", quantity: tgt_qty, price: dn_price, direction: DIRECTION.BUY });
                    that.status_map[entry]["anti_order_sent"] = true;
                } else {
                    // 对手单已发，检查是否需要更改
                    let anti_client_order_id = that.order_map[entry]["ANTI_S"]["client_order_id"];
                    let anti_label = that.order_map[entry]["ANTI_S"]["label"];
                    let anti_price = that.order_map[entry]["ANTI_S"]["price"];
                    let anti_qty = that.order_map[entry]["ANTI_S"]["quantity"];

                    // 若已存的反手单和现行不一致，则撤销重新发
                    if ((anti_label !== "ANTI_S|REVERSE") || (anti_price !== dn_price) || (anti_qty !== tgt_qty)) {
                        orders_to_be_cancelled.push(anti_client_order_id);
                        orders_to_be_submitted.push({ client_order_id: that.alias + interval.padStart(3, '0') + track_ATR_multiplier_str + LABELMAP["ANTI_S|REVERSE"] + randomID(7), label: "ANTI_S|REVERSE", target: "LONG", quantity: tgt_qty, price: dn_price, direction: DIRECTION.BUY });
                        that.status_map[entry]["anti_order_sent"] = true;
                    }
                }
            } else {
                // 止损价（stoploss_price）更高，反手单为止损单
                // 直接发LIMIT单等待成交，如果已经触发，就想办法在该Bar内成交；如果未触发，则一直等待
                let tgt_qty = stratutils.transform_with_tick_size(- that.status_map[entry]["pos"], QUANTITY_TICK_SIZE[idf]);
                if (that.order_map[entry]["ANTI_S"] === undefined) {
                    // 对手单（止损单）未发送
                    orders_to_be_submitted.push({ client_order_id: that.alias + interval.padStart(3, '0') + track_ATR_multiplier_str + LABELMAP["ANTI_S|STOPLOSS"] + randomID(7), label: "ANTI_S|STOPLOSS", target: "EMPTY", quantity: tgt_qty, price: stoploss_price, direction: DIRECTION.BUY });
                    that.status_map[entry]["anti_order_sent"] = true;
                } else {
                    // 对手单（止损单）已经发送，检查是否需要更改
                    let anti_client_order_id = that.order_map[entry]["ANTI_S"]["client_order_id"];
                    let anti_label = that.order_map[entry]["ANTI_S"]["label"];
                    let anti_price = that.order_map[entry]["ANTI_S"]["price"];
                    let anti_qty = that.order_map[entry]["ANTI_S"]["quantity"];

                    // 若已存的平仓单（止损单）和现行不一致，则撤销重新发
                    if ((anti_label !== "ANTI_S|STOPLOSS") || (anti_price !== stoploss_price) || (anti_qty !== tgt_qty)) {
                        orders_to_be_cancelled.push(anti_client_order_id);
                        orders_to_be_submitted.push({ client_order_id: that.alias + interval.padStart(3, '0') + track_ATR_multiplier_str + LABELMAP["ANTI_S|STOPLOSS"] + randomID(7), label: "ANTI_S|STOPLOSS", target: "EMPTY", quantity: tgt_qty, price: stoploss_price, direction: DIRECTION.BUY });
                        that.status_map[entry]["anti_order_sent"] = true;
                    }
                }
            }
        } else if (that.status_map[entry]["status"] === "LONG") {
            // 状态是LONG，但交易逻辑是dn break，因此有low_since_short
            if (new_bar) {
                that.status_map[entry]["bar_n"] += 1;
                if (that.status_map[entry]["bar_n"] !== 1) {
                    if (that.klines[entry]["low"][1] < that.status_map[entry]["ep"]) {
                        that.status_map[entry]["ep"] = that.klines[entry]["low"][1];
                        that.status_map[entry]["af"] += delta_af;
                        that.status_map[entry]["af"] = stratutils.transform_with_tick_size(that.status_map[entry]["af"], 0.01);
                    }
                    that.status_map[entry]["sar"] = that.status_map[entry]["sar"] + that.status_map[entry]["af"] * (that.status_map[entry]["ep"] - that.status_map[entry]["sar"]);
                    that.status_map[entry]["sar"] = stratutils.transform_with_tick_size(that.status_map[entry]["sar"], PRICE_TICK_SIZE[idf]);
                }
            } else {
                if (that.status_map[entry]["bar_n"] === 0) {
                    that.status_map[entry]["ep"] = Math.min(that.status_map[entry]["ep"], price);
                }
            }

            if (that.status_map[entry]["low_since_short"] !== undefined) {
                that.status_map[entry]["low_since_short"] = Math.min(that.status_map[entry]["low_since_short"], price);
            }

            let stoploss_price = Math.min(that.status_map[entry]["low_since_short"] * (1 + stoploss_rate), that.status_map[entry]["sar"]);
            stoploss_price = stratutils.transform_with_tick_size(stoploss_price, PRICE_TICK_SIZE[idf]);
            that.status_map[entry]["stoploss_price"] = stoploss_price;

            if (isNaN(stoploss_price)) {
                logger.info(`stoploss_price is null: ${that.status_map[entry]["low_since_short"]}, ${that.status_map[entry]["sar"]}, ${stoploss_rate}`)
            }

            // logger.info(`${symbol}::SHORT::${JSON.stringify(that.status_map[entry])}`);

            // 对手单已经sent，但是还没有成功submitted，不做任何处理
            if (that.status_map[entry]["anti_order_sent"] === true) return;

            // 下面一行代码注释掉，意味着开仓当天可以止损或者反手
            // if (that.status_map[entry]["bar_n"] === 0) return;

            if (stoploss_price > up_price) {
                // up_price更低，对手单为反手单
                // 直接发LIMIT单等待成交，如果已经触发，就想办法在该Bar内成交；如果未触发，则一直等待；
                let tgt_qty = stratutils.transform_with_tick_size(that.status_map[entry]["pos"] + ini_usdt / up_price, QUANTITY_TICK_SIZE[idf]);
                if (that.order_map[entry]["ANTI_L"] === undefined) {
                    orders_to_be_submitted.push({ client_order_id: that.alias + interval.padStart(3, '0') + track_ATR_multiplier_str + LABELMAP["ANTI_L|REVERSE"] + randomID(7), label: "ANTI_L|REVERSE", target: "SHORT", quantity: tgt_qty, price: up_price, direction: DIRECTION.SELL });
                    that.status_map[entry]["anti_order_sent"] = true;
                } else {
                    let anti_client_order_id = that.order_map[entry]["ANTI_L"]["client_order_id"];
                    let anti_label = that.order_map[entry]["ANTI_L"]["label"];
                    let anti_price = that.order_map[entry]["ANTI_L"]["price"];
                    let anti_qty = that.order_map[entry]["ANTI_L"]["quantity"];

                    if ((anti_label !== "ANTI_L|REVERSE") || (anti_price !== up_price) || (anti_qty !== tgt_qty)) {
                        // 若已存的对手单（反手单）和现行不一致，则撤销重新发
                        orders_to_be_cancelled.push(anti_client_order_id);
                        orders_to_be_submitted.push({ client_order_id: that.alias + interval.padStart(3, '0') + track_ATR_multiplier_str + LABELMAP["ANTI_L|REVERSE"] + randomID(7), label: "ANTI_L|REVERSE", target: "SHORT", quantity: tgt_qty, price: up_price, direction: DIRECTION.SELL });
                        that.status_map[entry]["anti_order_sent"] = true;
                    }
                }

            } else {
                // 止损价（stoploss_price）更低，对手单为止损单
                // 直接发LIMIT单等待成交，如果已经触发，就想办法在该Bar内成交；如果未触发，则一直等待；
                let tgt_qty = stratutils.transform_with_tick_size(that.status_map[entry]["pos"], QUANTITY_TICK_SIZE[idf]);
                if (that.order_map[entry]["ANTI_L"] === undefined) {
                    orders_to_be_submitted.push({ client_order_id: that.alias + interval.padStart(3, '0') + track_ATR_multiplier_str + LABELMAP["ANTI_L|STOPLOSS"] + randomID(7), label: "ANTI_L|STOPLOSS", target: "EMPTY", quantity: tgt_qty, price: stoploss_price, direction: DIRECTION.SELL });
                    that.status_map[entry]["anti_order_sent"] = true;
                } else {
                    let anti_client_order_id = that.order_map[entry]["ANTI_L"]["client_order_id"];
                    let anti_label = that.order_map[entry]["ANTI_L"]["label"];
                    let anti_price = that.order_map[entry]["ANTI_L"]["price"];
                    let anti_qty = that.order_map[entry]["ANTI_L"]["quantity"];

                    if ((anti_label !== "ANTI_L|STOPLOSS") || (anti_price !== stoploss_price) || (anti_qty !== tgt_qty)) {
                        orders_to_be_cancelled.push(anti_client_order_id);
                        orders_to_be_submitted.push({ client_order_id: that.alias + interval.padStart(3, '0') + track_ATR_multiplier_str + LABELMAP["ANTI_L|STOPLOSS"] + randomID(7), label: "ANTI_L|STOPLOSS", target: "EMPTY", quantity: tgt_qty, price: stoploss_price, direction: DIRECTION.SELL });
                        that.status_map[entry]["anti_order_sent"] = true;
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
            that.order_map[entry][client_order_id] = { label: label, target: target, quantity: quantity, time: moment.now(), filled: 0 };
            // {"ANTI_S": { "client_order_id": "3103898618",  "label": "ANTI_S|STOPLOSS", "price": 0.3214, "quantity": 100, "time": 1669492800445}}
            that.order_map[entry][label.slice(0, 6)] = { client_order_id: client_order_id, label: label, price: price, quantity: quantity, time: moment.now() };

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

    on_send_order_response(response) {
        let that = this;

        let action = response["action"];

        let exchange = response["request"]["exchange"];
        let symbol = response["request"]["symbol"];
        let contract_type = response["request"]["contract_type"];
        let client_order_id = response["request"]["client_order_id"];
        let act_id = response["request"]["account_id"];

        // send_order都会发label，因此label之前从request里面获取
        let label = response["request"]["label"];
        let target = response["request"]["target"];
        let quantity = response["request"]["quantity"];
        let direction = response["request"]["direction"];
        let price = response["request"]["price"];

        let interval = (client_order_id.slice(3, 4) === "0")? client_order_id.slice(4, 6): client_order_id.slice(3, 6);
        let track_ATR_multiplier_str = client_order_id.slice(6, 9);
        let idf = [exchange, symbol, contract_type].join(".");
        let entry = [exchange, symbol, contract_type, interval, track_ATR_multiplier_str].join(".");
        let order_idf = [act_id, entry, direction, label, client_order_id].join("|");

        if (response["metadata"]["metadata"]["result"] === false) {
            // 发单失败，1分钟后删除该订单信息
            setTimeout(() => delete that.order_map[entry][client_order_id], 1000 * 60);

            let error_code = response["metadata"]["metadata"]["error_code"];
            let error_code_msg = response["metadata"]["metadata"]["error_code_msg"];
            let retry = response["request"]["retry"];

            if (retry === 5) {
                that.slack_publish({
                    "type": "alert",
                    "msg": `${that.alias}::${order_idf}::Send order retried over 5 times, check the code!`
                });
                return;
            }

            // 所有的发单报错都会发邮件！
            logger.debug(`${that.alias}::on_response|${order_idf}::an error occured during ${action}: ${error_code}: ${error_code_msg}`);
            that.slack_publish({
                "type": "alert",
                "msg": `${that.alias}::on_response|${order_idf}::an error occured during ${action}: ${error_code}: ${error_code_msg}`
            });

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
                if ((limit_type === "higher") && (adj_price >= limit_price)) {
                    adj_price = stratutils.transform_with_tick_size(adj_price - PRICE_TICK_SIZE[idf], PRICE_TICK_SIZE[idf]);
                } else if ((limit_type === "lower") && (adj_price <= limit_price)) {
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
                    that.status_map[entry]["DN"] = undefined;
                } else {
                    logger.info(`${that.alias}::${order_idf}::price less than min, but not a DN order, check!`);
                }
            } else if (error_code_msg === "Order would immediately trigger.") {
                // The order would be triggered immediately, STOP order才会报这样的错，本策略都是LIMIT ORDER
            } else if (error_code_msg === "Futures Trading Quantitative Rules violated, only reduceOnly order is allowed, please try again later.") {
                this.query_quantitative_rules({
                    exchange: EXCHANGE.BINANCEU,
                    contract_type: CONTRACT_TYPE.PERP,
                    account_id: act_id
                });
            } else {
                logger.warn(`${that.alias}::on_response|${order_idf}::unknown error occured during ${action}: ${error_code}: ${error_code_msg}`);
                return;
            }

            if (resend) {
                logger.info(`${that.alias}::${order_idf}::resend the order in ${timeout} ms!`);
                setTimeout(() => {
                    retry = (retry === undefined) ? 1 : retry + 1;
                    let new_client_order_id = that.alias + interval.padStart(3, '0') + track_ATR_multiplier_str + LABELMAP[label] + randomID(7);

                    // 注意：order_map里面的key只有ANTI_L, ANTI_S, UP, DN四种；
                    // 但是label有六种！
                    that.order_map[entry][new_client_order_id] = { label: label, target: target, quantity: quantity, time: moment.now(), filled: 0 };
                    that.order_map[entry][label.slice(0, 6)] = { client_order_id: new_client_order_id, label: label, price: price, quantity: quantity, time: moment.now() };

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
        let direction = response["request"]["direction"];

        let label = client_order_id.slice(9, 11);
        if (!Object.values(LABELMAP).includes(label)) {
            logger.info(`${that.alias}::on_cancel_order_response|unknown order label ${label}!`);
            return;
        } else {
            label = stratutils.get_key_by_value(LABELMAP, label);
        }

        let interval = (client_order_id.slice(3, 4) === "0")? client_order_id.slice(4, 6): client_order_id.slice(3, 6);
        let track_ATR_multiplier_str = client_order_id.slice(6, 9);
        let entry = [exchange, symbol, contract_type, interval, track_ATR_multiplier_str].join(".");
        let order_idf = [act_id, entry, direction, label, client_order_id].join("|");

        if (response["metadata"]["metadata"]["result"] === false) {
            //撤单失败
            let error_code = response["metadata"]["metadata"]["error_code"];
            let error_code_msg = response["metadata"]["metadata"]["error_code_msg"];
            let retry = response["request"]["retry"];

            if (retry === 5) {
                that.slack_publish({
                    "type": "alert",
                    "msg": `${that.alias}::${order_idf}::Cancel order retried over 5 times, check the code!`
                });
                return;
            }

            logger.debug(`${that.alias}::on_response|${order_idf}::an error occured during ${action}: ${error_code}: ${error_code_msg}`);
            //所有的撤单失败也会发邮件报警
            that.slack_publish({
                "type": "alert",
                "msg": `${that.alias}::on_response|${order_idf}::an error occured during ${action}: ${error_code}: ${error_code_msg}`
            });

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
                logger.warn(`${that.alias}::on_response|${order_idf}::unknown error occured during ${action}: ${error_code}: ${error_code_msg}`);
                return;
            }

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

        if (response["metadata"]["metadata"]["result"] === false) {
            let error_code = response["metadata"]["metadata"]["error_code"];
            let error_code_msg = response["metadata"]["metadata"]["error_code_msg"];
            logger.debug(`${that.alias}:: an error occured during query orders: ${error_code}: ${error_code_msg}`);
            return
        }

        let orders = response["metadata"]["metadata"]["orders"];
        let active_orders = orders.filter(item => item.client_order_id.slice(0, 3) === that.alias);

        let sendData = {
            "tableName": this.alias,
            "tabName": "PortfolioMonitor",
            "data": []
        }

        for (let entry of that.cfg["entries"]) {
            let symbol = entry.split(".")[1];
            let interval = entry.split(".")[3];
            let track_ATR_multiplier_str = entry.split(".")[4];
            let corr_active_orders = active_orders.filter(item => (item.client_order_id.slice(3, 6) === interval.padStart(3, '0')) && (item.symbol === symbol) && (item.client_order_id.slice(6, 9) === track_ATR_multiplier_str));
            let corr_active_client_order_ids = corr_active_orders.map(item => item.client_order_id);
            let string = corr_active_client_order_ids.join(",");

            let index = that.cfg["entries"].indexOf(entry);

            let item = {};
            item[`${index + 1}|orders`] = string;
            sendData["data"].push(item);

            // TODO: 从order_map删除item
            for (let [key, value] of Object.entries(that.order_map[entry])) {
                if (key.startsWith(that.alias)) {
                    if (corr_active_client_order_ids.includes(key)) continue;
                } else {
                    if (corr_active_client_order_ids.includes(value.client_order_id)) continue;
                }

                if (that.order_map[entry][key]["ToBeDeleted"]) {
                    delete that.order_map[entry][key];
                } else {
                    that.order_map[entry][key]["ToBeDeleted"] = true;
                }
            }
        }

        this.intercom.emit("UI_update", sendData, INTERCOM_SCOPE.UI);
    }
}

module.exports = RevTrendXEMStrategy;

let strategy;

process.argv.forEach((val) => {
    if (val === "on") {
        let args = require("yargs")
            .option("alias", {
                alias: "a",
                describe: "-a <env> specify the stragey alias",
                default: "undefined",
            })
            .help()
            .alias("h", "help")
            .epilog("FORESEEM 2021.")
            .argv;

        let alias = args.a;
        let intercom_config = [
            INTERCOM_CONFIG[`LOCALHOST_FEED`],
            INTERCOM_CONFIG[`LOCALHOST_STRATEGY`],
            INTERCOM_CONFIG[`LOCALHOST_UI`]
        ];

        strategy = new RevTrendXEMStrategy("RevTrendXEM", alias, new Intercom(intercom_config));
        strategy.start();
    }
});

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