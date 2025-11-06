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

class QuickTrendStrategy extends StrategyBase {
    constructor(name, alias, intercom) {
        super(name, alias, intercom);

        this.cfg = require(`../config/cfg_${alias}.json`);

        this.init_status_map();
        this.init_order_map();  // this will set order_map to be empty

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
            "tableName": that.alias,
            "tabName": "PortfolioMonitor",
            "data": []
        }

        that.cfg["cfgIDs"].forEach((cfgID, index) => {
            if (!(cfgID in that.status_map)) return;

            let idf = that.cfg[cfgID]["idf"];
            let entry = that.cfg[cfgID]["entry"];
            let item = {};

            let gap = (that.prices[idf])? Math.round((moment.now() - utils._util_convert_timestamp_to_date(that.prices[idf]["upd_ts"])) / 1000) : "";

            item[`${index + 1}|cfgID`] = cfgID;
            item[`${index + 1}|entry`] = entry;
            item[`${index + 1}|status`] = that.status_map[cfgID]["status"];
            item[`${index + 1}|triggered`] = that.status_map[cfgID]["triggered"];
            item[`${index + 1}|pos`] = that.status_map[cfgID]["pos"];
            item[`${index + 1}|fee`] = that.status_map[cfgID]["fee"];
            item[`${index + 1}|np`] = that.status_map[cfgID]["net_profit"];
            item[`${index + 1}|price`] = (that.prices[idf])? `${that.prices[idf]["price"]}|${gap}`: "";
            sendData["data"].push(item);
        });

        this.intercom.emit("UI_update", sendData, INTERCOM_SCOPE.UI);
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
                    "triggered": "",
                    "up": "",
                    "uc": "",
                    "dn": "",
                    "dc": "",
                    "enter": "",
                    "bar_n": "",
                    "bar_enter_n": 0,
                    "fee": 0,
                    "quote_ccy": 0,
                    "net_profit": 0
                }
            }
        });
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
                logger.info(`Something is wrong with klines loading, reloading ${cfgID} klines ...`);
                that.load_entry_klines(cfgID);
            } else {
                that.klines[cfgID]["ready"] = true;
            }
        }, 5000);
    }

    on_order_update(order_update) {
        /**
         * client_order_id: QTR0001UPXXXXX, {0-2: alias}{3-6: idx}{7-8: short_label}{9-13: random}
         * short_label: 订单简易标签，对于本策略（QuickTrend）有UP, UC, DN, DC, LS, SS六种
         */
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

        // 不是本策略的订单更新，自动过滤
        if (client_order_id.slice(0, 3) !== that.alias) return;
        logger.info(`${that.alias}::on_order_update|${JSON.stringify(order_update)}`);

        let cfgID = client_order_id.slice(0, 7);
        let idf = [exchange, symbol, contract_type].join(".");
        let entry = that.cfg[cfgID]["entry"];
        let interval = entry.split(".")[4];

        // 确定label以及order_idf
        let label = client_order_id.slice(7, 9);
        if (!Object.values(LABELMAP).includes(label)) {
            logger.info(`${that.alias}::on_order_update|unknown order label ${label}!`);
            return;
        } else {
            label = stratutils.get_key_by_value(LABELMAP, label);   
        }
        let order_idf = [act_id, symbol, interval, direction, client_order_id].join("|");

        if (order_status === ORDER_STATUS.SUBMITTED) {

            let submit_price = order_update["order_info"]["submit_price"];
            let original_amount = order_update["order_info"]["original_amount"];
            logger.info(`${that.alias}::on_order_update|${order_idf} ${order_type} order ${original_amount} placed @${submit_price} after ${update_type}!`);

        } else if (order_status === ORDER_STATUS.CANCELLED) {

            logger.info(`${that.alias}::on_order_update|${order_idf} ${order_type} order cancelled after ${update_type}!`);
            if (update_type === "cancelled") {
                // 订单已经撤销，100毫秒后从order_map中删除该订单（1分钟之后的原因是防止on_response还要用）
                logger.info(`${that.alias}::on_order_update|${order_idf} ${order_type} order cancelled, will be removed from order_map in 200ms!`);
                setTimeout(() => delete that.order_map[cfgID][client_order_id], 100);
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

            logger.info(`${that.alias}::on_order_update|${order_idf} ${order_type} order ${filled}/${original_amount} filled @${avg_executed_price}/${submit_price}!`);

            // 对于UP ORDER无论是完全成交还是部分成交，都撤销DN ORDER；DN ORDER同理
            // "DN"如果还在order_map里面，说明还没被撤销；如果不在了，说明已经撤销了，不需要再进行撤销
            // 同理："UP"如果还在order_map里面，说明还没被撤销；如果不在了，说明已经撤销了，不需要再进行撤销
            if (label === "UP") {

                if ("DN" in that.order_map[cfgID]) {
                // The UP ORDER got filled, cancel the DN order
                    that.cancel_order({
                        exchange: exchange,
                        symbol: symbol,
                        contract_type: contract_type,
                        client_order_id: that.order_map[cfgID]["DN"]["client_order_id"],
                        account_id: act_id,
                    });
                    // 这里删除以label为key的item，在撤单成功的on_order_update里面删除以client_order_id为key的item
                    delete that.order_map[cfgID]["DN"];
                }

                if ("DC" in that.order_map[cfgID]) {
                    // The UP ORDER got filled, cancel the DC order
                    that.cancel_order({
                        exchange: exchange,
                        symbol: symbol,
                        contract_type: contract_type,
                        client_order_id: that.order_map[cfgID]["DC"]["client_order_id"],
                        account_id: act_id,
                    });
                    // 这里删除以label为key的item，在on_order_update里面删除以client_order_id为key的item
                    delete that.order_map[cfgID]["DC"];
                }

            } else if (label === "DN") {

                if ("UP" in that.order_map[cfgID]) {
                    // The DN ORDER got filled, cancel the UP order
                    that.cancel_order({
                        exchange: exchange,
                        symbol: symbol,
                        contract_type: contract_type,
                        client_order_id: that.order_map[cfgID]["UP"]["client_order_id"],
                        account_id: act_id,
                    });
                    // 这里删除label，在on_order_update里面删除client_order_id
                    delete that.order_map[cfgID]["UP"];
                }

                if ("UC" in that.order_map[cfgID]) {
                    // The DN ORDER got filled, cancel the UC order
                    that.cancel_order({
                        exchange: exchange,
                        symbol: symbol,
                        contract_type: contract_type,
                        client_order_id: that.order_map[cfgID]["UC"]["client_order_id"],
                        account_id: act_id,
                    });
                    // 这里删除label，在on_order_update里面删除client_order_id
                    delete that.order_map[cfgID]["UC"];
                }

            } else if (label === "ANTI_L|STOPLOSS") {
                // 多仓下触发止损，撤掉对应的UC单

                if ("UC" in that.order_map[cfgID]) {
                    // The DN ORDER got filled, cancel the UC order
                    that.cancel_order({
                        exchange: exchange,
                        symbol: symbol,
                        contract_type: contract_type,
                        client_order_id: that.order_map[cfgID]["UC"]["client_order_id"],
                        account_id: act_id,
                    });
                    // 这里删除label，在on_order_update里面删除client_order_id
                    delete that.order_map[cfgID]["UC"];
                }

            } else if (label === "ANTI_S|STOPLOSS") {
                // 空仓下触发止损，撤销对应的DC单

                if ("DC" in that.order_map[cfgID]) {
                    // The UP ORDER got filled, cancel the DC order
                    that.cancel_order({
                        exchange: exchange,
                        symbol: symbol,
                        contract_type: contract_type,
                        client_order_id: that.order_map[cfgID]["DC"]["client_order_id"],
                        account_id: act_id,
                    });
                    // 这里删除以label为key的item，在on_order_update里面删除以client_order_id为key的item
                    delete that.order_map[cfgID]["DC"];
                }

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

            // 检查一下status_map和order_map变化
            logger.info(`${cfgID}|${entry}::${JSON.stringify(that.status_map[cfgID])}`);
            logger.info(`${cfgID}|${entry}::${JSON.stringify(that.order_map[cfgID])}`);

            if (order_status === ORDER_STATUS.FILLED) {
                // 订单完全成交，更新status_map
                that.status_map[cfgID]["status"] = that.order_map[cfgID][client_order_id]["target"];

                // 订单完全成交，不再是触发状态
                // 如果赋值为undefined，在UI那边会缓存为之前的那个值，影响判断，所以这里赋值为""
                that.status_map[cfgID]["triggered"] = "";
                if (that.status_map[cfgID]["status"] === "EMPTY") {
                    // 订单完全成交，仓位变为空，这说明是平仓单
                    // 平仓之后不要继续开仓

                    // 订单成交后status是EMPTY，bar_enter_n设置为1，防止继续发单开仓
                    that.status_map[cfgID]["bar_enter_n"] = 1;

                    for (let item of ["bar_n", "enter", "stop_price", "stoploss_rate"]) {
                        that.status_map[cfgID][item] = "";
                    }
                } else {
                    let stoploss_rate = that.cfg[cfgID]["stoploss_rate"];
                    let stop_rate = that.cfg[cfgID]["stop_rate"];
                    // 开仓之后，bar_enter_n设置为1，本策略（QuickTrend）在每个interval内只允许开仓一次
                    that.status_map[cfgID]["bar_n"] = 0;
                    that.status_map[cfgID]["bar_enter_n"] += 1;
                    that.status_map[cfgID]["enter"] = avg_executed_price;
                    that.status_map[cfgID]["stoploss_price"] = (that.status_map[cfgID]["status"] === "LONG") ? that.status_map[cfgID]["up"] * (1 - stoploss_rate) : that.status_map[cfgID]["dn"] * (1 + stoploss_rate);
                    that.status_map[cfgID]["stop_price"] = (that.status_map[cfgID]["status"] === "LONG") ? that.status_map[cfgID]["up"] * (1 + stop_rate) : that.status_map[cfgID]["dn"] * (1 - stop_rate);
                }

                // 订单完全成交，在order_map中删去该订单（注意：完全成交才删除，且当场删除！）
                delete that.order_map[cfgID][label];

                // 订单完全成交，remove the client_order_id from order_map 100ms later, as the on_response may need to use it!
                setTimeout(() => delete that.order_map[cfgID][client_order_id], 100);

                // 检查一下status_map和order_map变化
                logger.info(`${cfgID}|${entry}::${JSON.stringify(that.status_map[cfgID])}`);
                logger.info(`${cfgID}|${entry}::${JSON.stringify(that.order_map[cfgID])}`);

            } else {
                // 订单部分成交，处于触发状态
                // that.status_map[cfgID]["status"] = "TBA";
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

        // logger.info(`${this.alias}::${JSON.stringify(trade)}`);

        let corr_cfgIDs = that.cfg["cfgIDs"].filter((cfgID) => that.cfg[cfgID]["idf"].split(".").slice(0, 3).join(".") === idf);
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
                logger.info(`${that.alias}::${cfgID}::NEW START!`);
            } else if (new_bar) {
                logger.info(`${that.alias}::${cfgID}::NEW BAR!`);
                // 如果一些订单已经触发但是迟迟不能成交，必须进行处理
                // TODO: 如果在new_bar的一瞬间正在部分成交（虽然是小概率事件），怎么办？
                that.status_map[cfgID]["bar_enter_n"] = 0;

                // 没有deal_with_TBA函数
                // if (that.status_map[cfgID]["status"] === "TBA") that.deal_with_TBA(entry);
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
                logger.debug(`${cfgID}::cur_bar_otime is smaller than klines ts[0]?`);
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

    main_execuation(new_start, new_bar, cfgID) {
        let that = this;
        let entry = that.cfg[cfgID]["entry"];
        let [exchange, symbol, contract_type, interval] = entry.split(".");
        let idf = [exchange, symbol, contract_type].join(".");

        let price = that.prices[idf]["price"];
        let ini_usdt = (that.cfg[cfgID]["ini_usdt"]) ? that.cfg[cfgID]["ini_usdt"] : that.cfg["ini_usdt"];
        let act_id = that.cfg[cfgID]["act_id"];

        // load status_map  -----------------------------------------------
        let bar_enter_n = that.status_map[cfgID]["bar_enter_n"];

        // para loading -----------------------------------------------
        let track_ATR_multiplier = that.cfg[cfgID]["track_ATR_multiplier"];
        let bar_enter_limit = that.cfg[cfgID]["bar_enter_limit"];
        let af = that.cfg[cfgID]["af"];
        let stop_rate = that.cfg[cfgID]["stop_rate"];

        // cal indicators -----------------------------------------------
        let track_ATR = Math.max(...Object.values(that.klines[cfgID]["high"]).slice(1)) - Math.min(...Object.values(that.klines[cfgID]["low"]).slice(1));
        let up = that.klines[cfgID]["open"][0] + track_ATR * track_ATR_multiplier;
        let dn = that.klines[cfgID]["open"][0] - track_ATR * track_ATR_multiplier;
        let up_price = stratutils.transform_with_tick_size(up, PRICE_TICK_SIZE[idf]);
        let dn_price = stratutils.transform_with_tick_size(dn, PRICE_TICK_SIZE[idf], "round");  // 如果dn_price是负数，会被round成最小价
        let uc_price = stratutils.transform_with_tick_size(up * (1 + stop_rate), PRICE_TICK_SIZE[idf]);
        let dc_price = stratutils.transform_with_tick_size(dn * (1 - stop_rate), PRICE_TICK_SIZE[idf], "round");  // 如果dc_price是负数，会被round成最小价，这里有一个问题，如果dn和dc同一个价格怎么办？
        that.status_map[cfgID]["up"] = up_price;
        that.status_map[cfgID]["dn"] = dn_price;
        that.status_map[cfgID]["uc"] = uc_price;
        that.status_map[cfgID]["dc"] = dc_price;

        if (isNaN(up_price) || (isNaN(dn_price))) return;

        // 只在new_bar或者new_start的时候才对发单进行调整??? 要注释掉，QTR策略并不是只在new_bar或者new_start的时候对发单进行调整！
        // if (!new_bar && !new_start) return; 

        let orders_to_be_cancelled = [];    // client_order_id only
        let orders_to_be_submitted = [];    // {label: "", target: "", tgt_qty: "", price: "", direction: ""}

        if (that.status_map[cfgID]["status"] === "EMPTY") {

            if ((new_start || new_bar) && (bar_enter_n < bar_enter_limit)) {
                // 计算开仓量
                let up_qty = stratutils.transform_with_tick_size(ini_usdt / up_price, QUANTITY_TICK_SIZE[idf]);
                let dn_qty = stratutils.transform_with_tick_size(ini_usdt / dn_price, QUANTITY_TICK_SIZE[idf]);

                // 如果已经有UP单，撤销之；如果已经有DN单，撤销之
                if (that.order_map[cfgID]["UP"] !== undefined) orders_to_be_cancelled.push(that.order_map[cfgID]["UP"]["client_order_id"]);
                if (that.order_map[cfgID]["DN"] !== undefined) orders_to_be_cancelled.push(that.order_map[cfgID]["DN"]["client_order_id"]);
                if (that.order_map[cfgID]["UC"] !== undefined) orders_to_be_cancelled.push(that.order_map[cfgID]["UC"]["client_order_id"]);
                if (that.order_map[cfgID]["DC"] !== undefined) orders_to_be_cancelled.push(that.order_map[cfgID]["DC"]["client_order_id"]);
                
                // 发单：UP, DN都是stop market order; UC, DC都是limit order
                if (price < up_price) {
                    // 价格低于上轨价，才发上轨单（UP和UC），如果当前价格已经高于上轨价，则不发上轨单
                    orders_to_be_submitted.push({ label: "UP", target: "LONG", quantity: up_qty, stop_price: up_price, direction: DIRECTION.BUY, order_type: ORDER_TYPE.STOP_MARKET });
                    orders_to_be_submitted.push({ label: "UC", target: "EMPTY", quantity: up_qty, price: uc_price, direction: DIRECTION.SELL, order_type: ORDER_TYPE.LIMIT });
                }

                if (price > dn_price) {
                    // 价格高于下轨价，才发下轨单（DN和DC），如果当前价格已经低于下轨价，则不发下轨单
                    orders_to_be_submitted.push({ label: "DN", target: "SHORT", quantity: dn_qty, stop_price: dn_price, direction: DIRECTION.SELL, order_type: ORDER_TYPE.STOP_MARKET });
                    orders_to_be_submitted.push({ label: "DC", target: "EMPTY", quantity: dn_qty, price: dc_price, direction: DIRECTION.BUY, order_type: ORDER_TYPE.LIMIT });
                }
            }

        } else if (that.status_map[cfgID]["status"] === "LONG") {
            
            if (new_bar) {
                // 更新止盈价
                that.status_map[cfgID]["stop_price"] = that.status_map[cfgID]["stop_price"] * (1 - af);
                // TODO: 如果仓位已经小于最小发单单元，那么直接把status设置为EMPTY，需要更新一下全部symbol的最下发单单位
            }
            let stop_price = stratutils.transform_with_tick_size(that.status_map[cfgID]["stop_price"], PRICE_TICK_SIZE[idf]);
            let stoploss_price = stratutils.transform_with_tick_size(that.status_map[cfgID]["stoploss_price"], PRICE_TICK_SIZE[idf]);

            ////// 发两个单，一个止损单（market order），一个止盈单（limit）
            if (price <= that.status_map[cfgID]["stoploss_price"]) {
                // 第一个单：止损单（market），当止损单触发时，直接平仓，不再需要止盈单
                that.status_map[cfgID]["status"] = "TBA";
                let sp_tgt_qty = stratutils.transform_with_tick_size(that.status_map[cfgID]["pos"], QUANTITY_TICK_SIZE[idf]);
                orders_to_be_submitted.push({ label: "ANTI_L|STOPLOSS", target: "EMPTY", quantity: sp_tgt_qty, price: stoploss_price, direction: DIRECTION.SELL, order_type: ORDER_TYPE.MARKET });
            } else {
                // 止盈单只在new_start或者new_bar的时候修改
                if (!new_bar && !new_start) return; 

                // 第二个单：止盈单（limit）
                let uc_tgt_qty = stratutils.transform_with_tick_size(that.status_map[cfgID]["pos"], QUANTITY_TICK_SIZE[idf]);
                if (that.order_map[cfgID]["UC"] === undefined) {
                    orders_to_be_submitted.push({ label: "UC", target: "EMPTY", quantity: uc_tgt_qty, price: stop_price, direction: DIRECTION.SELL, order_type: ORDER_TYPE.LIMIT });
                } else {
                    let current_uc_client_order_id = that.order_map[cfgID]["UC"]["client_order_id"];
                    let current_uc_price = that.order_map[cfgID]["UC"]["price"];
                    let current_uc_qty = that.order_map[cfgID]["UC"]["quantity"];

                    if ((current_uc_price !== stop_price) || (current_uc_qty !== uc_tgt_qty)) {
                        // 若已存的止盈单和现行不一致，则撤销重新发
                        orders_to_be_cancelled.push(current_uc_client_order_id);
                        orders_to_be_submitted.push({ label: "UC", target: "EMPTY", quantity: uc_tgt_qty, price: stop_price, direction: DIRECTION.SELL, order_type: ORDER_TYPE.LIMIT });
                    }
                }
            }

        } else if (that.status_map[cfgID]["status"] === "SHORT") {

            // 更新止盈价
            if (new_bar) {
                that.status_map[cfgID]["stop_price"] = that.status_map[cfgID]["stop_price"] * (1 + af);
            }
            let stop_price = stratutils.transform_with_tick_size(that.status_map[cfgID]["stop_price"], PRICE_TICK_SIZE[idf]);
            let stoploss_price = stratutils.transform_with_tick_size(that.status_map[cfgID]["stoploss_price"], PRICE_TICK_SIZE[idf]);
           
            ////// 发两个单，一个止损单（market order），一个止盈单（limit）
            if (price >= that.status_map[cfgID]["stoploss_price"]) {
                // 第一个单：止损单（market），当止损单触发时，直接平仓，不再需要止盈单
                that.status_map[cfgID]["status"] = "TBA";
                let sp_tgt_qty = stratutils.transform_with_tick_size(- that.status_map[cfgID]["pos"], QUANTITY_TICK_SIZE[idf]);
                orders_to_be_submitted.push({ label: "ANTI_S|STOPLOSS", target: "EMPTY", quantity: sp_tgt_qty, price: stoploss_price, direction: DIRECTION.BUY, order_type: ORDER_TYPE.MARKET });
            } else {
                // 止盈单只在new_start或者new_bar的时候修改
                if (!new_bar && !new_start) return; 

                // 第二个单：止盈单（limit）
                let dc_tgt_qty = stratutils.transform_with_tick_size(- that.status_map[cfgID]["pos"], QUANTITY_TICK_SIZE[idf]);
                if (that.order_map[cfgID]["DC"] === undefined) {
                    // 对手单还没有发送
                    orders_to_be_submitted.push({ label: "DC", target: "EMPTY", quantity: dc_tgt_qty, price: stop_price, direction: DIRECTION.BUY, order_type: ORDER_TYPE.LIMIT });
                } else {
                    // 对手单已发，检查是否需要更改
                    let current_dc_client_order_id = that.order_map[cfgID]["DC"]["client_order_id"];
                    let current_dc_price = that.order_map[cfgID]["DC"]["price"];
                    let current_dc_qty = that.order_map[cfgID]["DC"]["quantity"];

                    // 若已存的反手单和现行不一致，则撤销重新发
                    if ((current_dc_price !== dc_price) || (current_dc_qty !== dc_tgt_qty)) {
                        orders_to_be_cancelled.push(current_dc_client_order_id);
                        orders_to_be_submitted.push({ label: "DC", target: "EMPTY", quantity: dc_tgt_qty, price: stop_price, direction: DIRECTION.BUY, order_type: ORDER_TYPE.LIMIT });
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
            let label = order.label, target = order.target, quantity = order.quantity, price = order.price;
            let stop_price = order.stop_price, direction = order.direction, order_type = order.order_type;
            let client_order_id = cfgID + LABELMAP[label] + randomID(5);  // client_order_id总共13位

            // 发送订单，同时建立order_map
            // 初始5个key: label, target, quantity, time, filled
            // e.g. {"3106609167": {"label": "DN", "target": "LONG", "quantity": 21133, "time": 1669492800445, "filled": 0}}
            that.order_map[cfgID][client_order_id] = { label: label, target: target, quantity: quantity, time: moment.now(), filled: 0 };
            // 初始5个key: client_order_id, label, price/stop_price, quantity, time，如果是stop_market order就没有price
            // e.g. {"ANTI_S|REVERSE": { "client_order_id": "3103898618",  "label": "ANTI_S|STOPLOSS", "price": 0.3214, "quantity": 100, "time": 1669492800445}}
            that.order_map[cfgID][label] = { client_order_id: client_order_id, label: label, price: price, stop_price: stop_price, quantity: quantity, time: moment.now() };

            that.send_order({
                label: label,
                target: target,
                exchange: exchange,
                symbol: symbol,
                contract_type: contract_type,
                price: price,               // 若为stop_market order，则为undefined
                stop_price: stop_price,     // 若为limit或者market order，则为undefined
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
        let stop_price = response["request"]["stop_price"];
        let order_type = response["request"]["order_type"];

        let cfgID = client_order_id.slice(0, 7);
        let idf = that.cfg[cfgID]["idf"];
        let entry = that.cfg[cfgID]["entry"];
        let interval = entry.split(".")[3];
        let order_idf = [act_id, symbol, interval, direction, client_order_id].join("|");

        let label = client_order_id.slice(7, 9);
        if (!Object.values(LABELMAP).includes(label)) {
            logger.info(`${that.alias}::on_send_order_response|unknown order label ${label}!`);
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
                // 限价单价格发单限制，调整价格后重发
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
                let key = token[act_id]["apiKey"];
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
                    // TODO: 这里应该是order_map吧，怎么其他几个脚本都写status_map???
                    that.order_map[cfgID]["DN"] = undefined;
                } else {
                    logger.info(`${that.alias}::${order_idf}::price less than min, but not a DN order, check!`);
                }
            } else if (error_code_msg === "Order would immediately trigger.") {
                // STOP order才会报这样的错，说明止损价已经触发，直接改发market order
                let sp_client_order_id = cfgID + LABELMAP[label] + randomID(5);  // client_order_id总共13位
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
            } else if (error_code_msg === "Futures Trading Quantitative Rules violated, only reduceOnly order is allowed, please try again later.") {
                this.query_quantitative_rules({
                    exchange: EXCHANGE.BINANCEU,
                    contract_type: CONTRACT_TYPE.PERP,
                    account_id: act_id
                });
            } else if (error_code_msg === "Quantity greater than max quantity.") {
                if (label === "DN") delete that.order_map[cfgID]["DN"];
            } else {
                logger.warn(`${that.alias}::on_response|${order_idf}::unknown error occured during ${action}: ${error_code}: ${error_code_msg}`);
                return;
            }

            if (resend) {
                logger.info(`${that.alias}::${order_idf}::resend the order in ${timeout} ms!`);
                setTimeout(() => {
                    retry = (retry === undefined) ? 1 : retry + 1;
                    let new_client_order_id = cfgID + LABELMAP[label] + randomID(5);  // client_order_id总共13位

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
                        stop_price: stop_price,
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

        let cfgID = client_order_id.slice(0, 7);
        let idf = that.cfg[cfgID]["idf"];
        let entry = that.cfg[cfgID]["entry"];
        let interval = entry.split(".")[3];
        let order_idf = [act_id, symbol, interval, direction, client_order_id].join("|");

        let label = client_order_id.slice(7, 9);
        if (!Object.values(LABELMAP).includes(label)) {
            logger.info(`${that.alias}::on_cancel_order_response|unknown order label ${label}!`);
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

    on_active_orders(response) {
        // TODO: 需要检查
        // BAM会统一查询所有交易账户的active orders并推送给各个策略端，然后再由策略段负责检查
        // 检查逻辑：
        // 1. 筛选出client_order_id属于本策略的订单, client_order_id不属于任何策略的订单会在BAM处alert；
        // 2. client_order_id属于本策略，但是压根没有对应的idf；
        // 3. client_order_id属于本策略，也有对应的idf，但是act_id不对；
        let that = this;
        
        if (response["metadata"]["metadata"]["result"] === false) {
            let error_code = response["metadata"]["metadata"]["error_code"];
            let error_code_msg = response["metadata"]["metadata"]["error_code_msg"];
            logger.debug(`${that.alias}:: an error occured during query orders: ${error_code}: ${error_code_msg}`);
            return
        }

        let exchange = response["request"]["exchange"];
        let act_id = response["metadata"]["metadata"]["account_id"];
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
            let symbol = entry.split(".")[1];
            let interval = entry.split(".")[3];
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
                        alert_string += `${cfgID}: ${key}: ${JSON.stringify(that.order_map[cfgID][key])}\n`;
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
            logger.info(`${that.alias}|${act_id}::order not active, but still in the order map as follows, \n${alert_string}`);
            alert_string = `${that.alias}|${act_id}::order not active, but still in the order map as follows, \n${alert_string}\n`;
        }

        let wierd_orders_1 = active_orders.filter(e => !that.cfg["cfgIDs"].includes(e.client_order_id.slice(0, 7)));
        let wierd_orders_2 = active_orders.filter(e => that.cfg["cfgIDs"].includes(e.client_order_id.slice(0, 7)) && (that.cfg[e.client_order_id.slice(0, 7)]["act_id"] !== act_id));

        if (wierd_orders_1.length > 0) alert_string += `${that.alias}|${act_id}::cfgID not live:: ${JSON.stringify(wierd_orders_1)}\n`;
        if (wierd_orders_2.length > 0) alert_string += `${that.alias}|${act_id}::act_id inconsistent:: ${JSON.stringify(wierd_orders_2)}\n`; 
        if (alert_string !== "") {
            that.slack_publish({
                "type": "alert",
                "msg": alert_string
            });
        }
    }
}

module.exports = QuickTrendStrategy;

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

        strategy = new QuickTrendStrategy("QuickTrend", alias, new Intercom(intercom_config));
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