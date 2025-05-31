// 2023-07-07: 全是market order，不需要order_map？on_order_update里面还是需要order_map来更新status

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
const token = require("../config/token.json");

class SimpleTrendStrategy extends StrategyBase{
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
        this.interval = this.cfg["interval"];
        this.contract_type = CONTRACT_TYPE.PERP;
    }

    start() {
        this._register_events();
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
            item[`${index + 1}|pos`] = that.status_map[entry]["pos"];
            item[`${index + 1}|fee`] = that.status_map[entry]["fee"];
            item[`${index + 1}|np`] = that.status_map[entry]["net_profit"];
            item[`${index + 1}|price`] = (that.prices[idf])? that.prices[idf]["price"]: "";
            item[`${index + 1}|sar`] = that.status_map[entry]["sar"];
            item[`${index + 1}|up`] = that.status_map[entry]["up"];
            item[`${index + 1}|dn`] = that.status_map[entry]["dn"];
            sendData["data"].push(item);
        });

        this.intercom.emit("UI_update", sendData, INTERCOM_SCOPE.UI);
    }

    init_order_map() {
        let that = this;

        if (!fs.existsSync(`./config/order_map_${that.alias}.json`)) {
            that.order_map = {};
        } else {
            that.order_map = require(`../config/order_map_${that.alias}`);
        }

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

        if (!fs.existsSync(`./config/status_map_${that.alias}.json`)) {
            that.status_map = {};
        } else {
            that.status_map = require(`../config/status_map_${that.alias}`);
        }
                    
        that.cfg["entries"].forEach((entry) => {
            if ((that.status_map[entry] === undefined) || (that.cfg["clear_existing_status"])) {
                that.status_map[entry] = {
                    "status": "EMPTY",
                    "pos": 0,
                    "real_pos": "",
                    "up": "",
                    "dn": "",
                    "enter_price": "",
                    "bar_n": "",
                    "bar_enter_n": 0,
                    "ep": "",
                    "af": "",
                    "sar": "",
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

    // load_klines() {
    //     logger.info("Loading the klines from https://fapi.binance.com/fapi/v1/klines/");
    //     let that = this;

    //     that.cfg["entries"].forEach((entry) => {
    //         let [exchange, symbol, contract_type, interval] = entry.split(".");
    //         let num = (interval === "1d") ? 24 : parseInt(interval.split("h")[0]);
    //         assert(["1d", "12h", "8h", "6h", "4h", "3h", "2h", "1h"].includes(interval));
    //         that.klines[entry] = { "ts": [], "open": [], "high": [], "low": [], "ready": false };

    //         let n_klines = (that.cfg[entry]["track_ATR_n"] + 1) * num;
    //         let url = "https://fapi.binance.com/fapi/v1/klines/?symbol=" + symbol + "&contractType=PERPETUAL&interval=1h&limit=" + n_klines;
    //         request.get({
    //             url: url, json: true
    //         }, function (error, res, body) {
    //             let high = Number.NEGATIVE_INFINITY, low = Number.POSITIVE_INFINITY;
    //             for (let i = body.length - 1; i >= 0; i--) {
    //                 let ts = utils.get_human_readable_timestamp(body[i][0]);
    //                 let hour = parseInt(ts.slice(8, 10));
    //                 high = Math.max(high, parseFloat(body[i][2]));
    //                 low = Math.min(low, parseFloat(body[i][3]));
    //                 if ((interval === "1h") || (hour % num === that.cfg[entry]["splitAt"])) {
    //                     that.klines[entry]["ts"].push(ts);
    //                     that.klines[entry]["open"].push(parseFloat(body[i][1]));
    //                     that.klines[entry]["high"].push(high);
    //                     that.klines[entry]["low"].push(low);
    //                     high = Number.NEGATIVE_INFINITY;
    //                     low = Number.POSITIVE_INFINITY;
    //                 }
    //             }
    //         });
    //         setTimeout(() => that.klines[entry]["ready"] = true, 2000);
    //     });
    // }

    load_klines() {
        let that = this;
        that.cfg["entries"].forEach((entry) => {
            that.load_entry_klines(entry);
        });
    }

    load_entry_klines(entry) {
        let that = this;

        let [exchange, symbol, contract_type, interval] = entry.split(".");
        let num = (interval === "1d") ? 24 : parseInt(interval.split("h")[0]);
        assert(["1d", "12h", "8h", "6h", "4h", "3h", "2h", "1h"].includes(interval));
        that.klines[entry] = { "ts": [], "open": [], "high": [], "low": [], "ready": false };

        let n_klines = (that.cfg[entry]["track_ATR_n"] + 1) * num;
        let url = "https://fapi.binance.com/fapi/v1/klines?symbol=" + symbol + "&contractType=PERPETUAL&interval=1h&limit=" + n_klines;
        logger.info(`Loading the klines from ${url}`);
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

        setTimeout(() => {
            logger.info(`${entry}:${JSON.stringify(that.klines[entry])}`);
            if ((that.klines[entry]["ts"].length === 0) || (isNaN(that.klines[entry]['open'][0]))) {
                logger.info(`Reloading ${entry} klines ...`);
                that.load_entry_klines(entry);
            } else {
                that.klines[entry]["ready"] = true;
            }
        }, 10000);
    }

    on_order_update(order_update) {
        let that = this;

        let exchange = order_update["exchange"];
        let symbol = order_update["symbol"];
        let contract_type = order_update["contract_type"];

        let order_type = order_update["order_info"]["order_type"];
        let order_status = order_update["order_info"]["status"];
        let direction = order_update["metadata"]["direction"];
        let client_order_id = order_update["metadata"]["client_order_id"];
        let update_type = order_update["metadata"]["update_type"];
        let act_id = order_update["metadata"]["account_id"];

        let idf = [exchange, symbol, contract_type].join(".");
        let interval = (client_order_id.slice(3, 4) === "0")? client_order_id.slice(4, 6): client_order_id.slice(3, 6);
        let entry = [exchange, symbol, contract_type, interval].join(".");
        
        // 不是本策略的订单更新，自动过滤（这里不能删！）
        if (client_order_id.slice(0, 3) !== that.alias) return;
        logger.info(`${that.alias}::on_order_update|${JSON.stringify(order_update)}`);

        let label = client_order_id.slice(6, 8);
        if (!Object.values(LABELMAP).includes(label)) {
            logger.info(`${that.alias}::on_order_update|unknown order label ${label}!`);
            return;
        } else {
            label = stratutils.get_key_by_value(LABELMAP, label);   
        }
        let order_idf = [act_id, symbol, interval, direction, label, client_order_id].join("|");

        if (order_status === ORDER_STATUS.SUBMITTED) {

            let original_amount = order_update["order_info"]["original_amount"];
            logger.info(`${that.alias}::on_order_update|${order_idf} ${order_type} order ${original_amount} placed after ${update_type}!`);

        } else if (order_status === ORDER_STATUS.CANCELLED) {

            logger.warn(`${this.alias}: this strategy is supposed to be no cancel_order action!`);

        } else if ((order_status === ORDER_STATUS.FILLED) || (order_status === ORDER_STATUS.PARTIALLY_FILLED)) {

            let original_amount = order_update["order_info"]["original_amount"];
            let filled = order_update["order_info"]["filled"];
            let new_filled = order_update["order_info"]["new_filled"];
            let avg_executed_price = order_update["order_info"]["avg_executed_price"];
            let fee = order_update["metadata"]["fee"];

            logger.info(`${that.alias}::on_order_update|${order_idf} ${order_type} order ${filled}/${original_amount} filled!`);

            // 更新position
            that.status_map[entry]["pos"] += (direction === DIRECTION.BUY) ? new_filled : - new_filled;
            that.status_map[entry]["fee"] += fee;
            that.status_map[entry]["quote_ccy"] += (direction === DIRECTION.SELL) ? new_filled * avg_executed_price : - new_filled * avg_executed_price;

            that.status_map[entry]["pos"] = stratutils.transform_with_tick_size(that.status_map[entry]["pos"], QUANTITY_TICK_SIZE[idf]);
            that.status_map[entry]["fee"] = stratutils.transform_with_tick_size(that.status_map[entry]["fee"], 0.01);
            that.status_map[entry]["quote_ccy"] = stratutils.transform_with_tick_size(that.status_map[entry]["quote_ccy"], 0.01);

            // 检查一下status_map变化
            logger.info(`${entry}::${JSON.stringify(that.status_map[entry])}`);

            if (order_status === ORDER_STATUS.FILLED) {
                // 订单完全成交，更新status_map
                setTimeout(() => delete that.order_map[entry][client_order_id], 1000);

                that.status_map[entry]["status"] = that.order_map[entry][client_order_id]["target"];
                let current_status = that.status_map[entry]["status"];
                if (current_status === "EMPTY") {
                    // 订单完全成交，仓位变为空，这说明是平仓单
                    // 把that.pre_bar_otime[idf]变成undefined，这样就变成new_start，在STR中意义不大
                    // 有可能会出现依然无法重新发开仓单的情况，这种大概率是因为bar_enter_n没有进行更新
                    // 复制为""是因为如果复制为undefined，在UI那边会不更新
                    that.pre_bar_otime[entry] = undefined;
                    for (let item of ["bar_n", "ep", "af", "sar", "enter_price"]) {
                        that.status_map[entry][item] = "";
                    }
                } else {
                    let cutloss_rate = that.cfg[entry]["cutloss_rate"];

                    that.status_map[entry]["bar_n"] = 0;
                    that.status_map[entry]["bar_enter_n"] += 1;
                    that.status_map[entry]["ep"] = avg_executed_price;
                    that.status_map[entry]["af"] = that.cfg[entry]["ini_af"];
                    that.status_map[entry]["enter_price"] = avg_executed_price;
                    that.status_map[entry]["sar"] = (current_status === "LONG") ? avg_executed_price * (1 - cutloss_rate) : avg_executed_price * (1 + cutloss_rate);   
                    
                    that.status_map[entry]["ep"] = stratutils.transform_with_tick_size(that.status_map[entry]["ep"], PRICE_TICK_SIZE[idf]);
                    that.status_map[entry]["sar"] = stratutils.transform_with_tick_size(that.status_map[entry]["sar"], PRICE_TICK_SIZE[idf]);
                }

                // STR::检查LONG和SHORT的个数
                let status_list = that.cfg["entries"].map((entry) => that.status_map[entry]["status"]);
                let long_num = status_list.map((element) => element === "LONG").reduce((a, b) => a + b, 0);
                let short_num = status_list.map((element) => element === "SHORT").reduce((a, b) => a + b, 0);
                that.summary["overall"]["long_num"] = long_num;
                that.summary["overall"]["short_num"] = short_num;
            }

            // 检查一下status_map变化
            logger.info(`${that.alias}::${entry}::${JSON.stringify(that.status_map[entry])}`);

            // record the order filling details
            let ts = order_update["metadata"]["timestamp"];
            // 0 stands for submit_price
            let filled_info = [act_id, exchange, symbol, contract_type, interval, client_order_id, original_amount, filled, 0, avg_executed_price, fee].join(",");
            let order_info = (that.order_map[entry][client_order_id] === undefined) ? "" : Object.entries(that.order_map[entry][client_order_id]).map((element) => element[1]).join(",");
            let output_string = [ts, filled_info, order_info].join(",");
            output_string += (order_status === ORDER_STATUS.FILLED) ? ",filled\n" : ",partially_filled\n";
            fs.writeFile(`./log/order_filling_${this.alias}.csv`, output_string, { flag: "a+" }, (err) => {
                if (err) logger.info(`${this.alias}::${err}`);
            });
        } else {
            logger.info(`${this.alias}::on_order_update|Unhandled order update status: ${order_status}!`)
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
        corr_entries.forEach((entry) => {
            if (!that.klines[entry]["ready"]) return;
            let interval = entry.split(".")[3];
    
            // logger.info(symbol, ts, that.cur_bar_otime[entry], that.pre_bar_otime[entry]);
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
            }

            // logger.info(`${that.alias}::${entry}::${JSON.stringify(that.klines[entry])}`);
            // 更新kline数据，这里应该用>会不会更好？
            if (that.cur_bar_otime[entry] > that.klines[entry]["ts"][0]) {
                // new_interval开始
                that.klines[entry]["ts"].unshift(that.cur_bar_otime[entry]);
                that.klines[entry]["ts"].pop();
                that.klines[entry]["open"].unshift(price);
                that.klines[entry]["open"].pop();
                that.klines[entry]["high"].unshift(price);
                that.klines[entry]["high"].pop();
                that.klines[entry]["low"].unshift(price);
                that.klines[entry]["low"].pop();
                // logger.info(`${that.alias}::${entry}::${JSON.stringify(that.klines[entry])}`);
            } else if (that.cur_bar_otime[entry] === that.klines[entry]["ts"][0]) {
                that.klines[entry]["high"][0] = Math.max(price, that.klines[entry]["high"][0]);
                that.klines[entry]["low"][0] = Math.min(price, that.klines[entry]["low"][0]);
            } else {
                logger.debug(`${that.alias}::${entry}::cur_bar_otime is larger than klines ts[0]?`);
            }
            // logger.info(`${that.alias}::${entry}::${JSON.stringify(that.klines[entry])}`);
    
            // update bar open time and net_profit
            that.pre_bar_otime[entry] = that.cur_bar_otime[entry];
    
            // 下单逻辑模块
            that.status_map[entry]["net_profit"] = that.status_map[entry]["quote_ccy"] + that.status_map[entry]["pos"] * price - that.status_map[entry]["fee"];
            that.status_map[entry]["net_profit"] = stratutils.transform_with_tick_size(that.status_map[entry]["net_profit"], 0.01);
            that.main_execuation(new_start, new_bar, entry);
        });
    }

    main_execuation(new_start, new_bar, entry) {
        let that = this;
        let [exchange, symbol, contract_type, interval] = entry.split(".");
        let idf =  [exchange, symbol, contract_type].join(".");
        let price = that.prices[idf]["price"];
        let ini_usdt = (that.cfg[entry]["ini_usdt"]) ? that.cfg[entry]["ini_usdt"] : that.cfg["ini_usdt"];
        let act_id = that.cfg[entry]["act_id"];

        // load status_map  -----------------------------------------------
        let bar_enter_n = that.status_map[entry]["bar_enter_n"];

        // para loading -----------------------------------------------
        let track_ATR_multiplier = that.cfg[entry]["track_ATR_multiplier"];
        let delta_af = that.cfg[entry]["delta_af"];
        let bar_enter_limit = that.cfg[entry]["bar_enter_limit"];

        // cal indicators -----------------------------------------------
        // STR策略中用的是true_ATR，即计算过去一段时间每个interval内的High - Low，取其中的最大值作为ATR
        let highs = Object.values(that.klines[entry]["high"]).slice(1);
        let lows = Object.values(that.klines[entry]["low"]).slice(1);
        let H_Ls = highs.map((high, i) => high - lows[i]);
        let track_ATR = Math.max(...H_Ls);
        let up = that.klines[entry]["open"][0] + track_ATR * track_ATR_multiplier;
        let dn = that.klines[entry]["open"][0] - track_ATR * track_ATR_multiplier;
        let up_price = stratutils.transform_with_tick_size(up, PRICE_TICK_SIZE[idf]);
        let dn_price = stratutils.transform_with_tick_size(dn, PRICE_TICK_SIZE[idf], "round");  // 如果dn_price是负数，会被round成最小价
        that.status_map[entry]["up"] = up_price;
        that.status_map[entry]["dn"] = dn_price;

        if (isNaN(up_price) || (isNaN(dn_price))) return;

        let label, target, tgt_qty, direction;

        if (that.status_map[entry]["status"] === "EMPTY") {

            if ((price >= up_price) && (bar_enter_n < bar_enter_limit)) {
                // STR::突破上轨做多
                label = "UP", target = "LONG", direction = DIRECTION.BUY;
                tgt_qty = stratutils.transform_with_tick_size(ini_usdt / up_price, QUANTITY_TICK_SIZE[idf]);
            } else if ((price <= dn_price) && (bar_enter_n < bar_enter_limit)) {
                // STR::突破下轨做空
                label = "DN", target = "SHORT", direction = DIRECTION.SELL;
                tgt_qty = stratutils.transform_with_tick_size(ini_usdt / dn_price, QUANTITY_TICK_SIZE[idf]);
            }

        } else if (that.status_map[entry]["status"] === "LONG") {
            // STR::LONG，即up break导致的做多
            if (new_bar) {
                // STR::new_bar出现，更新相关参数
                that.status_map[entry]["bar_n"] += 1;
                if (that.status_map[entry]["bar_n"] !== 1) {
                    if (that.klines[entry]["high"][1] > that.status_map[entry]["ep"]) {
                        // STR::过去的一根bar有更高价，更新ep和af
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

            let stoploss_price = that.status_map[entry]["sar"];

            // STR::开仓那根bar内不作任何操作
            if (that.status_map[entry]["bar_n"] === 0) return;

            if (stoploss_price < dn_price) {
                // STR::dn_price更高，对手单应为反手单
                
                if (price <= dn_price) {
                    // STR::LONG状态下价格突破下轨，下反手单
                    label = "ANTI_L|REVERSE", target = "SHORT", direction = DIRECTION.SELL;
                    tgt_qty = stratutils.transform_with_tick_size(that.status_map[entry]["pos"] + ini_usdt / dn_price, QUANTITY_TICK_SIZE[idf]);
                }

            } else {
                // STR::止损价更高，反手单应为止损单

                if (price <= stoploss_price) {
                    // STR::LONG状态下价格突破止损价，下止损单
                    label = "ANTI_L|STOPLOSS", target = "EMPTY", direction = DIRECTION.SELL;
                    tgt_qty = stratutils.transform_with_tick_size(that.status_map[entry]["pos"], QUANTITY_TICK_SIZE[idf]);
                }

            }
        } else if (that.status_map[entry]["status"] === "SHORT") {
            // STR::SHORT，即dn break导致的做空
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

            let stoploss_price = that.status_map[entry]["sar"];

            // 开仓当天不作任何操作
            if (that.status_map[entry]["bar_n"] === 0) return;

            if (stoploss_price > up_price) {
                // STR::up_price更低，对手单应为反手单
                
                if (price >= up_price) {
                    // STR::SHORT状态下突破上轨，反手做多
                    label = "ANTI_S|REVERSE", target = "LONG", direction = DIRECTION.BUY;
                    tgt_qty = stratutils.transform_with_tick_size(- that.status_map[entry]["pos"] + ini_usdt / up_price, QUANTITY_TICK_SIZE[idf]);
                }

            } else {
                // STR::止损价更低，对手单应为止损单

                if (price >= stoploss_price) {
                    // STR::SHORT状态下突破上轨，反手做多
                    label = "ANTI_S|STOPLOSS", target = "EMPTY", direction = DIRECTION.BUY;
                    tgt_qty = stratutils.transform_with_tick_size(- that.status_map[entry]["pos"], QUANTITY_TICK_SIZE[idf]);
                }

            }
        }

        // STR::发单并更新status_map和order_map
        if (label !== undefined) {
            let client_order_id = that.alias + interval.padStart(3, '0') + LABELMAP[label] + randomID(5);  // client_order_id总共13位
            that.status_map[entry]["status"] = "TBA";
            that.order_map[entry][client_order_id] = {label: label, target: target, quantity: tgt_qty, time: moment.now(), filled: 0};
            
            that.send_order({
                label: label,
                target: target,
                exchange: exchange,
                symbol: symbol,
                contract_type: contract_type,
                quantity: tgt_qty,
                direction: direction,
                order_type: ORDER_TYPE.MARKET,
                account_id: act_id,
                client_order_id: client_order_id
            });
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

        let label = response["request"]["label"];
        let target = response["request"]["target"];
        let quantity = response["request"]["quantity"];
        let direction = response["request"]["direction"];

        let interval = (client_order_id.slice(3, 4) === "0")? client_order_id.slice(4, 6): client_order_id.slice(3, 6);
        let idf = [exchange, symbol, contract_type].join(".");
        let entry = [exchange, symbol, contract_type, interval].join(".");
        let order_idf = [act_id, symbol, interval, direction, label, client_order_id].join("|");

        if (response["metadata"]["metadata"]["result"] === false) {
            // 发单失败，因为1分钟后会inspect order，所以时间定为2分钟后
            setTimeout(() => delete that.order_map[entry][client_order_id], 1000 * 60 * 2);

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
                logger.warn(`${this.name}: price limit, this is not supposed to happen!`)
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
                logger.debug(`${that.alias}::${order_idf}::Unknown order sent during placing order? Please check!`);
            } else if (error_code_msg === "Price less than min price.") {
                // STR::价格低于最低发单价，对于本策略来说不太可能
            } else if (error_code_msg === "Order would immediately trigger.") {
                // The order would be triggered immediately, STOP order才会报这样的错，本策略都是LIMIT ORDER
            } else if (error_code_msg === "Server is currently overloaded with other requests. Please try again in a few minutes.") {
                resend = true, timeout = 1000 * 5;
            } else {
                logger.warn(`${that.alias}::on_response|${order_idf}::unknown error occured during ${action}: ${error_code}: ${error_code_msg}`);
                return;
            }

            if (resend) {
                logger.info(`${that.alias}::${order_idf}::resend the order in ${timeout} ms!`);
                setTimeout(() => {
                    retry = (retry === undefined) ? 1 : retry + 1; 
                    let new_client_order_id = that.alias + interval.padStart(3, '0') + LABELMAP[label] + randomID(5);  // client_order_id总共13位
                    
                    // STR::注意：order_map里面的key只有ANTI_L, ANTI_S, UP, DN四种，但是label有六种！
                    that.order_map[entry][new_client_order_id] = {label: label, target: target, quantity: quantity, time: moment.now(), filled: 0};
    
                    that.send_order({
                        retry: retry,
                        label: label,
                        target: target,
                        exchange: exchange,
                        symbol: symbol,
                        contract_type: contract_type,
                        quantity: quantity, 
                        direction: direction,
                        order_type: ORDER_TYPE.MARKET,
                        account_id: act_id,
                        client_order_id: new_client_order_id
                    });
                }, timeout);
            }
        } else {
            // 订单发送成功，对于market order来说就意味着成交
            logger.info(`${this.alias}::on_response|${order_idf} submitted!`);
        }
    }

    on_active_orders(response) {
        let that = this;

        let act_id = response["metadata"]["metadata"]["account_id"];
        if (!that.cfg["act_ids"].includes(act_id)) return;

        let orders = response["metadata"]["metadata"]["orders"];

        // 检查异常单：下单超过10分钟，还是没成交
        let wierd_orders = orders.filter(item => (item.client_order_id.slice(0, 3) == that.alias) && (item["filled"] < item["original_amount"]) && (moment.now() - moment(item["create_time"], 'YYYYMMDDHHmmssSSS', 'Asia/Shanghai').toDate() > 1000 * 60 * 10));
        if (wierd_orders.length !== 0) {
            that.slack_publish({
                "type": "alert",
                "msg": `${that.alias}::wierd orders found: ${JSON.stringify(wierd_orders)}, not filled after 10min!`
            });
        }

    }
}

module.exports = SimpleTrendStrategy;

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

        strategy = new SimpleTrendStrategy("SimpleTrend", alias, new Intercom(intercom_config));
        strategy.start();
    }
});

process.on('SIGINT', async () => {
    logger.info(`${strategy.alias}::SIGINT`);
    /* Note: Just work under pm2 environment */
    setTimeout(() => process.exit(), 3000)
});

process.on('exit', async () => {
    logger.info(`${strategy.alias}:: exit`);
});

process.on('uncaughtException', (err) => {
    logger.error(`uncaughtException: ${JSON.stringify(err.stack)}`);
});

process.on('unhandledRejection', (reason, p) => {
    logger.error(`unhandledRejection: ${p}, reason: ${reason}`);
});