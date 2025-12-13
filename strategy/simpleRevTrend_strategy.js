/**
 * 策略别名：SRE
 * 策略类型：振荡类型
 * 策略逻辑：
 *  1、在interval的open时发UP，DN单（均为limit)，一旦DN被触发，则取消UP单；
 *  2、在触发的当前interval下，除了取消DN单外，不下其他单；
 *  3、在之后interval，开始发两个单，一个高价反手单（ANTI_L|REVERSE，limit order），一个低价止损单（ANTI_L|STOPLOSS, stop market order）,
 *     其中高价反手单其实就是up_price，而低价止损单的止损价用的是sar
 */

require("../config/typedef.js");
const fs = require("fs");
const moment = require("moment");
const assert = require("assert");
const randomID = require("random-id");

const Intercom = require("../module/intercom.js");
const logger = require("../module/logger.js");
const request = require('../module/request.js');
const utils = require("../utils/util_func.js");
const stratutils = require("../utils/strat_util.js");
const StrategyBase = require("./strategy_base.js");
const token = require("../config/token.json");

class SimpleRevTrendStrategy extends StrategyBase {
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

        that.cfg["cfgIDs"].forEach((cfgID, index) => {
            let idf = that.cfg[cfgID]["idf"];
            let entry = that.cfg[cfgID]["entry"];
            if (!(cfgID in that.status_map)) return;
            let item = {};

            // 计算time_gap
            let price_presentation = "";
            if (that.prices[idf]) {
                let gap = Math.round((moment.now() - utils._util_convert_timestamp_to_date(that.prices[idf]["upd_ts"])) / 1000);
                price_presentation = `${that.prices[idf]["price"]}|${gap}`;
                if (that.status_map[cfgID]["status"] === "LONG") {
                    let percentage = that.status_map[cfgID]["enter"] ? ((that.prices[idf]["price"] - that.status_map[cfgID]["enter"]) / that.status_map[cfgID]["enter"] * 100).toFixed(0) + "%" : "miss";
                    price_presentation += "|" + percentage;
                } else if (that.status_map[cfgID]["status"] === "SHORT") {
                    let percentage = that.status_map[cfgID]["enter"] ? ((that.status_map[cfgID]["enter"] - that.prices[idf]["price"]) / that.status_map[cfgID]["enter"] * 100).toFixed(0) + "%" : "miss";
                    price_presentation += "|" + percentage;
                }
            }

            item[`${index + 1}|cfgID`] = cfgID;
            item[`${index + 1}|entry`] = entry;
            item[`${index + 1}|status`] = that.status_map[cfgID]["status"];
            item[`${index + 1}|triggered`] = that.status_map[cfgID]["triggered"];
            item[`${index + 1}|pos`] = that.status_map[cfgID]["pos"];
            item[`${index + 1}|fee`] = that.status_map[cfgID]["fee"];
            item[`${index + 1}|np`] = that.status_map[cfgID]["net_profit"];
            item[`${index + 1}|price`] = price_presentation;
            item[`${index + 1}|enter`] = that.status_map[cfgID]["enter"];
            item[`${index + 1}|sar`] = that.status_map[cfgID]["sar"];
            item[`${index + 1}|up`] = that.status_map[cfgID]["up"];
            item[`${index + 1}|dn`] = that.status_map[cfgID]["dn"];
            sendData["data"].push(item);
        });

        this.intercom.emit("UI_update", sendData, INTERCOM_SCOPE.UI);
    }

    query_active_orders() {
        let that = this;
        for (let act_id of that.cfg["act_ids"]) {
            that.query_orders({
                exchange: EXCHANGE.BINANCEU,
                contract_type: CONTRACT_TYPE.PERP,
                account_id: act_id,
            });
        }
    }

    init_order_map() {
        let that = this;

        // 注意exists和require的路径设置是不一样的
        that.order_map = (!fs.existsSync(`./config/order_map_${that.alias}.json`)) ? {} : require(`../config/order_map_${that.alias}`);

        // TODO: how to differ from new_start and first initialization
        that.cfg["cfgIDs"].forEach((cfgID) => {
            if (that.cfg["clear_existing_status"]) {
                that.order_map[cfgID] = {};
            } else {
                that.order_map[cfgID] = (that.order_map[cfgID]) ? that.order_map[cfgID] : {};
                // 如果cfgID已经下架，则对应的order_map应该删除
                let not_existed_cfgIDs = Object.keys(that.order_map).filter(e => !that.cfg["cfgIDs"].includes(e));
                not_existed_cfgIDs.forEach(cfgID => {
                    delete that.order_map[cfgID];
                });
            }
        });
    }

    init_status_map() {
        let that = this;

        that.status_map = (!fs.existsSync(`./config/status_map_${that.alias}.json`)) ? {} : require(`../config/status_map_${that.alias}`);

        that.cfg["cfgIDs"].forEach((cfgID) => {
            if ((that.status_map[cfgID] === undefined) || (that.cfg["clear_existing_status"])) {
                that.status_map[cfgID] = {
                    "status": "EMPTY",
                    "pos": 0,
                    "real_pos": "",
                    "triggered": "",
                    "up": "",
                    "dn": "",
                    "enter": "",
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
        let status_list = that.cfg["cfgIDs"].map((cfgID) => that.status_map[cfgID]["status"]);
        let long_num = status_list.map((element) => element === "LONG").reduce((a, b) => a + b, 0);
        let short_num = status_list.map((element) => element === "SHORT").reduce((a, b) => a + b, 0);
        that.summary["overall"]["long_num"] = long_num;
        that.summary["overall"]["short_num"] = short_num;
    }

    load_klines() {
        let that = this;
        that.cfg["cfgIDs"].forEach((cfgID) => {
            that.load_cfgID_klines(cfgID);
        });
    }

    load_cfgID_klines(cfgID) {
        let that = this;

        that.klines[cfgID] = { "ts": [], "open": [], "high": [], "low": [], "ready": false };

        let idf = that.cfg[cfgID]["idf"];
        let entry = that.cfg[cfgID]["entry"];
        let [exchange, symbol, contract_type, interval] = entry.split(".");
        let num = (interval === "1d") ? 24 : parseInt(interval.split("h")[0]);
        assert(["1d", "12h", "8h", "6h", "4h", "3h", "2h", "1h"].includes(interval));

        let n_klines = (that.cfg[cfgID]["track_ATR_n"] + 1) * num;
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
                if ((interval === "1h") || (hour % num === that.cfg[cfgID]["splitAt"])) {
                    that.klines[cfgID]["ts"].push(ts);
                    that.klines[cfgID]["open"].push(parseFloat(body[i][1]));
                    that.klines[cfgID]["high"].push(high);
                    that.klines[cfgID]["low"].push(low);
                    high = Number.NEGATIVE_INFINITY;
                    low = Number.POSITIVE_INFINITY;
                }
            }
        });

        setTimeout(() => {
            logger.info(`${cfgID}:${JSON.stringify(that.klines[cfgID])}`);
            if ((that.klines[cfgID]["ts"].length === 0) || (isNaN(that.klines[cfgID]['open'][0]))) {
                logger.info(`Something is wrong with klines loading, reloading ${entry} klines ...`);
                that.load_cfgID_klines(cfgID);
            } else {
                that.klines[cfgID]["ready"] = true;
            }
        }, 5000);
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

        // client_order_id format: SRE0001DNxxxxx: {012}{3456}{78}{90123}
        // 不是本策略的订单更新，自动过滤（这里不能删！）
        let cfgID = client_order_id.slice(0, 7);
        if (client_order_id.slice(0, 3) !== that.alias) return;
        logger.info(`${cfgID}::on_order_update|${JSON.stringify(order_update)}`);
        
        let idf = [exchange, symbol, contract_type].join(".");
        let entry = that.cfg[cfgID]["entry"];
        let interval = entry.split(".")[4];

        // 确定label以及order_idf
        let label = client_order_id.slice(7, 9);
        if (!Object.values(LABELMAP).includes(label)) {
            logger.info(`${cfgID}::on_order_update|unknown order label ${label}!`);
            return;
        } else {
            label = stratutils.get_key_by_value(LABELMAP, label);   
        }
        let order_idf = [act_id, symbol, interval, direction, client_order_id].join("|");

        if (order_status === ORDER_STATUS.SUBMITTED) {

            let submit_price = order_update["order_info"]["submit_price"];
            let original_amount = order_update["order_info"]["original_amount"];
            logger.info(`${cfgID}::on_order_update|${order_idf} ${order_type} order ${original_amount} placed @${submit_price} after ${update_type}!`);

        } else if (order_status === ORDER_STATUS.CANCELLED) {

            logger.info(`${cfgID}::on_order_update|${order_idf} ${order_type} order cancelled after ${update_type}!`);
            if (update_type === "cancelled") {
                // 订单已经撤销，100毫秒后从order_map中删除该订单（1分钟之后的原因是防止on_response还要用）
                logger.info(`${cfgID}::on_order_update|${order_idf} ${order_type} order cancelled, will be removed from order_map in 200ms!`);
                setTimeout(() => delete that.order_map[cfgID][client_order_id], 100);
            } else if (update_type === "expired") {
                // Just expired (usually the stop order triggered), Do nothing here!
            } else {
                logger.info(`${cfgID}::Unhandled update type: ${update_type}`);
            }

        } else if ((order_status === ORDER_STATUS.FILLED) || (order_status === ORDER_STATUS.PARTIALLY_FILLED)) {

            let original_amount = order_update["order_info"]["original_amount"];
            let filled = order_update["order_info"]["filled"];
            let new_filled = order_update["order_info"]["new_filled"];
            let submit_price = order_update["order_info"]["submit_price"];
            let avg_executed_price = order_update["order_info"]["avg_executed_price"];
            let fee = order_update["metadata"]["fee"];

            logger.info(`${cfgID}::on_order_update|${order_idf} ${order_type} order ${filled}/${original_amount} filled @${avg_executed_price}/${submit_price}!`);

            // 对于UP ORDER无论是完全成交还是部分成交，都撤销DN ORDER；DN ORDER同理
            // "DN"如果还在order_map里面，说明还没被撤销；如果不在了，说明已经撤销了，不需要再进行撤销
            // 同理："UP"如果还在order_map里面，说明还没被撤销；如果不在了，说明已经撤销了，不需要再进行撤销
            if ((label === "UP") && ("DN" in that.order_map[cfgID])) {
                // The UP ORDER got filled, cancel the DN order
                that.cancel_order({
                    exchange: exchange,
                    symbol: symbol,
                    contract_type: contract_type,
                    order_type: ORDER_TYPE.LIMIT,
                    client_order_id: that.order_map[cfgID]["DN"]["client_order_id"],
                    account_id: act_id,
                });
                // 这里删除以label为key的item，在on_order_update里面删除以client_order_id为key的item
                delete that.order_map[cfgID]["DN"];
            } else if ((label === "DN") && ("UP" in that.order_map[cfgID])) {
                // The DN ORDER got filled, cancel the UP order
                that.cancel_order({
                    exchange: exchange,
                    symbol: symbol,
                    contract_type: contract_type,
                    order_type: ORDER_TYPE.LIMIT,
                    client_order_id: that.order_map[cfgID]["UP"]["client_order_id"],
                    account_id: act_id,
                });
                // 这里删除label，在on_order_update里面删除client_order_id
                delete that.order_map[cfgID]["UP"];
            } else if ((label === "ANTI_L|STOPLOSS") && ("ANTI_L|REVERSE" in that.order_map[cfgID])) {
                // The ANTI_L|STOPLOSS ORDER got filled, cancel the ANTI_L|REVERSE order
                that.cancel_order({
                    exchange: exchange,
                    symbol: symbol,
                    contract_type: contract_type,
                    order_type: ORDER_TYPE.LIMIT,
                    client_order_id: that.order_map[cfgID]["ANTI_L|REVERSE"]["client_order_id"],
                    account_id: act_id,
                });
                // 这里删除label，在on_order_update里面删除client_order_id
                delete that.order_map[cfgID]["ANTI_L|REVERSE"];
            } else if ((label === "ANTI_L|REVERSE") && ("ANTI_L|STOPLOSS" in that.order_map[cfgID])) {
                // The ANTI_L|REVERSE ORDER got filled, cancel the ANTI_L|STOPLOSS order
                that.cancel_order({
                    exchange: exchange,
                    symbol: symbol,
                    contract_type: contract_type,
                    order_type: ORDER_TYPE.STOP_MARKET,
                    client_order_id: that.order_map[cfgID]["ANTI_L|STOPLOSS"]["client_order_id"],
                    account_id: act_id,
                });
                // 这里删除label，在on_order_update里面删除client_order_id
                delete that.order_map[cfgID]["ANTI_L|STOPLOSS"];
            } else if ((label === "ANTI_S|STOPLOSS") && ("ANTI_S|REVERSE" in that.order_map[cfgID])) {
                // The ANTI_S|STOPLOSS ORDER got filled, cancel the ANTI_S|REVERSE order
                that.cancel_order({
                    exchange: exchange,
                    symbol: symbol,
                    contract_type: contract_type,
                    order_type: ORDER_TYPE.LIMIT,
                    client_order_id: that.order_map[cfgID]["ANTI_S|REVERSE"]["client_order_id"],
                    account_id: act_id,
                });
                // 这里删除label，在on_order_update里面删除client_order_id
                delete that.order_map[cfgID]["ANTI_S|REVERSE"];
            } else if ((label === "ANTI_S|REVERSE") && ("ANTI_S|STOPLOSS" in that.order_map[cfgID])) {
                // The ANTI_S|REVERSE ORDER got filled, cancel the ANTI_S|STOPLOSS order
                that.cancel_order({
                    exchange: exchange,
                    symbol: symbol,
                    contract_type: contract_type,
                    order_type: ORDER_TYPE.STOP_MARKET,
                    client_order_id: that.order_map[cfgID]["ANTI_S|STOPLOSS"]["client_order_id"],
                    account_id: act_id,
                });
                // 这里删除label，在on_order_update里面删除client_order_id
                delete that.order_map[cfgID]["ANTI_S|STOPLOSS"];
            } 

            // 更新order_map
            that.order_map[cfgID][client_order_id]["filled"] = filled;

            // 更新position
            that.status_map[cfgID]["pos"] += (direction === DIRECTION.BUY) ? new_filled : - new_filled;
            that.status_map[cfgID]["fee"] += fee;
            that.status_map[cfgID]["quote_ccy"] += (direction === DIRECTION.SELL) ? new_filled * avg_executed_price : - new_filled * avg_executed_price;

            that.status_map[cfgID]["pos"] = stratutils.transform_with_tick_size(that.status_map[cfgID]["pos"], QUANTITY_TICK_SIZE[idf]);
            that.status_map[cfgID]["fee"] = stratutils.transform_with_tick_size(that.status_map[cfgID]["fee"], 0.001);
            that.status_map[cfgID]["quote_ccy"] = stratutils.transform_with_tick_size(that.status_map[cfgID]["quote_ccy"], 0.01);

            // 检查一下status_map变化
            logger.info(`${cfgID}::${JSON.stringify(that.status_map[cfgID])}`);
            logger.info(`${cfgID}::${JSON.stringify(that.order_map[cfgID])}`);

            if (order_status === ORDER_STATUS.FILLED) {
                // 订单完全成交，更新status_map
                that.status_map[cfgID]["status"] = that.order_map[cfgID][client_order_id]["target"];

                // 订单完全成交，不再是触发状态
                // 如果赋值为undefined，在UI那边会缓存为之前的那个值，影响判断，所以这里赋值为""
                that.status_map[cfgID]["triggered"] = "";
                if (that.status_map[cfgID]["status"] === "EMPTY") {
                    // 订单完全成交，仓位变为空，这说明是平仓单
                    // 平仓之后不要继续开仓，因此stop_market order成交后bar_enter_n设置为1

                    // target是EMPTY的订单有以下几种情况：
                    // ANTI_L|STOPLOSS, ANTI_S|STOPLOSS，这种都是stop market order，一旦触发自动成交，因此不涉及deal_with_TBA的问题
                    // ANTI_L|REVERSE, ANTI_S|REVERSE部分触发，仓位又没有发生反转，当达到newbar时，触发deal_with_TBA, 此时撤销原来的REVERSE订单，改发STOPLOSS订单，这种都是market order
                    if (order_type === ORDER_TYPE.STOP_MARKET) that.status_map[cfgID]["bar_enter_n"] = 1;

                    for (let item of ["bar_n", "ep", "af", "sar", "enter"]) {
                        that.status_map[cfgID][item] = "";
                    }
                } else {
                    let cutloss_rate = that.cfg[cfgID]["cutloss_rate"];

                    that.status_map[cfgID]["bar_n"] = 0;
                    that.status_map[cfgID]["af"] = that.cfg[cfgID]["ini_af"];
                    that.status_map[cfgID]["bar_enter_n"] += 1;
                    that.status_map[cfgID]["ep"] = avg_executed_price;

                    that.status_map[cfgID]["enter"] = avg_executed_price;
                    that.status_map[cfgID]["sar"] = (that.status_map[cfgID]["status"] === "LONG")? avg_executed_price * (1 - cutloss_rate) : avg_executed_price * (1 + cutloss_rate);

                    that.status_map[cfgID]["ep"] = stratutils.transform_with_tick_size(that.status_map[cfgID]["ep"], PRICE_TICK_SIZE[idf]);
                    that.status_map[cfgID]["sar"] = stratutils.transform_with_tick_size(that.status_map[cfgID]["sar"], PRICE_TICK_SIZE[idf]);
                }

                // 订单完全成交，在order_map中删去该订单（注意：完全成交才删除，且当场删除！）
                delete that.order_map[cfgID][label];

                // remove the client_order_id from order_map 100ms later, as the on_response may need to use it!
                setTimeout(() => delete that.order_map[cfgID][client_order_id], 100);

                // 检查LONG和SHORT的个数
                let status_list = that.cfg["cfgIDs"].map((cfgID) => that.status_map[cfgID]["status"]);
                let long_num = status_list.map((element) => element === "LONG").reduce((a, b) => a + b, 0);
                let short_num = status_list.map((element) => element === "SHORT").reduce((a, b) => a + b, 0);
                that.summary["overall"]["long_num"] = long_num;
                that.summary["overall"]["short_num"] = short_num;

            } else {
                // 订单部分成交，处于触发状态
                that.status_map[cfgID]["status"] = "TBA";
                that.status_map[cfgID]["triggered"] = label;
            }

            // record the order filling details
            let ts = order_update["metadata"]["timestamp"];
            let filled_info = [act_id, exchange, symbol, contract_type, client_order_id, order_type, original_amount, filled, submit_price, avg_executed_price, fee].join(",");
            // order_map中只提取label,target,quantity,time,filled等信息
            let order_info = (that.order_map[cfgID][client_order_id] === undefined) ? "" : Object.entries(that.order_map[cfgID][client_order_id]).filter((element) => ["label", "target", "quantity", "time", "filled"].includes(element[0])).map((element) => element[1]).join(",");
            let output_string = [ts, filled_info, order_info].join(",");
            output_string += (order_status === ORDER_STATUS.FILLED) ? ",filled\n" : ",partially_filled\n";
            fs.writeFile(`./log/order_filling_${this.alias}.csv`, output_string, { flag: "a+" }, (err) => {
                if (err) logger.info(`${this.alias}::${err}`);
            });
        } else {
            logger.info(`${cfgID}::on_order_update|Unhandled order update status: ${order_status}!`)
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

        // logger.info(`${this.alias}::${JSON.stringify(trade)}`);

        let corr_cfgIDs = that.cfg["cfgIDs"].filter((cfgID) => that.cfg[cfgID]["idf"] === idf);
        for (let cfgID of corr_cfgIDs) {
            if (!that.klines[cfgID]["ready"]) return;
            let entry = that.cfg[cfgID]["entry"];
            let interval = entry.split(".")[3];

            // logger.info(symbol, ts, that.cur_bar_otime[idf], that.pre_bar_otime[idf]);
            that.cur_bar_otime[cfgID] = stratutils.cal_bar_otime(ts, interval, that.cfg[cfgID]["splitAt"]);
            // if the pre_bar_otime is undefined, it means the strategy is re-started
            let new_start = (that.pre_bar_otime[cfgID] === undefined);
            // new interal is not new_start, new bar means a new bar starts
            let new_bar = (!new_start) && (that.cur_bar_otime[cfgID] !== that.pre_bar_otime[cfgID]);

            if (new_start) {
                logger.info(`${cfgID}::NEW START!`);
            } else if (new_bar) {
                logger.info(`${cfgID}::NEW BAR!::${JSON.stringify(trade)}`);
                // 如果一些订单已经触发但是迟迟不能成交，必须进行处理
                // TODO: 如果在new_bar的一瞬间正在部分成交（虽然是小概率事件），怎么办？
                that.status_map[cfgID]["bar_enter_n"] = 0;
                if (that.status_map[cfgID]["status"] === "TBA") that.deal_with_TBA(cfgID);
            }

            if (that.cur_bar_otime[cfgID] > that.klines[cfgID]["ts"][0]) {
                that.klines[cfgID]["ts"].unshift(that.cur_bar_otime[cfgID]);
                that.klines[cfgID]["ts"].pop();
                that.klines[cfgID]["open"].unshift(price);
                that.klines[cfgID]["open"].pop();
                that.klines[cfgID]["high"].unshift(price);
                that.klines[cfgID]["high"].pop();
                that.klines[cfgID]["low"].unshift(price);
                that.klines[cfgID]["low"].pop();
            } else if (that.cur_bar_otime[cfgID] === that.klines[cfgID]["ts"][0]) {
                that.klines[cfgID]["high"][0] = Math.max(price, that.klines[cfgID]["high"][0]);
                that.klines[cfgID]["low"][0] = Math.min(price, that.klines[cfgID]["low"][0]);
            } else {
                // logger.debug(`${that.alias}::${cfgID}::cur_bar_otime is smaller than klines ts[0]?`);
            }

            if (new_bar) {
                // 检查一下kline
                logger.info(`${cfgID}::NEW BAR::${JSON.stringify(that.klines[cfgID])}!`);
            }

            // update bar open time and net_profit
            that.pre_bar_otime[cfgID] = that.cur_bar_otime[cfgID];

            // 下单逻辑模块
            that.status_map[cfgID]["net_profit"] = that.status_map[cfgID]["quote_ccy"] + that.status_map[cfgID]["pos"] * price - that.status_map[cfgID]["fee"];
            that.status_map[cfgID]["net_profit"] = stratutils.transform_with_tick_size(that.status_map[cfgID]["net_profit"], 0.01);
            that.main_execuation(new_start, new_bar, cfgID);
        }
    }

    deal_with_TBA(cfgID) {
        logger.info(`${cfgID}::deal with TBA: ${JSON.stringify(this.order_map)}`);

        let that = this;
        let idf = that.cfg[cfgID]["idf"];
        let entry = that.cfg[cfgID]["entry"];
        let [exchange, symbol, contract_type, interval] = entry.split(".");
        let act_id = that.cfg[cfgID]["act_id"];

        let triggered = that.status_map[cfgID]["triggered"];
        let up_price = that.status_map[cfgID]["up"];
        let dn_price = that.status_map[cfgID]["dn"];

        let cutloss_rate = that.cfg[cfgID]["cutloss_rate"];
        // {order_type: "", client_order_id: ""}
        let orders_to_be_cancelled = [];    
        // deal_with_TBA这里默认都是发MARKET单解决部分触发导致的遗留问题
        // {label: "", target: "", quantity: "", price: "", direction: "", order_type: ""}
        let orders_to_be_submitted = [];

        if (triggered === "UP") {

            // 开仓单开了一半，剩下的撤单，直接转为对应的status
            logger.info(`${cfgID}::${act_id}|${entry} deal with TBA: cancel the remaining UP order!`);
            let up_client_order_id = that.order_map[cfgID]["UP"]["client_order_id"];
            orders_to_be_cancelled.push( {order_type: ORDER_TYPE.LIMIT, client_order_id: up_client_order_id });
            that.status_map[cfgID]["status"] = "SHORT";

        } else if (triggered === "DN") {

            // 开仓单开了一半，剩下的放弃，直接转为对应的status
            logger.info(`${cfgID}::${act_id}|${entry} deal with TBA: cancel the remaining DN order!`);
            let dn_client_order_id = that.order_map[cfgID]["DN"]["client_order_id"];
            orders_to_be_cancelled.push({ order_type: ORDER_TYPE.LIMIT, client_order_id: dn_client_order_id });
            that.status_map[cfgID]["status"] = "LONG";

        } else if (triggered === "ANTI_L|REVERSE") {

            // 反手单未能成交，撤销该单，放弃反手，改为市价平仓
            let anti_client_order_id = that.order_map[cfgID]["ANTI_L|REVERSE"]["client_order_id"];
            orders_to_be_cancelled.push({ order_type: ORDER_TYPE.LIMIT, client_order_id: anti_client_order_id });

            if (that.status_map[cfgID]["pos"] < 0) {
                // 已经部分反手，放弃剩下的反手
                logger.info(`${cfgID}::${act_id}|${entry} deal with TBA: cancel the remaining ANTI_L order!`);
                that.status_map[cfgID]["status"] = "SHORT";
            } else if (that.status_map[cfgID]["pos"] === 0) {
                // 已经平仓，放弃剩下的反手
                logger.info(`${cfgID}::${act_id}|${entry} deal with TBA: cancel the remaining ANTI_L order!`);
                that.status_map[cfgID]["status"] = "EMPTY";
            } else {
                // 部分平仓，要求继续平仓，市价的0.97倍折出售，放弃剩下的反手
                // 因为binance对限价单价格有限制，通常不能超过标记价格的5%
                logger.info(`${cfgID}::${act_id}|${entry} deal with TBA: cover the LONG position!`);
                let tgt_qty = that.status_map[cfgID]["pos"];
                orders_to_be_submitted.push({ client_order_id: cfgID + LABELMAP["ANTI_L|STOPLOSS"] + randomID(5), label: "ANTI_L|STOPLOSS", target: "EMPTY", quantity: tgt_qty, direction: DIRECTION.SELL });
            }
            
        } else if (triggered === "ANTI_S|REVERSE") {

            // 反手单未能成交，撤销该单，放弃反手，改为市价平仓
            let anti_client_order_id = that.order_map[cfgID]["ANTI_S|REVERSE"]["client_order_id"];
            orders_to_be_cancelled.push({ order_type: ORDER_TYPE.LIMIT, client_order_id: anti_client_order_id });

            if (that.status_map[cfgID]["pos"] > 0) {
                // 已经部分反手，放弃剩下的反手
                logger.info(`${cfgID}::${act_id}|${entry} deal with TBA: cancel the remaining ANTI_S order!`);
                that.status_map[cfgID]["status"] = "LONG";
            } else if (that.status_map[cfgID]["pos"] === 0) {
                // 已经平仓，放弃剩下的反手
                logger.info(`${cfgID}::${act_id}|${entry} deal with TBA: cancel the remaining ANTI_S order!`);
                that.status_map[cfgID]["status"] = "EMPTY";
            } else {
                // 部分平仓，要求继续平仓，市价单平仓，放弃剩下的反手
                // 因为binance对限价单价格有限制，通常不能超过标记价格的5%
                logger.info(`${cfgID}::${act_id}|${entry} deal with TBA: cover the SHORT position!`);
                let tgt_qty = - that.status_map[cfgID]["pos"];
                orders_to_be_submitted.push({ client_order_id: cfgID + LABELMAP["ANTI_S|STOPLOSS"] + randomID(5), label: "ANTI_S|STOPLOSS", target: "EMPTY", quantity: tgt_qty, direction: DIRECTION.BUY });
            }

        } else {
            logger.info(`${cfgID}::TBA and new_bar handling: unhandled ${that.status_map[cfgID]["triggered"]}. If nothing, ignore it!`)
        }

        let current_status = that.status_map[cfgID]["status"];
        if (["LONG", "SHORT"].includes(current_status)) {
            that.status_map[cfgID]["bar_n"] = 0;    // 这里赋值为0，之后main_execuation中会加一
            that.status_map[cfgID]["af"] = that.cfg[cfgID]["ini_af"];
            that.status_map[cfgID]["sar"] = (current_status === "SHORT") ? up_price * (1 + cutloss_rate) : dn_price * (1 - cutloss_rate);
            that.status_map[cfgID]["sar"] = stratutils.transform_with_tick_size(that.status_map[cfgID]["sar"], PRICE_TICK_SIZE[idf]);
            that.status_map[cfgID]["enter"] = (current_status === "SHORT") ? up_price : dn_price;
        }

        logger.info(`${cfgID}::deal with TBA: ${JSON.stringify(that.status_map[cfgID])}`);

        orders_to_be_cancelled.forEach((order) => {
            // 这些要取消的单都是LIMIT单
            that.cancel_order({
                exchange: exchange,
                symbol: symbol,
                contract_type: contract_type,
                order_type: ORDER_TYPE.LIMIT,
                client_order_id: order.client_order_id,
                account_id: act_id,
            });
        });

        orders_to_be_submitted.forEach((order) => {
            let client_order_id = order.client_order_id, label = order.label, target = order.target, quantity = order.quantity, direction = order.direction;

            // 发送订单，同时建立order_map
            // {"3106609167": {"label": "DN", "target": "LONG", "quantity": 21133, "time": 1669492800445, "filled": 0}}
            that.order_map[cfgID][client_order_id] = { label: label, target: target, quantity: quantity, time: moment.now(), filled: 0 };
            // {"ANTI_S": { "client_order_id": "3103898618",  "label": "ANTI_S|STOPLOSS", "price": 0.3214, "quantity": 100, "time": 1669492800445}}
            that.order_map[cfgID][label] = { client_order_id: client_order_id, label: label, price: 0, quantity: quantity, time: moment.now() };

            that.send_order({
                label: label,
                target: target,
                exchange: exchange,
                symbol: symbol,
                contract_type: contract_type,
                quantity: quantity,
                direction: direction,
                order_type: ORDER_TYPE.MARKET,
                account_id: act_id,
                client_order_id: client_order_id
            });
        });
    }

    main_execuation(new_start, new_bar, cfgID) {
        let that = this;
        let idf = that.cfg[cfgID]["idf"];
        let entry = that.cfg[cfgID]["entry"];
        let [exchange, symbol, contract_type, interval] = entry.split(".");

        let price = that.prices[idf]["price"];
        let ini_usdt = (that.cfg[cfgID]["ini_usdt"]) ? that.cfg[cfgID]["ini_usdt"] : that.cfg["ini_usdt"];
        let act_id = that.cfg[cfgID]["act_id"];

        // load status_map  -----------------------------------------------
        let bar_enter_n = that.status_map[cfgID]["bar_enter_n"];

        // para loading -----------------------------------------------
        let track_ATR_multiplier = that.cfg[cfgID]["track_ATR_multiplier"];
        let delta_af = that.cfg[cfgID]["delta_af"];
        let bar_enter_limit = that.cfg[cfgID]["bar_enter_limit"];

        // cal indicators -----------------------------------------------
        let track_ATR = Math.max(...Object.values(that.klines[cfgID]["high"]).slice(1)) - Math.min(...Object.values(that.klines[cfgID]["low"]).slice(1));
        let up = that.klines[cfgID]["open"][0] + track_ATR * track_ATR_multiplier;
        let dn = that.klines[cfgID]["open"][0] - track_ATR * track_ATR_multiplier;
        let up_price = stratutils.transform_with_tick_size(up, PRICE_TICK_SIZE[idf]);
        let dn_price = stratutils.transform_with_tick_size(dn, PRICE_TICK_SIZE[idf], "round");  // 如果dn_price是负数，会被round成最小价
        that.status_map[cfgID]["up"] = up_price;
        that.status_map[cfgID]["dn"] = dn_price;

        if (isNaN(up_price) || (isNaN(dn_price))) return;

        // 只在new_bar或者new_start的时候才对发单进行调整
        if (!new_bar && !new_start) return; 

        // {order_type: "", client_order_id: ""}
        let orders_to_be_cancelled = [];    
        // {label: "", target: "", quantity: "", price: "", direction: "", order_type: ""}
        let orders_to_be_submitted = [];    

        if (that.status_map[cfgID]["status"] === "EMPTY") {

            if ((new_start || new_bar) && (bar_enter_n < bar_enter_limit)) {
                // 计算开仓量
                let up_qty = stratutils.transform_with_tick_size(ini_usdt / up_price, QUANTITY_TICK_SIZE[idf]);
                let dn_qty = stratutils.transform_with_tick_size(ini_usdt / dn_price, QUANTITY_TICK_SIZE[idf]);

                // 如果已经有UP单，撤销之
                if (that.order_map[cfgID]["UP"] !== undefined) {
                    orders_to_be_cancelled.push({ order_type: ORDER_TYPE.LIMIT, client_order_id : that.order_map[cfgID]["UP"]["client_order_id"] });
                }

                // 如果已经有DN单，撤销之
                if (that.order_map[cfgID]["DN"] !== undefined) {
                    orders_to_be_cancelled.push({ order_type: ORDER_TYPE.LIMIT, client_order_id : that.order_map[cfgID]["DN"]["client_order_id"] });
                }

                // 都是limit order
                orders_to_be_submitted.push({ label: "UP", target: "SHORT", quantity: up_qty, price: up_price, direction: DIRECTION.SELL, order_type: ORDER_TYPE.LIMIT });
                orders_to_be_submitted.push({ label: "DN", target: "LONG", quantity: dn_qty, price: dn_price, direction: DIRECTION.BUY, order_type: ORDER_TYPE.LIMIT });
            }

        } else if (that.status_map[cfgID]["status"] === "LONG") {

            if (new_bar) {
                // New bar and update the indicators
                that.status_map[cfgID]["bar_n"] += 1;
                if (that.status_map[cfgID]["bar_n"] !== 1) {
                    if (that.klines[cfgID]["high"][1] > that.status_map[cfgID]["ep"]) {
                        // if a higher high occurs, update the ep and af value
                        that.status_map[cfgID]["ep"] = that.klines[cfgID]["high"][1];
                        that.status_map[cfgID]["af"] += delta_af;
                        that.status_map[cfgID]["af"] = stratutils.transform_with_tick_size(that.status_map[cfgID]["af"], 0.01);
                    }
                    that.status_map[cfgID]["sar"] = that.status_map[cfgID]["sar"] + that.status_map[cfgID]["af"] * (that.status_map[cfgID]["ep"] - that.status_map[cfgID]["sar"]);
                    that.status_map[cfgID]["sar"] = stratutils.transform_with_tick_size(that.status_map[cfgID]["sar"], PRICE_TICK_SIZE[idf]);
                }
            }
            
            if (that.status_map[cfgID]["bar_n"] === 0) {
                // 开仓bar，ep设定为这根bar的最高价，同时不做任何处理
                that.status_map[cfgID]["ep"] = that.klines[cfgID]["high"][0];
                return;
            } else if (that.status_map[cfgID]["bar_n"] === 1) {
                // 开仓后的第一个bar，ep设定为上一个bar的最高价
                that.status_map[cfgID]["ep"] = that.klines[cfgID]["high"][1];
            }

            let stoploss_price = that.status_map[cfgID]["sar"];

            // 发两个单，一个高价反手单（limit order），一个低价止损单（stop market order）
            // 第一个单：高价反手单（limit order）
            let up_tgt_qty = stratutils.transform_with_tick_size(that.status_map[cfgID]["pos"] + ini_usdt / up_price, QUANTITY_TICK_SIZE[idf]);
            if (that.order_map[cfgID]["ANTI_L|REVERSE"] === undefined) {
                orders_to_be_submitted.push({ label: "ANTI_L|REVERSE", target: "SHORT", quantity: up_tgt_qty, price: up_price, direction: DIRECTION.SELL, order_type: ORDER_TYPE.LIMIT });
            } else {
                let current_reverse_client_order_id = that.order_map[cfgID]["ANTI_L|REVERSE"]["client_order_id"];
                let current_reverse_price = that.order_map[cfgID]["ANTI_L|REVERSE"]["price"];
                let current_reverse_qty = that.order_map[cfgID]["ANTI_L|REVERSE"]["quantity"];

                if ((current_reverse_price !== up_price) || (current_reverse_qty !== up_tgt_qty)) {
                    // 若已存的对手单（反手单）和现行不一致，则撤销重新发
                    orders_to_be_cancelled.push({ order_type: ORDER_TYPE.LIMIT, client_order_id : current_reverse_client_order_id });
                    orders_to_be_submitted.push({ label: "ANTI_L|REVERSE", target: "SHORT", quantity: up_tgt_qty, price: up_price, direction: DIRECTION.SELL, order_type: ORDER_TYPE.LIMIT });
                }
            }

            // 第二个单：低价止损单（stop market order）
            let sp_tgt_qty = stratutils.transform_with_tick_size(that.status_map[cfgID]["pos"], QUANTITY_TICK_SIZE[idf]);
            if (that.order_map[cfgID]["ANTI_L|STOPLOSS"] === undefined) {
                orders_to_be_submitted.push({ label: "ANTI_L|STOPLOSS", target: "EMPTY", quantity: sp_tgt_qty, stop_price: stoploss_price, direction: DIRECTION.SELL, order_type: ORDER_TYPE.STOP_MARKET });
            } else {
                let current_stoploss_client_order_id = that.order_map[cfgID]["ANTI_L|STOPLOSS"]["client_order_id"];
                let current_stoploss_price = that.order_map[cfgID]["ANTI_L|STOPLOSS"]["price"];
                let current_stoploss_qty = that.order_map[cfgID]["ANTI_L|STOPLOSS"]["quantity"];

                if ((current_stoploss_price !== stoploss_price) || (current_stoploss_qty !== sp_tgt_qty)) {
                    // 若已存的对手单（反手单）和现行不一致，则撤销重新发
                    orders_to_be_cancelled.push({ order_type: ORDER_TYPE.STOP_MARKET, client_order_id : current_stoploss_client_order_id });
                    orders_to_be_submitted.push({ label: "ANTI_L|STOPLOSS", target: "EMPTY", quantity: sp_tgt_qty, stop_price: stoploss_price, direction: DIRECTION.SELL, order_type: ORDER_TYPE.STOP_MARKET });
                }
            }

        } else if (that.status_map[cfgID]["status"] === "SHORT") {

            if (new_bar) {
                that.status_map[cfgID]["bar_n"] += 1;
                if (that.status_map[cfgID]["bar_n"] !== 1) {
                    if (that.klines[cfgID]["low"][1] < that.status_map[cfgID]["ep"]) {
                        that.status_map[cfgID]["ep"] = that.klines[cfgID]["low"][1];
                        that.status_map[cfgID]["af"] += delta_af;
                        that.status_map[cfgID]["af"] = stratutils.transform_with_tick_size(that.status_map[cfgID]["af"], 0.01);
                    }
                    that.status_map[cfgID]["sar"] = that.status_map[cfgID]["sar"] + that.status_map[cfgID]["af"] * (that.status_map[cfgID]["ep"] - that.status_map[cfgID]["sar"]);
                    that.status_map[cfgID]["sar"] = stratutils.transform_with_tick_size(that.status_map[cfgID]["sar"], PRICE_TICK_SIZE[idf]);
                }
            }

            if (that.status_map[cfgID]["bar_n"] === 0) {
                // 突破上轨当前bar，ep设定为该bar最低价，此外不做任何处理
                that.status_map[cfgID]["ep"] = that.klines[cfgID]["low"][0];
                return;
            } else if (that.status_map[cfgID]["bar_n"] === 1) {
                // 开仓后的第一个bar，ep设定为上一个bar的最低价
                that.status_map[cfgID]["ep"] = that.klines[cfgID]["low"][1];
            }

            let stoploss_price = that.status_map[cfgID]["sar"];

            // 发两个单，一个低价反手单（limit order），一个高价止损单（stop market order）
            // 第一个单：低价反手单（limit order）
            let dn_tgt_qty = stratutils.transform_with_tick_size(- that.status_map[cfgID]["pos"] + ini_usdt / dn_price, QUANTITY_TICK_SIZE[idf]);
            if (that.order_map[cfgID]["ANTI_S|REVERSE"] === undefined) {
                // 对手单还没有发送
                orders_to_be_submitted.push({ label: "ANTI_S|REVERSE", target: "LONG", quantity: dn_tgt_qty, price: dn_price, direction: DIRECTION.BUY, order_type: ORDER_TYPE.LIMIT });
            } else {
                // 对手单已发，检查是否需要更改
                let current_reverse_client_order_id = that.order_map[cfgID]["ANTI_S|REVERSE"]["client_order_id"];
                let current_reverse_price = that.order_map[cfgID]["ANTI_S|REVERSE"]["price"];
                let current_reverse_qty = that.order_map[cfgID]["ANTI_S|REVERSE"]["quantity"];

                // 若已存的反手单和现行不一致，则撤销重新发
                if ((current_reverse_price !== dn_price) || (current_reverse_qty !== dn_tgt_qty)) {
                    orders_to_be_cancelled.push({ order_type: ORDER_TYPE.LIMIT, client_order_id : current_reverse_client_order_id });
                    orders_to_be_submitted.push({ label: "ANTI_S|REVERSE", target: "LONG", quantity: dn_tgt_qty, price: dn_price, direction: DIRECTION.BUY, order_type: ORDER_TYPE.LIMIT });
                }
            }

            // 第二个单：高价止损单（stop market order）
            let sp_tgt_qty = stratutils.transform_with_tick_size(- that.status_map[cfgID]["pos"], QUANTITY_TICK_SIZE[idf]);
            if (that.order_map[cfgID]["ANTI_S|STOPLOSS"] === undefined) {
                // 对手单还没有发送
                orders_to_be_submitted.push({ label: "ANTI_S|STOPLOSS", target: "EMPTY", quantity: sp_tgt_qty, stop_price: stoploss_price, direction: DIRECTION.BUY, order_type: ORDER_TYPE.STOP_MARKET });
            } else {
                // 对手单已发，检查是否需要更改
                let current_stoploss_client_order_id = that.order_map[cfgID]["ANTI_S|STOPLOSS"]["client_order_id"];
                let current_stoploss_price = that.order_map[cfgID]["ANTI_S|STOPLOSS"]["price"];
                let current_stoploss_qty = that.order_map[cfgID]["ANTI_S|STOPLOSS"]["quantity"];

                // 若已存的反手单和现行不一致，则撤销重新发
                if ((current_stoploss_price !== dn_price) || (current_stoploss_qty !== sp_tgt_qty)) {
                    orders_to_be_cancelled.push({ order_type: ORDER_TYPE.STOP_MARKET, client_order_id : current_stoploss_client_order_id });
                    orders_to_be_submitted.push({ label: "ANTI_S|STOPLOSS", target: "EMPTY", quantity: sp_tgt_qty, stop_price: stoploss_price, direction: DIRECTION.BUY, order_type: ORDER_TYPE.STOP_MARKET });
                }
            }
        }

        // logger.info(`orders_to_be_cancelled: ${orders_to_be_cancelled}`);
        orders_to_be_cancelled.forEach((order) => {
            that.cancel_order({
                exchange: exchange,
                symbol: symbol,
                contract_type: contract_type,
                order_type: order.order_type,
                client_order_id: order.client_order_id,
                account_id: act_id,
            });
        });

        // logger.info(JSON.stringify(orders_to_be_submitted));
        orders_to_be_submitted.forEach((order) => {
            let label = order.label, target = order.target, quantity = order.quantity, price = order.price;
            let stop_price = order.stop_price, direction = order.direction, order_type = order.order_type;
            let client_order_id = cfgID + LABELMAP[label] + randomID(5);

            // 发送订单，同时建立order_map
            // {"3106609167": {"label": "DN", "target": "LONG", "quantity": 21133, "time": 1669492800445, "price": 0.04732, "filled": 0}}
            that.order_map[cfgID][client_order_id] = { label: label, target: target, quantity: quantity, time: moment.now(), filled: 0 };
            // {"ANTI_S|REVERSE": { "client_order_id": "3103898618",  "label": "ANTI_S|STOPLOSS", "price": 0.3214, "quantity": 100, "time": 1669492800445}}
            that.order_map[cfgID][label] = { client_order_id: client_order_id, label: label, price: price, quantity: quantity, time: moment.now() };

            that.send_order({
                label: label,
                target: target,
                exchange: exchange,
                symbol: symbol,
                contract_type: contract_type,
                price: price,       // 若为stop_market order，则为undefined
                stop_price: stop_price,     // 若为limit或者marketorder，则为undefined
                quantity: quantity,
                direction: direction,
                order_type: order_type,
                account_id: act_id,
                client_order_id: client_order_id
            });
        });
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
        let order_type = response["request"]["order_type"];
        
        let cfgID = client_order_id.slice(0, 7);
        let idf = that.cfg[cfgID]["idf"];
        let entry = that.cfg[cfgID]["entry"];
        let interval = entry.split(".")[3];
        let order_idf = [act_id, symbol, interval, direction, client_order_id].join("|");

        let label = client_order_id.slice(7, 9);
        if (!Object.values(LABELMAP).includes(label)) {
            logger.info(`${cfgID}::on_send_order_response|unknown order label ${label}!`);
            return;
        } else {
            label = stratutils.get_key_by_value(LABELMAP, label);
        }

        if (response["metadata"]["metadata"]["result"] === false) {
            // 发单失败，1分钟后删除该订单信息
            setTimeout(() => delete that.order_map[cfgID][client_order_id], 1000 * 60);

            let error_code = response["metadata"]["metadata"]["error_code"];
            let error_code_msg = response["metadata"]["metadata"]["error_code_msg"];
            let retry = response["request"]["retry"];

            if (retry === 5) {
                that.slack_publish({
                    "type": "alert",
                    "msg": `${cfgID}::${order_idf}::Send order retried over 5 times, check the code!`
                });
                return;
            }

            // 所有的发单报错都会发邮件！
            logger.debug(`${cfgID}::on_response|${order_idf}::an error occured during ${action}: ${error_code}: ${error_code_msg}`);
            that.slack_publish({
                "type": "alert",
                "msg": `${cfgID}::on_response|${order_idf}::an error occured during ${action}: ${error_code}: ${error_code_msg}`
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
                // 限价单价格发单限制，调整价格后重发
                let limit_price = parseFloat(error_code_msg.split(" ").slice(-1)[0]);
                let adj_price = stratutils.transform_with_tick_size(limit_price, PRICE_TICK_SIZE[idf]);

                let limit_type = error_code_msg.split(" ")[4];
                if ((limit_type === "higher") && (adj_price >= limit_price)) {
                    adj_price = stratutils.transform_with_tick_size(adj_price - PRICE_TICK_SIZE[idf], PRICE_TICK_SIZE[idf]);
                } else if ((limit_type === "lower") && (adj_price <= limit_price)) {
                    adj_price = stratutils.transform_with_tick_size(adj_price + PRICE_TICK_SIZE[idf], PRICE_TICK_SIZE[idf]);
                } else {
                    logger.info(`${cfgID}::${order_idf}::limit_type: ${limit_type}.`);
                }

                logger.info(`${cfgID}::${order_idf}::order out of limitation, change from ${price} to ${adj_price}.`);

                price = adj_price, resend = true;

            } else if (error_code_msg === "Exceeded the maximum allowable position at current leverage.") {
                // 杠杆问题，降低杠杆
                let key = token[act_id]["apiKey"];
                let url = "https://fapi.binance.com/fapi/v1/leverage";
                stratutils.set_leverage_by_rest(symbol, 10, url, key);

                logger.info(`${cfgID}::${order_idf}::change leverage to 10 and resent the order.`);
                resend = true;
                timeout = 1000 * 2;

            } else if (error_code_msg === "Unknown order sent.") {
                // 注意检查
                logger.debug("Unknown order sent during placing order? Please check!");
            } else if (error_code_msg === "Price less than min price.") {
                // 价格低于最低发单价，通常是DN单，那就不设置DN单
                if (label === "DN") {
                    that.status_map[cfgID]["DN"] = undefined;
                } else {
                    logger.info(`${cfgID}::${order_idf}::price less than min, but not a DN order, check!`);
                }
            } else if (error_code_msg === "Order would immediately trigger.") {
                // STOP order才会报这样的错，说明止损价已经触发，直接改发market order
                let sp_client_order_id = cfgID + LABELMAP[label] + randomID(5);;
                that.order_map[cfgID][sp_client_order_id] = { label: label, target: target, quantity: quantity, time: moment.now(), filled: 0 };
                that.order_map[cfgID][label] = { client_order_id: sp_client_order_id, label: label, price: 0, quantity: quantity, time: moment.now() };
                this.send_order({
                    label: label,
                    target: target,
                    exchange: exchange,
                    symbol: symbol,
                    contract_type: contract_type,
                    quantity: quantity,
                    direction: direction,
                    order_type: ORDER_TYPE.MARKET,
                    account_id: act_id,
                    client_order_id: sp_client_order_id
                });

                // 撤销对应的反手单（通过on_order_update撤销）
                // let reverse_label = `${label.slice(0, 6)}|REVERSE`;
                // this.cancel_order({
                //     exchange: exchange,
                //     symbol: symbol,
                //     contract_type: contract_type,
                //     client_order_id: that.order_map[cfgID][reverse_label]["client_order_id"],
                //     account_id: act_id
                // });
            } else if (error_code_msg === "Futures Trading Quantitative Rules violated, only reduceOnly order is allowed, please try again later.") {
                this.query_quantitative_rules({
                    exchange: EXCHANGE.BINANCEU,
                    contract_type: CONTRACT_TYPE.PERP,
                    account_id: act_id
                });
            }  else if (error_code_msg === "Server is currently overloaded with other requests. Please try again in a few minutes.") {
                resend = true, timeout = 1000 * 10;
            } else if (error_code_msg === "Quantity greater than max quantity.") {
                if (label === "DN") delete that.order_map[cfgID]["DN"];
            } else {
                logger.warn(`${cfgID}::on_response|${order_idf}::unknown error occured during ${action}: ${error_code}: ${error_code_msg}`);
                return;
            }

            if (resend) {
                logger.info(`${cfgID}::${order_idf}::resend the order in ${timeout} ms!`);
                setTimeout(() => {
                    retry = (retry === undefined) ? 1 : retry + 1;
                    let new_client_order_id = cfgID + LABELMAP[label] + randomID(5);

                    // 注意：order_map里面的key有六种，对应的label也是六种，这和REV是不一样的；
                    that.order_map[cfgID][new_client_order_id] = { label: label, target: target, quantity: quantity, time: moment.now(), filled: 0 };
                    that.order_map[cfgID][label] = { client_order_id: new_client_order_id, label: label, price: price, quantity: quantity, time: moment.now() };

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
                        order_type: order_type,
                        account_id: act_id,
                        client_order_id: new_client_order_id
                    });
                }, timeout);
            }

        } else {
            // 订单发送成功
            logger.info(`${cfgID}::on_response|${order_idf} submitted!`);
        }
    }

    on_cancel_order_response(response) {
        let that = this;

        let action = response["action"];
        let order_type = response["metadata"]["order_type"];

        // 用request里面的数据比较保险
        let exchange = response["request"]["exchange"];
        let symbol = response["request"]["symbol"];
        let contract_type = response["request"]["contract_type"];
        let act_id = response["request"]["account_id"];
        let client_order_id = response["request"]["client_order_id"];
        let direction = response["request"]["direction"];

        let cfgID = client_order_id.slice(0, 7);
        let entry = that.cfg[cfgID]["entry"];
        let interval = entry.split(".")[3];
        let order_idf = [act_id, symbol, interval, direction, client_order_id].join("|");

        let label = client_order_id.slice(7, 9);
        if (!Object.values(LABELMAP).includes(label)) {
            logger.info(`${cfgID}::on_cancel_order_response|unknown order label ${label}!`);
            return;
        } else {
            label = stratutils.get_key_by_value(LABELMAP, label);
        }

        if (response["metadata"]["metadata"]["result"] === false) {
            //撤单失败
            let error_code = response["metadata"]["metadata"]["error_code"];
            let error_code_msg = response["metadata"]["metadata"]["error_code_msg"];
            let retry = response["request"]["retry"];

            if (retry === 5) {
                that.slack_publish({
                    "type": "alert",
                    "msg": `${cfgID}::${order_idf}::Cancel order retried over 5 times, check the code!`
                });
                return;
            }

            logger.debug(`${cfgID}::on_response|${order_idf}::an error occured during ${action}: ${error_code}: ${error_code_msg}`);
            //所有的撤单失败也会发邮件报警
            that.slack_publish({
                "type": "alert",
                "msg": `${cfgID}::on_response|${order_idf}::an error occured during ${action}: ${error_code}: ${error_code_msg}`
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
                logger.warn(`${cfgID}::on_response|${order_idf}::unknown error occured during ${action}: ${error_code}: ${error_code_msg}`);
                return;
            }

            if (recancel) {
                logger.info(`${cfgID}::${order_idf}::recancel the order in ${timeout} ms!`);
                setTimeout(() => {
                    retry = (retry === undefined) ? 1 : retry + 1;
                    that.cancel_order({
                        retry: retry,
                        exchange: exchange,
                        symbol: symbol,
                        contract_type: contract_type,
                        order_type: order_type,
                        client_order_id: client_order_id,
                        account_id: act_id,
                    });
                }, timeout);
            }
        } else {
            logger.info(`${cfgID}::on_response|${order_idf} cancelled!`);
        }
    }

    on_active_orders(response) {
        let that = this;

        let act_id = response["metadata"]["metadata"]["account_id"];
        if (!that.cfg["act_ids"].includes(act_id)) return;

        let orders = response["metadata"]["metadata"]["orders"];
        let active_orders = orders.filter(item => item.client_order_id.slice(0, 3) === that.alias);

        let sendData = {
            "tableName": this.alias,
            "tabName": "PortfolioMonitor",
            "data": []
        }

        let alert_string = "";
        for (let cfgID of that.cfg["cfgIDs"]) {
            if (act_id !== that.cfg[cfgID]["act_id"]) continue;

            let entry = that.cfg[cfgID]["entry"];
            let corr_active_orders = active_orders.filter(item => item.client_order_id.slice(0, 7) == cfgID);
            let corr_active_client_order_ids = corr_active_orders.map(item => item.client_order_id);
            let string = corr_active_client_order_ids.join(",");

            let index = that.cfg["cfgIDs"].indexOf(cfgID);

            let item = {};
            item[`${index + 1}|orders`] = string;
            sendData["data"].push(item);

            // TODO: 从order_map删除item
            for (let [key, value] of Object.entries(that.order_map[cfgID])) {
                
                if (key.startsWith(that.alias)) {
                    // 以
                    if (corr_active_client_order_ids.includes(key)) continue;
                } else {
                    if (corr_active_client_order_ids.includes(value.client_order_id)) continue;
                }

                if (that.order_map[cfgID][key]["ToBeDeleted"]) {
                    // 超过10秒才删除，避免order_update推送延迟，导致order_update的处理过程中order_map中信息缺失
                    if (moment.now() - value["ToBeDeletedTime"] > 1000 * 10) {
                        alert_string += `${cfgID}|${entry}: ${key}: ${JSON.stringify(that.order_map[cfgID][key])}\n`;
                        // 如果delete了，在deal_with_TBA里面又会报错？
                        // delete that.order_map[cfgID][key];
                    }
                } else {
                    that.order_map[cfgID][key]["ToBeDeleted"] = true;
                    that.order_map[cfgID][key]["ToBeDeletedTime"] = moment.now();
                }
            }
        }

        this.intercom.emit("UI_update", sendData, INTERCOM_SCOPE.UI);

        if (alert_string !== "") {
            logger.info(`${that.alias}:: order not active, but still in the order map as follows, \n${alert_string}`);
            that.slack_publish({
                "type": "alert",
                "msg": `${that.alias}:: order not active, but still in the order mapas follows, \n${alert_string}`
            });
        }
    }
}

module.exports = SimpleRevTrendStrategy;

let strategy;

process.argv.forEach((val) => {
    if (val === "on") {
        let args = require("yargs")
            .option("alias", {
                alias: "a",
                describe: "-a <env> specify the stragey alias",
                default: "SRE",
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

        strategy = new SimpleRevTrendStrategy("SimpleRevTrend", alias, new Intercom(intercom_config));
        strategy.start();
    }
});

process.on('SIGINT', async () => {
    logger.info(`${strategy.alias}::SIGINT`);
    /* Note: Just work under pm2 environment */
    // strategy._test_cancel_order(strategy.test_order_id);
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