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

const LABELS = ["UP", "DN", "SP", "CV"];

class RangeVolStrategy extends StrategyBase {
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
        this.bnb_price = undefined;
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

        that.cfg["entries"].forEach((entry, index) => {
            if (!(entry in that.status_map)) return;
            let item = {};
            let idf = entry.split(".").slice(0, 3).join(".");
        
            // 计算time_gap和盈利情况
            let price_presentation = "";
            if (that.prices[idf]) {
                let gap = Math.round((moment.now() - utils._util_convert_timestamp_to_date(that.prices[idf]["upd_ts"])) / 1000);
                price_presentation = `${that.prices[idf]["price"]}|${gap}`;
                if (that.status_map[entry]["status"] === "LONG") {
                    let percentage = that.status_map[entry]["enter"] ? ((that.prices[idf]["price"] - that.status_map[entry]["enter"]) / that.status_map[entry]["enter"] * 100).toFixed(0) + "%" : "miss";
                    price_presentation += "|" + percentage;
                } else if (that.status_map[entry]["status"] === "SHORT") {
                    let percentage = that.status_map[entry]["enter"] ? ((that.status_map[entry]["enter"] - that.prices[idf]["price"]) / that.status_map[entry]["enter"] * 100).toFixed(0) + "%" : "miss";
                    price_presentation += "|" + percentage;
                }
            }

            item[`${index + 1}|entry`] = entry;
            item[`${index + 1}|status`] = that.status_map[entry]["status"];
            item[`${index + 1}|triggered`] = that.status_map[entry]["triggered"];
            item[`${index + 1}|pos`] = that.status_map[entry]["pos"];
            item[`${index + 1}|fee`] = that.status_map[entry]["fee"];
            item[`${index + 1}|np`] = that.status_map[entry]["net_profit"];
            item[`${index + 1}|price`] = price_presentation;
            item[`${index + 1}|enter`] = that.status_map[entry]["enter"];
            item[`${index + 1}|up`] = that.status_map[entry]["up"];
            item[`${index + 1}|dn`] = that.status_map[entry]["dn"];
            sendData["data"].push(item);
        });

        this.intercom.emit("UI_update", sendData, INTERCOM_SCOPE.UI);
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
                    "enter": "",
                    "bar_n": "",
                    "bar_enter_n": 0,
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
        that.cfg["entries"].forEach((entry) => {
            that.load_entry_klines(entry);
        });
    }

    load_entry_klines(entry) {
        let that = this;

        let [exchange, symbol, contract_type, interval, mark] = entry.split(".");
        let num = (interval.endsWith("d")) ? parseInt(interval.split("d")[0]) * 24 : parseInt(interval.split("h")[0]);
        assert(["2d", "1d", "12h", "8h", "6h", "4h", "3h", "2h", "1h"].includes(interval));

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
                // 如果是2d-interval，那么从2000-01-01的零点开始算splitAt
                let hour = (interval == "2d") ? moment(ts, "YYYYMMDDHHmmssSSS").diff(moment("20000101000000000", "YYYYMMDDHHmmssSSS"), 'hours') : parseInt(ts.slice(8, 10));
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
                that.load_entry_klines(entry);
            } else {
                that.klines[entry]["ready"] = true;
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

        // "{V01}-{01h}-{DN}-{M01}-{nQXYE}"
        let interval = (client_order_id.slice(3, 4) === "0")? client_order_id.slice(4, 6): client_order_id.slice(3, 6);
        let label = client_order_id.slice(6, 8);
        let mark = client_order_id.slice(8, 11);
        
        let idf = [exchange, symbol, contract_type].join(".");
        let entry = [exchange, symbol, contract_type, interval, mark].join(".");
        let order_idf = [act_id, entry, direction, client_order_id].join("|");

        // 不是本策略的订单更新，自动过滤
        if (client_order_id.slice(0, 3) !== that.alias) return;
        logger.info(`${that.alias}::on_order_update|${JSON.stringify(order_update)}`);

        if (order_status === ORDER_STATUS.SUBMITTED) {

            let submit_price = order_update["order_info"]["submit_price"];
            let original_amount = order_update["order_info"]["original_amount"];
            logger.info(`${that.alias}::on_order_update|${order_idf} ${order_type} order ${original_amount} placed @${submit_price} after ${update_type}!`);

        } else if (order_status === ORDER_STATUS.CANCELLED) {

            logger.info(`${that.alias}::on_order_update|${order_idf} ${order_type} order cancelled after ${update_type}!`);
            if (update_type === "cancelled") {
                // 订单已经撤销，100毫秒后从order_map中删除该订单（1分钟之后的原因是防止on_response还要用）
                logger.info(`${that.alias}::on_order_update|${order_idf} ${order_type} order cancelled, will be removed from order_map in 200ms!`);
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
            let fee_asset = order_update["metadata"]["fee_asset"];
            // 用BNB合约价格，把BNB手续费折算成USDT
            if (fee_asset === "BNB") fee = this.bnb_price? fee * this.bnb_price : fee * 570;

            logger.info(`${that.alias}::on_order_update|${order_idf} ${order_type} order ${filled}/${original_amount} filled @${avg_executed_price}/${submit_price}!`);

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
            logger.info(`${that.alias}|${symbol}::${JSON.stringify(that.status_map[entry])}`);
            logger.info(`${that.alias}|${symbol}::${JSON.stringify(that.order_map[entry])}`);

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
                    that.pre_bar_otime[idf] = undefined;
                    for (let item of ["bar_n", "enter", "stoploss_price"]) {
                        that.status_map[entry][item] = "";
                    }
                } else {
                    that.status_map[entry]["bar_n"] = 0;
                    that.status_map[entry]["bar_enter_n"] += 1;
                    that.status_map[entry]["enter"] = avg_executed_price;
                }

                // 订单完全成交，在order_map中删去该订单（注意：完全成交才删除，且当场删除！）
                delete that.order_map[entry][label];

                // remove the client_order_id from order_map 100ms later, as the on_response may need to use it!
                setTimeout(() => delete that.order_map[entry][client_order_id], 100);
            } else {
                // 订单部分成交，处于触发状态
                that.status_map[entry]["status"] = "TBA";
                that.status_map[entry]["triggered"] = label;
            }

            // record the order filling details
            let ts = order_update["metadata"]["timestamp"];
            let filled_info = [act_id, exchange, symbol, contract_type, client_order_id, order_type, original_amount, filled, submit_price, avg_executed_price, fee].join(",");
            // order_map中只提取label,target,quantity,time,filled等信息
            let order_info = (that.order_map[entry][client_order_id] === undefined) ? ",,,," : Object.entries(that.order_map[entry][client_order_id]).filter((element) => ["label", "target", "quantity", "time", "filled"].includes(element[0])).map((element) => element[1]).join(",");
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
        if (idf === "BinanceU.BNBUSDT.perp") this.bnb_price = price;

        if (!that.cfg["idfs"].includes(idf)) return;
        that.prices[idf] = { "price": price, "upd_ts": ts };

        let corr_entries = that.cfg["entries"].filter((entry) => entry.split(".").slice(0, 3).join(".") === idf);
        for (let entry of corr_entries) {
            if (!that.klines[entry]["ready"]) continue;

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
                logger.info(`${that.alias}::${entry}::NEW BAR!::${JSON.stringify(trade)}`);
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

    main_execuation(new_start, new_bar, entry) {
        let that = this;
        let [exchange, symbol, contract_type, interval, mark] = entry.split(".");
        let idf = entry.split(".").slice(0, 3).join(".");
        let price = that.prices[idf]["price"];
        let ini_usdt = (that.cfg[entry]["ini_usdt"]) ? that.cfg[entry]["ini_usdt"] : that.cfg["ini_usdt"];
        let act_id = that.cfg[entry]["act_id"];

        // load status_map  -----------------------------------------------
        let bar_enter_n = that.status_map[entry]["bar_enter_n"];

        // para loading -----------------------------------------------
        let track_ATR_multiplier = that.cfg[entry]["track_ATR_multiplier"];
        let af = that.cfg[entry]["af"];
        let bar_enter_limit = that.cfg[entry]["bar_enter_limit"];

        // cal indicators -----------------------------------------------
        let price_tick_size = that.cfg[entry]["digits"] ? that.cfg[entry]["digits"] : PRICE_TICK_SIZE[idf];
        let track_ATR = Math.max(...Object.values(that.klines[entry]["high"]).slice(1)) - Math.min(...Object.values(that.klines[entry]["low"]).slice(1));
        let up = that.klines[entry]["open"][0] + track_ATR * track_ATR_multiplier;
        let dn = that.klines[entry]["open"][0] - track_ATR * track_ATR_multiplier;
        let up_price = stratutils.transform_with_tick_size(up, price_tick_size);
        let dn_price = stratutils.transform_with_tick_size(dn, price_tick_size, "round");  // 如果dn_price是负数，会被round成最小价

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

                // "{V01}-{01h}-{DN}-{M01}-{nQXYE}"
                let up_client_order_id = that.alias + interval.padStart(3, '0') + "UP" + mark + randomID(5);
                let dn_client_order_id = that.alias + interval.padStart(3, '0') + "DN" + mark + randomID(5);
                orders_to_be_submitted.push({ client_order_id: up_client_order_id, label: "UP", target: "SHORT", quantity: up_qty, order_type: ORDER_TYPE.LIMIT, price: up_price, direction: DIRECTION.SELL });
                orders_to_be_submitted.push({ client_order_id: dn_client_order_id, label: "DN", target: "LONG", quantity: dn_qty, order_type: ORDER_TYPE.LIMIT, price: dn_price, direction: DIRECTION.BUY });
            }
        } else if (that.status_map[entry]["status"] === "SHORT") {
            if (new_bar) that.status_map[entry]["bar_n"] += 1;

            // 开仓当天不作任何操作
            if (that.status_map[entry]["bar_n"] === 0) return;

            dn_price = that.klines[entry]["open"][0] - (track_ATR_multiplier - that.status_map[entry]["bar_n"] * af) * track_ATR;
            dn_price = stratutils.transform_with_tick_size(dn_price, price_tick_size, "round");  // 如果dn_price是负数，会被round成最小价
            let dn_qty = stratutils.transform_with_tick_size(- that.status_map[entry]["pos"] + ini_usdt / dn_price, QUANTITY_TICK_SIZE[idf]);

            if ((new_start || new_bar) && (bar_enter_n < bar_enter_limit)) {
                // 如果已经有UP单，撤销之
                if (that.order_map[entry]["UP"] !== undefined) {
                    orders_to_be_cancelled.push(that.order_map[entry]["UP"]["client_order_id"]);
                }

                // 如果已经有DN单，撤销之
                if (that.order_map[entry]["DN"] !== undefined) {
                    orders_to_be_cancelled.push(that.order_map[entry]["DN"]["client_order_id"]);
                }

                // "{V01}-{01h}-{DN}-{M01}-{nQXYE}"
                let dn_client_order_id = that.alias + interval.padStart(3, '0') + "DN" + mark + randomID(5);
                orders_to_be_submitted.push({ client_order_id: dn_client_order_id, label: "DN", target: "LONG", quantity: dn_qty, order_type: ORDER_TYPE.LIMIT, price: dn_price, direction: DIRECTION.BUY });
            }

        } else if (that.status_map[entry]["status"] === "LONG") {
            if (new_bar) that.status_map[entry]["bar_n"] += 1;

            // 开仓当天不作任何操作
            if (that.status_map[entry]["bar_n"] === 0) return;

            up_price = that.klines[entry]["open"][0] + (track_ATR_multiplier - that.status_map[entry]["bar_n"] * af) * track_ATR;
            up_price = stratutils.transform_with_tick_size(up_price, price_tick_size);
            let up_qty = stratutils.transform_with_tick_size(that.status_map[entry]["pos"] + ini_usdt / up_price, QUANTITY_TICK_SIZE[idf]);

            if ((new_start || new_bar) && (bar_enter_n < bar_enter_limit)) {
                // 如果已经有UP单，撤销之
                if (that.order_map[entry]["UP"] !== undefined) {
                    orders_to_be_cancelled.push(that.order_map[entry]["UP"]["client_order_id"]);
                }

                // 如果已经有DN单，撤销之
                if (that.order_map[entry]["DN"] !== undefined) {
                    orders_to_be_cancelled.push(that.order_map[entry]["DN"]["client_order_id"]);
                }

                // "{V01}-{01h}-{DN}-{M01}-{nQXYE}"
                let up_client_order_id = that.alias + interval.padStart(3, '0') + "UP" + mark + randomID(5);
                orders_to_be_submitted.push({ client_order_id: up_client_order_id, label: "UP", target: "SHORT", quantity: up_qty, order_type: ORDER_TYPE.LIMIT, price: up_price, direction: DIRECTION.SELL });
            }
        }

        // 在status_map里面更新up和dn价格信息
        that.status_map[entry]["up"] = up_price;
        that.status_map[entry]["dn"] = dn_price;

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
            that.order_map[entry][label] = { client_order_id: client_order_id, label: label, price: price, quantity: quantity, time: moment.now() };

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

    deal_with_TBA(entry) {
        logger.info(`${this.alias}::deal with TBA: ${JSON.stringify(this.order_map)}`);
        let that = this;
        let [exchange, symbol, contract_type, interval, mark] = entry.split(".");
        let act_id = that.cfg[entry]["act_id"];

        let triggered = that.status_map[entry]["triggered"];
        let orders_to_be_cancelled = [];
        let orders_to_be_submitted = [];

        if (triggered === "UP") {
            // 开仓单开了一半，剩下的撤单，直接转为对应的status
            logger.info(`${that.alias}::${act_id}|${idf} deal with TBA: cancel the remaining UP order!`);
            let up_client_order_id = that.order_map[entry]["UP"]["client_order_id"];
            orders_to_be_cancelled.push(up_client_order_id);
            delete that.order_map[entry]["UP"];

            if (that.status_map[entry]["pos"] <= 0) {
                // 已经是SHORT的仓位，那么直接将status转为SHORT，未成交的部分直接撤单
                // 如果仓位是0，那么将status直接转为EMPTY，未成交的部分撤单
                that.status_map[entry]["status"] = (that.status_map[entry]["pos"] === 0) ? "EMPTY" : "SHORT";
            } else {
                // 如果仓位依然大于0，那么应该是LONG的仓位只反转了一小部分，那么将剩下的部分平掉，使仓位转为EMPTY
                let tgt_qty = that.status_map[entry]["pos"];
                let sell_price = stratutils.transform_with_tick_size(that.prices[idf]["price"] * 0.97, PRICE_TICK_SIZE[idf]);
                orders_to_be_submitted.push({ client_order_id: that.alias + interval.padStart(3, '0') + "CV" + mark + randomID(5), label: "CV", target: "EMPTY", quantity: tgt_qty, price: sell_price, direction: DIRECTION.SELL });
            }
            
        } else if (triggered === "DN") {
            // 开仓单开了一半，剩下的撤单，直接转为对应的status
            logger.info(`${that.alias}::${act_id}|${idf} deal with TBA: cancel the remaining UP order!`);
            let dn_client_order_id = that.order_map[entry]["DN"]["client_order_id"];
            orders_to_be_cancelled.push(dn_client_order_id);
            delete that.order_map[entry]["DN"];

            if (that.status_map[entry]["pos"] >= 0) {
                // 已经是LONG的仓位，那么直接将status转为SHORT，未成交的部分直接撤单
                // 如果仓位是0，那么将status直接转为EMPTY，未成交的部分撤单
                that.status_map[entry]["status"] = (that.status_map[entry]["pos"] === 0) ? "EMPTY" : "SHORT";
            } else {
                // 如果仓位依然小于0，那么应该是LONG的仓位只反转了一小部分，那么将剩下的部分平掉，使仓位转为EMPTY
                let tgt_qty = that.status_map[entry]["pos"];
                let buy_price = stratutils.transform_with_tick_size(that.prices[idf]["price"] * 1.03, PRICE_TICK_SIZE[idf]);
                orders_to_be_submitted.push({ client_order_id: that.alias + interval.padStart(3, '0') + "CV" + mark + randomID(5), label: "CV", target: "EMPTY", quantity: tgt_qty, price: buy_price, direction: DIRECTION.BUY });
            }
        } else {
            logger.info(`${that.alias}::TBA and new_bar handling: unhandled ${that.status_map[entry]["triggered"]}. If nothing, ignore it!`)
        }

        let current_status = that.status_map[entry]["status"];
        if (["LONG", "SHORT"].includes(current_status)) {
            that.status_map[entry]["bar_n"] = 0;    // 这里赋值为0，之后main_execuation中会加一
        }

        logger.info(`deal with TBA: ${JSON.stringify(that.status_map[entry])}`);
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
            that.order_map[entry][client_order_id] = { label: label, target: target, quantity: quantity, time: moment.now(), filled: 0 };
            // {"ANTI_S": { "client_order_id": "3103898618",  "label": "ANTI_S|STOPLOSS", "price": 0.3214, "quantity": 100, "time": 1669492800445}}
            that.order_map[entry][label] = { client_order_id: client_order_id, label: label, price: price, quantity: quantity, time: moment.now() };

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

        // "{V01}-{01h}-{DN}-{M01}-{nQXYE}"
        let interval = (client_order_id.slice(3, 4) === "0")? client_order_id.slice(4, 6): client_order_id.slice(3, 6);
        let label = client_order_id.slice(6, 8);
        let mark = client_order_id.slice(8, 11);
        if (!LABELS.includes(label)) {
            logger.info(`${that.alias}::on_send_order_response|unknown order label ${label}!`);
            return;
        }

        let idf = [exchange, symbol, contract_type].join(".");
        let entry = [exchange, symbol, contract_type, interval, mark].join(".");
        let order_idf = [act_id, entry, direction, client_order_id].join("|");

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
                    delete that.order_map[entry]["DN"];
                } else {
                    logger.info(`${that.alias}::${order_idf}::price less than min, but not a DN order, check!`);
                }
            } else if (error_code_msg === "Quantity greater than max quantity.") {
                // quantity超过最大限制，通常是DN单，那就不设置DN单
                if (label === "DN") {
                    delete that.order_map[entry]["DN"];
                } else {
                    logger.info(`${that.alias}::${order_idf}::Quantity greater than max quantity, but not a DN order, check!`);
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
                        account_id: act_id,
                        client_order_id: client_order_id
                    });
                }, 1000 * 60);
            } else {
                logger.warn(`${that.alias}::on_response|${order_idf}::unknown error occured during ${action}: ${error_code}: ${error_code_msg}`);
                return;
            }

            if (resend) {
                logger.info(`${that.alias}::${order_idf}::resend the order in ${timeout} ms!`);
                setTimeout(() => {
                    retry = (retry === undefined) ? 1 : retry + 1;
                    let new_client_order_id = that.alias + interval.padStart(3, '0') + label + mark + randomID(5);

                    // label: 只有三种：UP DN CV
                    that.order_map[entry][new_client_order_id] = { label: label, target: target, quantity: quantity, time: moment.now(), filled: 0 };
                    that.order_map[entry][label] = { client_order_id: new_client_order_id, label: label, price: price, quantity: quantity, time: moment.now() };

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

        // "{V01}-{01h}-{DN}-{M01}-{nQXYE}"
        let interval = (client_order_id.slice(3, 4) === "0")? client_order_id.slice(4, 6): client_order_id.slice(3, 6);
        let label = client_order_id.slice(6, 8);
        let mark = client_order_id.slice(8, 11);
        if (!LABELS.includes(label)) {
            logger.info(`${that.alias}::on_send_order_response|unknown order label ${label}!`);
            return;
        }

        let idf = [exchange, symbol, contract_type].join(".");
        let entry = [exchange, symbol, contract_type, interval, mark].join(".");
        let order_idf = [act_id, entry, direction, client_order_id].join("|");

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

    on_inspect_order_response(response) {
        // 等待完善
        logger.info(JSON.stringify(this.order_map));
        let that = this;

        let exchange = response["request"]["exchange"];
        let symbol = response["request"]["symbol"];
        let contract_type = response["request"]["contract_type"];
        let client_order_id = response["request"]["client_order_id"];

        // "{V01}-{01h}-{DN}-{M01}-{nQXYE}"
        let interval = (client_order_id.slice(3, 4) === "0")? client_order_id.slice(4, 6): client_order_id.slice(3, 6);
        let label = client_order_id.slice(6, 8);
        let mark = client_order_id.slice(8, 11);
        if (!LABELS.includes(label)) {
            logger.info(`${that.alias}::on_send_order_response|unknown order label ${label}!`);
            return;
        }

        let idf = [exchange, symbol, contract_type].join(".");
        let entry = [exchange, symbol, contract_type, interval, mark].join(".");
        let order_idf = [act_id, entry, direction, client_order_id].join("|");

        if ((response["metadata"]["order_info"]["status"] === "unknown") && (response["metadata"]["metadata"]["error_code_msg"] === "Order does not exist.")) {
            if (client_order_id in that.order_map[entry]) {
                delete that.order_map[entry][client_order_id];
                that.slack_publish({
                    "type": "alert",
                    "msg": `${that.alias}::${idf}::After inspecting, delete ${client_order_id} from order map!`
                });
            }

            if ((label in that.order_map[entry]) && (that.order_map[entry][label]["client_order_id"] === client_order_id)) {
                delete that.order_map[entry][label];
                that.slack_publish({
                    "type": "alert",
                    "msg": `${that.alias}::${idf}::After inspecting, delete ${label}|${client_order_id} from order map!`
                });
            }

            // 将pre_bar_otime设置为undefined，方便重现发单，尤其是UP & DN单
            that.pre_bar_otime[idf] = undefined;
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
        active_orders.map(e => {e.interval = (e.client_order_id.slice(3, 4) === "0")? e.client_order_id.slice(4, 6): e.client_order_id.slice(3, 6);});
        active_orders.map(e => {e.mark = e.client_order_id.slice(8, 11);});

        let sendData = {
            "tableName": this.alias,
            "tabName": "PortfolioMonitor",
            "data": []
        }

        let alert_string = "";
        let corr_entries = that.cfg["entries"].filter(e => that.cfg[e]["act_id"] == act_id);

        for (let entry of corr_entries) {
            let symbol = entry.split(".")[1];
            let corr_active_orders = active_orders.filter(item => (item.symbol === symbol));
            let corr_active_client_order_ids = corr_active_orders.map(item => item.client_order_id);
            let string = corr_active_client_order_ids.join(",");

            let index = that.cfg["entries"].indexOf(entry);

            let item = {};
            item[`${index + 1}|orders`] = string;
            sendData["data"].push(item);

            // TODO: 从order_map删除item
            for (let [key, value] of Object.entries(that.order_map[entry])) {
                
                if (key.startsWith(that.alias)) {
                    // 以
                    if (corr_active_client_order_ids.includes(key)) continue;
                } else {
                    if (corr_active_client_order_ids.includes(value.client_order_id)) continue;
                }

                if (that.order_map[entry][key]["ToBeDeleted"]) {
                    // 超过10秒才删除，避免order_update推送延迟，导致order_update的处理过程中order_map中信息缺失
                    if (moment.now() - value["ToBeDeletedTime"] > 1000 * 10) {
                        alert_string += `${entry}: ${key}: ${JSON.stringify(that.order_map[entry][key])}\n`;
                        // 如果delete了，在deal_with_TBA里面又会报错？
                        // delete that.order_map[entry][key];
                    }
                } else {
                    that.order_map[entry][key]["ToBeDeleted"] = true;
                    that.order_map[entry][key]["ToBeDeletedTime"] = moment.now();
                }
            }
        }

        that.intercom.emit("UI_update", sendData, INTERCOM_SCOPE.UI);

        if (alert_string !== "") {
            logger.info(`${that.alias}|${act_id}::order not active, but still in the order map as follows, \n${alert_string}`);
            alert_string = `${that.alias}|${act_id}::order not active, but still in the order map as follows, \n${alert_string}\n`;
        }

        // TODO::need revision
        let wierd_orders_1 = active_orders.filter(e => !that.cfg["entries"].includes([exchange, e.symbol, contract_type, e.interval, e.mark].join(".")));
        let wierd_orders_2 = active_orders.filter(e => that.cfg["entries"].includes([exchange, e.symbol, contract_type, e.interval, e.mark].join(".")) && (that.cfg[[exchange, e.symbol, contract_type, e.interval, e.mark].join(".")]["act_id"] !== act_id));

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

module.exports = RangeVolStrategy;

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

        strategy = new RangeVolStrategy("RangeVol", alias, new Intercom(intercom_config));
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