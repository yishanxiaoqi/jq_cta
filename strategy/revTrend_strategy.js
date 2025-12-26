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

class RevTrendStrategy extends StrategyBase {
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
        }, 1000 * 5);

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
            if (!(cfgID in that.status_map)) return;
            let item = {};
            let idf = that.cfg[cfgID]["idf"];
            let entry = that.cfg[cfgID]["entry"];
    
            // 计算time_gap和盈利情况
            let price_presentation = "";
            if (that.prices[idf]) {
                let gap = Math.round((moment.now() - utils._util_convert_timestamp_to_date(that.prices[idf]["upd_ts"])) / 1000);
                price_presentation = `${that.prices[idf]["price"]}|${gap}`;
                if (that.status_map[cfgID]["status"] === "LONG") {
                    let percentage = that.status_map[cfgID]["short_enter"] ? ((that.prices[idf]["price"] - that.status_map[cfgID]["short_enter"]) / that.status_map[cfgID]["short_enter"] * 100).toFixed(0) + "%" : "miss";
                    price_presentation += "|" + percentage;
                } else if (that.status_map[cfgID]["status"] === "SHORT") {
                    let percentage = that.status_map[cfgID]["long_enter"] ? ((that.status_map[cfgID]["long_enter"] - that.prices[idf]["price"]) / that.status_map[cfgID]["long_enter"] * 100).toFixed(0) + "%" : "miss";
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
            item[`${index + 1}|sp`] = that.status_map[cfgID]["stoploss_price"];
            item[`${index + 1}|up`] = that.status_map[cfgID]["up"];
            item[`${index + 1}|dn`] = that.status_map[cfgID]["dn"];
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
    
    load_klines() {
        let that = this;
        that.cfg["cfgIDs"].forEach((cfgID) => {
            that.load_cfgID_klines(cfgID);
        });
    }

    load_cfgID_klines(cfgID) {
        let that = this;

        let entry = that.cfg[cfgID]["entry"];
        let [exchange, symbol, contract_type, interval] = entry.split(".");
        let num = (interval.endsWith("d")) ? parseInt(interval.split("d")[0]) * 24 : parseInt(interval.split("h")[0]);
        assert(["2d", "1d", "12h", "8h", "6h", "4h", "3h", "2h", "1h"].includes(interval));

        that.klines[cfgID] = { "ts": [], "open": [], "high": [], "low": [], "ready": false };
        let n_klines = (that.cfg[cfgID]["track_ATR_n"] + 1) * num;
        let url = "https://fapi.binance.com/fapi/v1/klines?symbol=" + symbol + "&contractType=PERPETUAL&interval=1h&limit=" + n_klines;
        logger.info(`Loading the klines from ${url}`);
        request.get({
            url: url, json: true
        }, function (error, res, body) {
            let high = Number.NEGATIVE_INFINITY, low = Number.POSITIVE_INFINITY;
            for (let i = body.length - 1; i >= 0; i--) {
                let ts = utils.get_human_readable_timestamp(body[i][0]);
                // 如果是2d-interval，那么从2000-01-01的零点开始算splitAt
                let hour = (interval == "2d") ? moment(ts, "YYYYMMDDHHmmssSSS").diff(moment("20000101000000000", "YYYYMMDDHHmmssSSS"), 'hours') : parseInt(ts.slice(8, 10));
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

        // 不是本策略的订单更新，自动过滤
        if (client_order_id.slice(0, 3) !== that.alias) return;
        let cfgID = client_order_id.slice(0, 7);
        logger.info(`${cfgID}::on_order_update|${JSON.stringify(order_update)}`);

        // 这个不能挪动位置，因为属于本策略的order_update才会进入这一步
        let idf = [exchange, symbol, contract_type].join(".");
        let entry = that.cfg[cfgID]["entry"];
        let interval = entry.split(".")[3];
        
        let label = client_order_id.slice(7, 9);
        if (!Object.values(LABELMAP).includes(label)) {
            logger.info(`${cfgID}::on_order_update|unknown order label ${label}!`);
            return;
        }
        label = stratutils.get_key_by_value(LABELMAP, label);
        let order_idf = [act_id, symbol, interval, direction, client_order_id].join("|");

        if (order_status === ORDER_STATUS.SUBMITTED) {

            let submit_price = order_update["order_info"]["submit_price"];
            let original_amount = order_update["order_info"]["original_amount"];
            logger.info(`${cfgID}::on_order_update|${order_idf} ${order_type} order ${original_amount} placed @${submit_price} after ${update_type}!`);

            // 对手单发送成功，60秒后允许修改对手单
            // 为了尽可能避免触发quantitative rules，这里设置为60秒，即最短60秒后才能修改对手单，避免频繁发单
            if (label.slice(0, 4) === "ANTI") {
                setTimeout(() => that.status_map[cfgID]["anti_order_sent"] = false, 1000 * 60);
            }

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
                    client_order_id: that.order_map[cfgID]["DN"]["client_order_id"],
                    account_id: act_id,
                });
                // 这里删除label，在on_order_update里面删除client_order_id
                delete that.order_map[cfgID]["DN"];
            } else if ((label === "DN") && ("UP" in that.order_map[cfgID])) {
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
            logger.info(`${cfgID}|${symbol}::${JSON.stringify(that.status_map[cfgID])}`);
            logger.info(`${cfgID}|${symbol}::${JSON.stringify(that.order_map[cfgID])}`);

            if (order_status === ORDER_STATUS.FILLED) {
                // 订单完全成交，更新status_map
                that.status_map[cfgID]["status"] = that.order_map[cfgID][client_order_id]["target"];

                // 订单完全成交，不再是触发状态
                // 如果赋值为undefined，在UI那边会缓存为之前的那个值，影响判断，所以这里赋值为""
                that.status_map[cfgID]["triggered"] = "";
                if (that.status_map[cfgID]["status"] === "EMPTY") {
                    // 订单完全成交，仓位变为空，这说明是平仓单
                    // 把that.pre_bar_otime[cfgID]变成undefined，这样就变成new_start，可以重新发开仓单
                    // 有可能会出现依然无法重新发开仓单的情况，这种大概率是因为bar_enter_n没有进行更新
                    that.pre_bar_otime[cfgID] = undefined;
                    for (let item of ["bar_n", "ep", "af", "sar", "long_enter", "high_since_long", "short_enter", "low_since_short", "stoploss_price"]) {
                        that.status_map[cfgID][item] = "";
                    }
                } else {
                    let cutloss_rate = that.cfg[cfgID]["cutloss_rate"];

                    that.status_map[cfgID]["bar_n"] = 0;
                    that.status_map[cfgID]["af"] = that.cfg[cfgID]["ini_af"];
                    that.status_map[cfgID]["bar_enter_n"] += 1;
                    that.status_map[cfgID]["ep"] = avg_executed_price;

                    if (that.status_map[cfgID]["status"] === "LONG") {
                        // 仓位变为LONG，但实际上是dn break，因此用low_sinc_short
                        that.status_map[cfgID]["long_enter"] = "";
                        that.status_map[cfgID]["high_since_long"] = "";
                        that.status_map[cfgID]["short_enter"] = avg_executed_price;
                        that.status_map[cfgID]["low_since_short"] = avg_executed_price;
                        that.status_map[cfgID]["sar"] = avg_executed_price * (1 + cutloss_rate);
                    } else {
                        // 仓位变为SHORT，但实际上是up break，因此用high_since_long
                        that.status_map[cfgID]["long_enter"] = avg_executed_price;
                        that.status_map[cfgID]["high_since_long"] = avg_executed_price;
                        that.status_map[cfgID]["short_enter"] = "";
                        that.status_map[cfgID]["low_since_short"] = "";
                        that.status_map[cfgID]["sar"] = avg_executed_price * (1 - cutloss_rate);
                    }

                    that.status_map[cfgID]["ep"] = stratutils.transform_with_tick_size(that.status_map[cfgID]["ep"], PRICE_TICK_SIZE[idf]);
                    that.status_map[cfgID]["sar"] = stratutils.transform_with_tick_size(that.status_map[cfgID]["sar"], PRICE_TICK_SIZE[idf]);
                }

                // 订单完全成交，在order_map中删去该订单（注意：完全成交才删除，且当场删除！）
                delete that.order_map[cfgID][label.slice(0, 6)];

                // remove the client_order_id from order_map 100ms later, as the on_response may need to use it!
                setTimeout(() => delete that.order_map[cfgID][client_order_id], 100);

            } else {
                // 订单部分成交，处于触发状态
                that.status_map[cfgID]["status"] = "TBA";
                that.status_map[cfgID]["triggered"] = label;
            }

            // record the order filling details
            let ts = order_update["metadata"]["timestamp"];
            let filled_info = [act_id, exchange, symbol, contract_type, client_order_id, order_type, original_amount, filled, submit_price, avg_executed_price, fee].join(",");
            // order_map中只提取label,target,quantity,time,filled等信息
            let order_info = (that.order_map[cfgID][client_order_id] === undefined) ? ",,,," : Object.entries(that.order_map[cfgID][client_order_id]).filter((element) => ["label", "target", "quantity", "time", "filled"].includes(element[0])).map((element) => element[1]).join(",");
            let output_string = [ts, filled_info, order_info].join(",");
            output_string += (order_status === ORDER_STATUS.FILLED) ? ",filled\n" : ",partially_filled\n";
            fs.writeFile(`./log/order_filling_${this.alias}.csv`, output_string, { flag: "a+" }, (err) => {
                if (err) logger.info(`${cfgID}::${err}`);
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
        if (idf === "BinanceU.BNBUSDT.perp") this.bnb_price = price;

        if (!that.cfg["idfs"].includes(idf)) return;
        that.prices[idf] = { "price": price, "upd_ts": ts };

        let corr_cfgIDs = that.cfg["cfgIDs"].filter((cfgID) => that.cfg[cfgID]["idf"] === idf);
        for (let cfgID of corr_cfgIDs) {
            if (!that.klines[cfgID]["ready"]) continue;

            let entry = that.cfg[cfgID]["entry"];
            let interval = entry.split(".")[3];

            // logger.info(symbol, ts, that.cur_bar_otime[cfgID], that.pre_bar_otime[cfgID]);
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

            // 更新kline数据，这里应该用>会不会更好？
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
                logger.debug(`${cfgID}::${entry}::cur_bar_otime is smaller than klines ts[0]?`);
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
        // order_type默认都是LIMIT
        let orders_to_be_cancelled = [];
        // {label: "", target: "", quantity: "", price: "", direction: "", order_type: ""}
        // order_type默认都是LIMIT
        let orders_to_be_submitted = [];

        if (triggered === "UP") {
            // 开仓单开了一半，剩下的撤单，直接转为对应的status
            logger.info(`${cfgID}::${act_id}|${entry} deal with TBA: cancel the remaining UP order!`);
            let up_client_order_id = that.order_map[cfgID]["UP"]["client_order_id"];
            orders_to_be_cancelled.push({ order_type: ORDER_TYPE.LIMIT, client_order_id: up_client_order_id });
            that.status_map[cfgID]["status"] = "SHORT";

            delete that.order_map[cfgID]["UP"];
        } else if (triggered === "DN") {
            // 开仓单开了一半，剩下的放弃，直接转为对应的status
            logger.info(`${cfgID}::${act_id}|${entry} deal with TBA: cancel the remaining DN order!`);
            let dn_client_order_id = that.order_map[cfgID]["DN"]["client_order_id"];
            orders_to_be_cancelled.push({ order_type: ORDER_TYPE.LIMIT, client_order_id: dn_client_order_id });
            that.status_map[cfgID]["status"] = "LONG";

            delete that.order_map[cfgID]["DN"];
        } else if ((triggered === "ANTI_L|STOPLOSS") || (triggered === "ANTI_L|REVERSE")) {
            // 平仓单未能成交，撤销该单，改用市价单成交
            // 反手单未能成交，撤销该单，放弃反手，改为市价平仓
            let anti_client_order_id = that.order_map[cfgID]["ANTI_L"]["client_order_id"];
            orders_to_be_cancelled.push({ order_type: ORDER_TYPE.LIMIT, client_order_id: anti_client_order_id });

            if (that.status_map[cfgID]["pos"] < 0) {
                // 已经部分反手，放弃剩下的反手
                logger.info(`${cfgID}::${act_id}|${entry} deal with TBA: cancel the remaining ANTI_L order!`);
                that.status_map[cfgID]["status"] = "SHORT";

                delete that.order_map[cfgID]["ANTI_L"];
            } else if (that.status_map[cfgID]["pos"] === 0) {
                // 已经平仓，放弃剩下的反手
                logger.info(`${cfgID}::${act_id}|${entry} deal with TBA: cancel the remaining ANTI_L order!`);
                that.status_map[cfgID]["status"] = "EMPTY";
            } else {
                // 部分平仓，要求继续平仓，市价的0.97倍折出售，放弃剩下的反手
                // 因为binance对限价单价格有限制，通常不能超过标记价格的5%
                logger.info(`${cfgID}::${act_id}|${entry} deal with TBA: cover the LONG position!`);
                let tgt_qty = that.status_map[cfgID]["pos"];
                let sell_price = stratutils.transform_with_tick_size(that.prices[idf]["price"] * 0.97, PRICE_TICK_SIZE[idf]);
                orders_to_be_submitted.push({ 
                    label: "ANTI_L|STOPLOSS", target: "EMPTY", quantity: tgt_qty, price: sell_price, direction: DIRECTION.SELL, order_type: ORDER_TYPE.LIMIT 
                });
            }
        } else if ((triggered === "ANTI_S|STOPLOSS") || (triggered === "ANTI_S|REVERSE")) {
            // 平仓单未能成交，撤销该单，改用市价单成交
            // 反手单未能成交，撤销该单，放弃反手，改为市价平仓
            let anti_client_order_id = that.order_map[cfgID]["ANTI_S"]["client_order_id"];
            orders_to_be_cancelled.push({ order_type: ORDER_TYPE.LIMIT, client_order_id: anti_client_order_id });

            if (that.status_map[cfgID]["pos"] > 0) {
                // 已经部分反手，放弃剩下的反手
                logger.info(`${cfgID}::${act_id}|${entry} deal with TBA: cancel the remaining ANTI_S order!`);
                that.status_map[cfgID]["status"] = "LONG";

                delete that.order_map[cfgID]["ANTI_S"];
            } else if (that.status_map[cfgID]["pos"] === 0) {
                // 已经平仓，放弃剩下的反手
                logger.info(`${cfgID}::${act_id}|${entry} deal with TBA: cancel the remaining ANTI_S order!`);
                that.status_map[cfgID]["status"] = "EMPTY";
            } else {
                // 部分平仓，要求继续平仓，市价1.03倍购买，放弃剩下的反手
                // 因为binance对限价单价格有限制，通常不能超过标记价格的5%
                logger.info(`${cfgID}::${act_id}|${entry} deal with TBA: cover the SHORT position!`);
                let tgt_qty = - that.status_map[cfgID]["pos"];
                let buy_price = stratutils.transform_with_tick_size(that.prices[idf]["price"] * 1.03, PRICE_TICK_SIZE[idf]);
                orders_to_be_submitted.push({ 
                    label: "ANTI_S|STOPLOSS", target: "EMPTY", quantity: tgt_qty, price: buy_price, direction: DIRECTION.BUY, order_type: ORDER_TYPE.LIMIT
                });
            }
        } else {
            logger.error(`${cfgID}::TBA and new_bar handling: unhandled ${that.status_map[cfgID]["triggered"]}. If nothing, ignore it!`)
        }

        let current_status = that.status_map[cfgID]["status"];
        if (["LONG", "SHORT"].includes(current_status)) {
            that.status_map[cfgID]["bar_n"] = 0;    // 这里赋值为0，之后main_execuation中会加一
            that.status_map[cfgID]["af"] = that.cfg[cfgID]["ini_af"];
            that.status_map[cfgID]["sar"] = (current_status === "SHORT") ? up_price * (1 - cutloss_rate) : dn_price * (1 + cutloss_rate);;
            if (current_status === "SHORT") {
                that.status_map[cfgID]["long_enter"] = up_price;
                that.status_map[cfgID]["high_since_long"] = up_price;
            } else {
                that.status_map[cfgID]["short_enter"] = dn_price;
                that.status_map[cfgID]["low_since_short"] = dn_price;
            }
        }

        logger.info(`${cfgID}::deal with TBA: ${JSON.stringify(that.status_map[cfgID])}`);

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

        orders_to_be_submitted.forEach((order) => {
            let label = order.label, target = order.target, quantity = order.quantity, price = order.price;
            let direction = order.direction, order_type = order.order_type;
            let client_order_id = cfgID + LABELMAP[label] + randomID(5);  // client_order_id总共13位

            // 发送订单，同时建立order_map
            // {"3106609167": {"label": "DN", "target": "LONG", "quantity": 21133, "time": 1669492800445, "filled": 0}}
            that.order_map[cfgID][client_order_id] = { label: label, target: target, quantity: quantity, time: moment.now(), filled: 0 };
            // {"ANTI_S": { "client_order_id": "3103898618",  "label": "ANTI_S|STOPLOSS", "price": 0.3214, "quantity": 100, "time": 1669492800445}}
            that.order_map[cfgID][label.slice(0, 6)] = { client_order_id: client_order_id, label: label, price: price, quantity: quantity, time: moment.now() };

            that.send_order({
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
        let stoploss_rate = that.cfg[cfgID]["stoploss_rate"];
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

        // 重启以后将anti_order_sent置零
        if (new_start) that.status_map[cfgID]["anti_order_sent"] = false;

        // orders_to_be_cancelled: {order_type: "", client_order_id: ""}.
        // orders_to_be_submitted: {label: "", target: "", quantity: "", price: "", direction: "", order_type: ""}
        // order_type默认都是LIMIT
        let orders_to_be_cancelled = [];
        let orders_to_be_submitted = [];

        if (that.status_map[cfgID]["status"] === "EMPTY") {
            that.status_map[cfgID]["anti_order_sent"] = false;

            if ((new_start || new_bar) && (bar_enter_n < bar_enter_limit)) {
                // 计算开仓量
                let up_qty = stratutils.transform_with_tick_size(ini_usdt / up_price, QUANTITY_TICK_SIZE[idf]);
                let dn_qty = stratutils.transform_with_tick_size(ini_usdt / dn_price, QUANTITY_TICK_SIZE[idf]);

                // 如果已经有UP单，撤销之
                if (that.order_map[cfgID]["UP"] !== undefined) {
                    orders_to_be_cancelled.push({ order_type: ORDER_TYPE.LIMIT, client_order_id: that.order_map[cfgID]["UP"]["client_order_id"] });
                }

                // 如果已经有DN单，撤销之
                if (that.order_map[cfgID]["DN"] !== undefined) {
                    orders_to_be_cancelled.push({ order_type: ORDER_TYPE.LIMIT, client_order_id: that.order_map[cfgID]["DN"]["client_order_id"] });
                }

                orders_to_be_submitted.push({ label: "UP", target: "SHORT", quantity: up_qty, price: up_price, direction: DIRECTION.SELL, order_type: ORDER_TYPE.LIMIT });
                orders_to_be_submitted.push({ label: "DN", target: "LONG", quantity: dn_qty, price: dn_price, direction: DIRECTION.BUY, order_type: ORDER_TYPE.LIMIT });
            }
        } else if (that.status_map[cfgID]["status"] === "SHORT") {
            // 注意：SHORT时，实际上是up_break，因此有high_since_long
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
            } else {
                if (that.status_map[cfgID]["bar_n"] === 0) {
                    // the first bar when entered, initialize the ep value
                    that.status_map[cfgID]["ep"] = Math.max(that.status_map[cfgID]["ep"], price);
                }
            }

            if (that.status_map[cfgID]["high_since_long"] !== undefined) {
                that.status_map[cfgID]["high_since_long"] = Math.max(that.status_map[cfgID]["high_since_long"], price);
            }

            let stoploss_price = Math.max(that.status_map[cfgID]["high_since_long"] * (1 - stoploss_rate), that.status_map[cfgID]["sar"]);
            stoploss_price = stratutils.transform_with_tick_size(stoploss_price, PRICE_TICK_SIZE[idf]);
            that.status_map[cfgID]["stoploss_price"] = stoploss_price;

            if (isNaN(stoploss_price)) {
                logger.info(`${cfgID}: stoploss_price is null: ${that.status_map[cfgID]["high_since_long"]}, ${that.status_map[cfgID]["sar"]}, ${stoploss_rate}`)
            }

            // 对手单已经sent，但是还没有成功submitted，不做任何处理
            if (that.status_map[cfgID]["anti_order_sent"] === true) return;

            // 开仓当天不作任何操作
            if (that.status_map[cfgID]["bar_n"] === 0) return;

            if (stoploss_price < dn_price) {
                // dn_price更高，对手单为反手单
                // 直接发LIMIT单等待成交，如果已经触发，就想办法在该Bar内成交；如果未触发，则一直等待；
                let tgt_qty = stratutils.transform_with_tick_size(- that.status_map[cfgID]["pos"] + ini_usdt / dn_price, QUANTITY_TICK_SIZE[idf]);
                if (that.order_map[cfgID]["ANTI_S"] === undefined) {
                    // 对手单还没有发送
                    orders_to_be_submitted.push({ 
                        label: "ANTI_S|REVERSE", target: "LONG", quantity: tgt_qty, price: dn_price, direction: DIRECTION.BUY, order_type: ORDER_TYPE.LIMIT
                    });
                    that.status_map[cfgID]["anti_order_sent"] = true;
                } else {
                    // 对手单已发，检查是否需要更改
                    let anti_client_order_id = that.order_map[cfgID]["ANTI_S"]["client_order_id"];
                    let anti_label = that.order_map[cfgID]["ANTI_S"]["label"];
                    let anti_price = that.order_map[cfgID]["ANTI_S"]["price"];
                    let anti_qty = that.order_map[cfgID]["ANTI_S"]["quantity"];

                    // 若已存的反手单和现行不一致，则撤销重新发
                    if ((anti_label !== "ANTI_S|REVERSE") || (anti_price !== dn_price) || (anti_qty !== tgt_qty)) {
                        orders_to_be_cancelled.push({ order_type: ORDER_TYPE.LIMIT, client_order_id: anti_client_order_id });
                        orders_to_be_submitted.push({ 
                            label: "ANTI_S|REVERSE", target: "LONG", quantity: tgt_qty, price: dn_price, direction: DIRECTION.BUY, order_type: ORDER_TYPE.LIMIT 
                        });
                        that.status_map[cfgID]["anti_order_sent"] = true;
                    }
                }
            } else {
                // 止损价（stoploss_price）更高，反手单为止损单
                // 直接发LIMIT单等待成交，如果已经触发，就想办法在该Bar内成交；如果未触发，则一直等待
                let tgt_qty = stratutils.transform_with_tick_size(- that.status_map[cfgID]["pos"], QUANTITY_TICK_SIZE[idf]);
                // 如果open已经低于止损价，那么挂一个open的limit buy来进行平仓
                if ((new_bar) && (that.klines[cfgID]["open"][0] !== undefined)) stoploss_price = Math.min(that.klines[cfgID]["open"][0], stoploss_price);

                if (that.order_map[cfgID]["ANTI_S"] === undefined) {
                    // 对手单（止损单）未发送
                    orders_to_be_submitted.push({ 
                        label: "ANTI_S|STOPLOSS", target: "EMPTY", quantity: tgt_qty, price: stoploss_price, direction: DIRECTION.BUY, order_type: ORDER_TYPE.LIMIT
                    });
                    that.status_map[cfgID]["anti_order_sent"] = true;
                } else {
                    // 对手单（止损单）已经发送，检查是否需要更改
                    let anti_client_order_id = that.order_map[cfgID]["ANTI_S"]["client_order_id"];
                    let anti_label = that.order_map[cfgID]["ANTI_S"]["label"];
                    let anti_price = that.order_map[cfgID]["ANTI_S"]["price"];
                    let anti_qty = that.order_map[cfgID]["ANTI_S"]["quantity"];

                    // 若已存的平仓单（止损单）和现行不一致，则撤销重新发
                    if ((anti_label !== "ANTI_S|STOPLOSS") || (anti_price !== stoploss_price) || (anti_qty !== tgt_qty)) {
                        orders_to_be_cancelled.push({ order_type: ORDER_TYPE.LIMIT, client_order_id: anti_client_order_id });
                        orders_to_be_submitted.push({ 
                            label: "ANTI_S|STOPLOSS", target: "EMPTY", quantity: tgt_qty, price: stoploss_price, direction: DIRECTION.BUY, order_type: ORDER_TYPE.LIMIT
                        });
                        that.status_map[cfgID]["anti_order_sent"] = true;
                    }
                }
            }
        } else if (that.status_map[cfgID]["status"] === "LONG") {
            // 状态是LONG，但交易逻辑是dn break，因此有low_since_short
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
            } else {
                if (that.status_map[cfgID]["bar_n"] === 0) {
                    that.status_map[cfgID]["ep"] = Math.min(that.status_map[cfgID]["ep"], price);
                }
            }

            if (that.status_map[cfgID]["low_since_short"] !== undefined) {
                that.status_map[cfgID]["low_since_short"] = Math.min(that.status_map[cfgID]["low_since_short"], price);
            }

            let stoploss_price = Math.min(that.status_map[cfgID]["low_since_short"] * (1 + stoploss_rate), that.status_map[cfgID]["sar"]);
            stoploss_price = stratutils.transform_with_tick_size(stoploss_price, PRICE_TICK_SIZE[idf]);
            that.status_map[cfgID]["stoploss_price"] = stoploss_price;

            if (isNaN(stoploss_price)) {
                logger.info(`stoploss_price is null: ${that.status_map[cfgID]["low_since_short"]}, ${that.status_map[cfgID]["sar"]}, ${stoploss_rate}`)
            }

            // logger.info(`${symbol}::SHORT::${JSON.stringify(that.status_map[cfgID])}`);

            // 对手单已经sent，但是还没有成功submitted，不做任何处理
            if (that.status_map[cfgID]["anti_order_sent"] === true) return;

            // 开仓当天不作任何操作
            if (that.status_map[cfgID]["bar_n"] === 0) return;

            if (stoploss_price > up_price) {
                // up_price更低，对手单为反手单
                // 直接发LIMIT单等待成交，如果已经触发，就想办法在该Bar内成交；如果未触发，则一直等待；
                let tgt_qty = stratutils.transform_with_tick_size(that.status_map[cfgID]["pos"] + ini_usdt / up_price, QUANTITY_TICK_SIZE[idf]);
                if (that.order_map[cfgID]["ANTI_L"] === undefined) {
                    orders_to_be_submitted.push({ 
                        label: "ANTI_L|REVERSE", target: "SHORT", quantity: tgt_qty, price: up_price, direction: DIRECTION.SELL, order_type: ORDER_TYPE.LIMIT
                    });
                    that.status_map[cfgID]["anti_order_sent"] = true;
                } else {
                    let anti_client_order_id = that.order_map[cfgID]["ANTI_L"]["client_order_id"];
                    let anti_label = that.order_map[cfgID]["ANTI_L"]["label"];
                    let anti_price = that.order_map[cfgID]["ANTI_L"]["price"];
                    let anti_qty = that.order_map[cfgID]["ANTI_L"]["quantity"];

                    if ((anti_label !== "ANTI_L|REVERSE") || (anti_price !== up_price) || (anti_qty !== tgt_qty)) {
                        // 若已存的对手单（反手单）和现行不一致，则撤销重新发
                        orders_to_be_cancelled.push({ order_type: ORDER_TYPE.LIMIT, client_order_id: anti_client_order_id });
                        orders_to_be_submitted.push({
                            label: "ANTI_L|REVERSE", target: "SHORT", quantity: tgt_qty, price: up_price, direction: DIRECTION.SELL, order_type: ORDER_TYPE.LIMIT
                        });
                        that.status_map[cfgID]["anti_order_sent"] = true;
                    }
                }

            } else {
                // 止损价（stoploss_price）更低，对手单为止损单
                // 直接发LIMIT单等待成交，如果已经触发，就想办法在该Bar内成交；如果未触发，则一直等待；
                let tgt_qty = stratutils.transform_with_tick_size(that.status_map[cfgID]["pos"], QUANTITY_TICK_SIZE[idf]);
                // 如果open已经高于止损价，那么挂一个open的limit sell来进行平仓
                if ((new_bar) && (that.klines[cfgID]["open"][0] !== undefined)) stoploss_price = Math.max(that.klines[cfgID]["open"][0], stoploss_price);

                if (that.order_map[cfgID]["ANTI_L"] === undefined) {
                    orders_to_be_submitted.push({ 
                        label: "ANTI_L|STOPLOSS", target: "EMPTY", quantity: tgt_qty, price: stoploss_price, direction: DIRECTION.SELL, order_type: ORDER_TYPE.LIMIT
                    });
                    that.status_map[cfgID]["anti_order_sent"] = true;
                } else {
                    let anti_client_order_id = that.order_map[cfgID]["ANTI_L"]["client_order_id"];
                    let anti_label = that.order_map[cfgID]["ANTI_L"]["label"];
                    let anti_price = that.order_map[cfgID]["ANTI_L"]["price"];
                    let anti_qty = that.order_map[cfgID]["ANTI_L"]["quantity"];

                    if ((anti_label !== "ANTI_L|STOPLOSS") || (anti_price !== stoploss_price) || (anti_qty !== tgt_qty)) {
                        orders_to_be_cancelled.push({ order_type: ORDER_TYPE.LIMIT, client_order_id: anti_client_order_id });
                        orders_to_be_submitted.push({ 
                            label: "ANTI_L|STOPLOSS", target: "EMPTY", quantity: tgt_qty, price: stoploss_price, direction: DIRECTION.SELL, order_type: ORDER_TYPE.LIMIT
                        });
                        that.status_map[cfgID]["anti_order_sent"] = true;
                    }
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
            let direction = order.direction, order_type = order.order_type;
            let client_order_id = cfgID + LABELMAP[label] + randomID(5);  // client_order_id总共13位

            // 发送订单，同时建立order_map
            // {"3106609167": {"label": "DN", "target": "LONG", "quantity": 21133, "time": 1669492800445, "price": 0.04732, "filled": 0}}
            that.order_map[cfgID][client_order_id] = { label: label, target: target, quantity: quantity, time: moment.now(), filled: 0 };
            // {"ANTI_S": { "client_order_id": "3103898618",  "label": "ANTI_S|STOPLOSS", "price": 0.3214, "quantity": 100, "time": 1669492800445}}
            that.order_map[cfgID][label.slice(0, 6)] = { client_order_id: client_order_id, label: label, price: price, quantity: quantity, time: moment.now() };

            that.send_order({
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
        let order_type = response["request"]["order_type"] ? response["request"]["order_type"] : ORDER_TYPE.LIMIT;

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
                // 市价单价格发单限制，调整价格后重发
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
                let key = KEY[act_id];
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
                    delete that.order_map[cfgID]["DN"];
                } else {
                    logger.info(`${cfgID}::${order_idf}::price less than min, but not a DN order, check!`);
                }
            } else if (error_code_msg === "Quantity greater than max quantity.") {
                // quantity超过最大限制，通常是DN单，那就不设置DN单
                if (label === "DN") {
                    delete that.order_map[cfgID]["DN"];
                } else {
                    logger.info(`${cfgID}::${order_idf}::Quantity greater than max quantity, but not a DN order, check!`);
                }
            } else if (error_code_msg === "Order would immediately trigger.") {
                // The order would be triggered immediately, STOP order才会报这样的错，本策略都是LIMIT ORDER
            } else if (error_code_msg === "Futures Trading Quantitative Rules violated, only reduceOnly order is allowed, please try again later.") {
                this.query_quantitative_rules({
                    exchange: EXCHANGE.BINANCEU,
                    contract_type: CONTRACT_TYPE.PERP,
                    account_id: act_id
                });
            } else if (error_code_msg === "Server is currently overloaded with other requests. Please try again in a few minutes.") {
                resend = true, timeout = 1000 * 10;
            } else if (error_code_msg === "Futures Trading Quantitative Rules violated, only reduceOnly order is allowed, please try again later.") { 
                // 尝试10分钟后重发，那么在这10分钟内会不断报order not active, but still in the order map
                resend = true, timeout = 1000 * 60 * 10;
            } else if (error_code_msg === "Timeout waiting for response from backend server. Send status unknown; execution status unknown.") {
                // 1分钟后inspect this order，因为立即inspect order的话可能面临一样的response
                setTimeout(() => {
                    this.inspect_order({
                        exchange: exchange,
                        symbol: symbol,
                        contract_type: contract_type,
                        order_type: order_type,
                        account_id: act_id,
                        client_order_id: client_order_id
                    });
                }, 1000 * 60);
            } else {
                logger.warn(`${cfgID}::on_response|${order_idf}::unknown error occured during ${action}: ${error_code}: ${error_code_msg}`);
                return;
            }

            if (resend) {
                logger.info(`${cfgID}::${order_idf}::resend the order in ${timeout} ms!`);
                setTimeout(() => {
                    retry = (retry === undefined) ? 1 : retry + 1;
                    let new_client_order_id = that.alias + LABELMAP[label] + randomID(7);

                    // 注意：order_map里面的key只有ANTI_L, ANTI_S, UP, DN四种；
                    // 但是label有六种！
                    that.order_map[cfgID][new_client_order_id] = { label: label, target: target, quantity: quantity, time: moment.now(), filled: 0 };
                    that.order_map[cfgID][label.slice(0, 6)] = { client_order_id: new_client_order_id, label: label, price: price, quantity: quantity, time: moment.now() };

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
            logger.info(`${cfgID}::on_response|${order_idf} submitted!`);
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
        let order_type = response["request"]["order_type"] ? response["request"]["order_type"] : ORDER_TYPE.LIMIT;

        let cfgID = client_order_id.slice(0, 7);
        let idf = that.cfg[cfgID]["idf"];
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

    on_inspect_order_response(response) {
        // 等待完善
        logger.info(JSON.stringify(this.order_map));
        let that = this;

        let client_order_id = response["request"]["client_order_id"];
        let cfgID = client_order_id.slice(0, 7);
        let entry = that.cfg[cfgID]["entry"];

        let label = client_order_id.slice(7, 9);
        if (!Object.values(LABELMAP).includes(label)) {
            logger.info(`${that.alias}::on_order_update|unknown order label ${label}!`);
            return;
        }
        label = stratutils.get_key_by_value(LABELMAP, label);

        if ((response["metadata"]["order_info"]["status"] === "unknown") && (response["metadata"]["metadata"]["error_code_msg"] === "Order does not exist.")) {
            if (client_order_id in that.order_map[cfgID]) {
                delete that.order_map[cfgID][client_order_id];
                that.slack_publish({
                    "type": "alert",
                    "msg": `${cfgID}::${entry}::After inspecting, delete ${client_order_id} from order map!`
                });
            }

            if ((label.slice(0, 6) in that.order_map[cfgID]) && (that.order_map[cfgID][label.slice(0, 6)]["client_order_id"] === client_order_id)) {
                delete that.order_map[cfgID][label.slice(0, 6)];
                that.slack_publish({
                    "type": "alert",
                    "msg": `${cfgID}::${entry}::After inspecting, delete ${label}|${client_order_id} from order map!`
                });
            }

            // 将pre_bar_otime设置为undefined，方便重现发单，尤其是UP & DN单
            that.pre_bar_otime[cfgID] = undefined;
        }
    }

    on_active_orders(response) {
        // BAM会统一查询所有交易账户的active orders并推送给各个策略端，然后再由策略段负责检查
        // 检查逻辑：
        // 1. 筛选出client_order_id属于本策略的订单, client_order_id不属于任何策略的订单会在BAM处alert；
        // 2. client_order_id属于本策略，但是压根没有对应的idf；
        // 3. client_order_id属于本策略，也有对应的idf，但是act_id不对；
        let that = this;

        let exchange = response["request"]["exchange"];
        let contract_type = response["request"]["contract_type"];
        let act_id = response["request"]["account_id"];
        if (!that.cfg["act_ids"].includes(act_id)) return;

        let orders = response["metadata"]["metadata"]["orders"];
        let active_orders = orders.filter(item => item.client_order_id.slice(0, 3) === that.alias);

        let sendData = {
            "tableName": this.alias,
            "tabName": "PortfolioMonitor",
            "data": []
        }

        let alert_string = "";
        let corr_cfgIDs = that.cfg["cfgIDs"].filter(cfgID => that.cfg[cfgID]["act_id"] == act_id);

        for (let cfgID of corr_cfgIDs) {
            if (act_id !== that.cfg[cfgID]["act_id"]) continue;

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

        that.intercom.emit("UI_update", sendData, INTERCOM_SCOPE.UI);

        if (alert_string !== "") {
            logger.info(`${that.alias}|${act_id}::order not active, but still in the order map as follows, \n${alert_string}`);
            alert_string = `${that.alias}|${act_id}::order not active, but still in the order map as follows, \n${alert_string}\n`;
        }

        let wierd_orders_1 = active_orders.filter(e => !that.cfg["cfgIDs"].includes(e.client_order_id.slice(0, 7)));
        let wierd_orders_2 = active_orders.filter(e => that.cfg["cfgIDs"].includes(e.client_order_id.slice(0, 7)) && (that.cfg[e.client_order_id.slice(0, 7)]["act_id"] !== act_id));
        
        if (wierd_orders_1.length > 0) alert_string += `${that.alias}|${act_id}::idf not exists:: ${JSON.stringify(wierd_orders_1)}\n`;
        if (wierd_orders_2.length > 0) alert_string += `${that.alias}|${act_id}::act_id inconsistent:: ${JSON.stringify(wierd_orders_2)}\n`; 
        if (alert_string !== "") {
            that.slack_publish({
                "type": "alert",
                "msg": alert_string
            });
        }
    }

}

module.exports = RevTrendStrategy;

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

        strategy = new RevTrendStrategy("RevTrend", alias, new Intercom(intercom_config));
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