// 通过span发更多的单来增加成交概率
// 通过cover order和stop market order来减小大趋势下的损失
require("../../config/typedef.js");
const fs = require("fs");
const moment = require("moment");
const assert = require("assert");
const randomID = require("random-id");

const Intercom = require("../../module/intercom.js");
const logger = require("../../module/logger.js");
const request = require('../../module/request.js');
const utils = require("../../utils/util_func.js");
const stratutils = require("../../utils/strat_util.js");
const StrategyBase = require("../strategy_base.js");

class RevTrendXESStrategy extends StrategyBase {
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
        this.best_quotes = {};
        for (let idf of this.cfg["idfs"]) this.best_quotes[idf] = {};

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
            // 每隔5分钟查询一下active orders
            this.query_active_orders();
        }, 1000 * 30 * 1);

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
            item[`${index + 1}|entry`] = entry;
            item[`${index + 1}|status`] = that.status_map[entry]["status"];
            item[`${index + 1}|triggered`] = that.status_map[entry]["triggered"];
            item[`${index + 1}|pos`] = that.status_map[entry]["pos"];
            item[`${index + 1}|fee`] = that.status_map[entry]["fee"];
            item[`${index + 1}|np`] = that.status_map[entry]["net_profit"];
            item[`${index + 1}|price`] = (that.prices[idf]) ? that.prices[idf]["price"] : "";
            // item[`${index + 1}|sp`] = that.status_map[entry]["stoploss_price"];
            // item[`${index + 1}|up`] = that.status_map[entry]["u0"];
            // item[`${index + 1}|dn`] = that.status_map[entry]["d0"];
            sendData["data"].push(item);
        });

        this.intercom.emit("UI_update", sendData, INTERCOM_SCOPE.UI);
    }

    query_active_orders() {
        this.query_orders({
            exchange: EXCHANGE.BINANCEU,
            contract_type: CONTRACT_TYPE.PERP,
            account_id: "th_binance_cny_sub02"
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
                    "pos": 0,
                    "fee": 0,
                    "quote_ccy": 0,
                    "net_profit": 0
                }
            }
        });
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

        // XES + 30m + 020 + u0 + VEsIXXF
        let idf = [exchange, symbol, contract_type].join(".");
        let interval = (client_order_id.slice(3, 4) === "0") ? client_order_id.slice(4, 6) : client_order_id.slice(3, 6);
        let track_ATR_multiplier_str = client_order_id.slice(6, 9);
        let entry = [exchange, symbol, contract_type, interval, track_ATR_multiplier_str].join(".");

        // 不是本策略的订单更新，自动过滤
        if (client_order_id.slice(0, 3) !== that.alias) return;
        logger.info(`${that.alias}|${client_order_id}::on_order_update|${JSON.stringify(order_update)}!`);

        let label = that.order_map[entry][client_order_id] ? that.order_map[entry][client_order_id]["label"] : undefined;
        let order_idf = [act_id, entry, label, client_order_id].join("|");

        if (order_status === ORDER_STATUS.SUBMITTED) {

            let submit_price = order_update["order_info"]["submit_price"];
            let original_amount = order_update["order_info"]["original_amount"];
            logger.info(`${that.alias}::on_order_update|${order_idf} order ${original_amount} placed @${submit_price} after ${update_type}!`);

        } else if (order_status === ORDER_STATUS.CANCELLED) {

            logger.info(`${that.alias}::on_order_update|${order_idf} order cancelled after ${update_type}!`);
            if (update_type === "cancelled") {
                // 订单已经撤销，100毫秒后从order_map中删除该订单（1分钟之后的原因是防止on_response还要用）
                logger.info(`${that.alias}::on_order_update|${order_idf} order cancelled, will be removed from order_map in 200ms!`);
                setTimeout(() => delete that.order_map[entry][client_order_id], 1000);
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

            // 更新order_map
            if (that.order_map[entry][client_order_id]) that.order_map[entry][client_order_id]["filled"] = filled;

            // 更新position
            // let pre_pos = that.status_map[entry]["pos"];
            that.status_map[entry]["pos"] += (direction === DIRECTION.BUY) ? new_filled : - new_filled;
            that.status_map[entry]["fee"] += fee;
            that.status_map[entry]["quote_ccy"] += (direction === DIRECTION.SELL) ? new_filled * avg_executed_price : - new_filled * avg_executed_price;

            that.status_map[entry]["pos"] = stratutils.transform_with_tick_size(that.status_map[entry]["pos"], QUANTITY_TICK_SIZE[idf]);
            that.status_map[entry]["fee"] = stratutils.transform_with_tick_size(that.status_map[entry]["fee"], 0.001);
            that.status_map[entry]["quote_ccy"] = stratutils.transform_with_tick_size(that.status_map[entry]["quote_ccy"], 0.01);

            // 重新开始
            // let current_pos = that.status_map[entry]["pos"];
            // if ((Math.abs(pre_pos) >= min_q) && (Math.abs(current_pos) < min_q)) that.pre_bar_otime[entry] = undefined;

            // 检查一下status_map变化
            logger.info(`${that.alias}|${entry}::${JSON.stringify(that.status_map[entry])}`);
            logger.info(`${that.alias}|${entry}::${JSON.stringify(that.order_map[entry])}`);

            // record the order filling details
            let ts = order_update["metadata"]["timestamp"];
            let filled_info = [act_id, entry, exchange, symbol, contract_type, interval, client_order_id, original_amount, filled, submit_price, avg_executed_price, fee].join(",");
            let order_info = (that.order_map[entry][client_order_id] === undefined) ? ",,,," : Object.entries(that.order_map[entry][client_order_id]).filter((element) => element[0] !== "ToBeDeleted").map((element) => element[1]).join(",");
            let output_string = [ts, filled_info, order_info].join(",");
            output_string += (order_status === ORDER_STATUS.FILLED) ? ",filled\n" : ",partially_filled\n";
            fs.writeFile(`./log/order_filling_${this.alias}.csv`, output_string, { flag: "a+" }, (err) => {
                if (err) logger.info(`${this.alias}::${err}`);
            });

            if ((order_status === ORDER_STATUS.FILLED) && (that.order_map[entry][client_order_id])) delete that.order_map[entry][client_order_id];
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
            
            that.main_execuation(entry);
        }
    }

    _on_market_data_bestquote_ready(best_quote) {
        let exchange = best_quote["exchange"];
        let symbol = best_quote["symbol"];
        let contract_type = best_quote["contract_type"];

        let idf = [exchange, symbol, contract_type].join(".");
        if (!this.cfg["idfs"].includes(idf)) return;

        this.best_quotes[idf]["best_ask"] = best_quote.metadata[0][2];
        this.best_quotes[idf]["best_ask_q"] = best_quote.metadata[0][3];
        this.best_quotes[idf]["best_bid"] = best_quote.metadata[0][4];
        this.best_quotes[idf]["best_bid_q"] = best_quote.metadata[0][5];
        this.best_quotes[idf]["upd_ts"] = best_quote.metadata[0][1];
    }

    main_execuation(entry) {
        let that = this;
        let [exchange, symbol, contract_type, interval, track_ATR_multiplier_str] = entry.split(".");
        let idf = [exchange, symbol, contract_type].join(".");
        // let price = that.prices[idf]["price"];
        // let ini_usdt = (that.cfg[entry]["ini_usdt"]) ? that.cfg[entry]["ini_usdt"] : that.cfg["ini_usdt"];
        let act_id = that.cfg[entry]["act_id"];

        let fix_q = that.cfg[entry]["fix_q"];
        let min_q = that.cfg[entry]["min_q"];
        let span = that.cfg[entry]["span"];
        let track_ATR_multiplier = that.cfg[entry]["track_ATR_multiplier"];

        // cal indicators -----------------------------------------------
        let track_ATR = Math.max(...Object.values(that.klines[entry]["high"]).slice(1)) - Math.min(...Object.values(that.klines[entry]["low"]).slice(1));
        let up = that.klines[entry]["open"][0] + track_ATR * track_ATR_multiplier;
        let dn = that.klines[entry]["open"][0] - track_ATR * track_ATR_multiplier;

        if (that.best_quotes[idf] === undefined) return;
        let best_ask = that.best_quotes[idf]["best_ask"];
        let best_bid = that.best_quotes[idf]["best_bid"];

        let up_price = stratutils.transform_with_tick_size(Math.max(up, best_ask), PRICE_TICK_SIZE[idf]);
        let dn_price = stratutils.transform_with_tick_size(Math.min(dn, best_bid), PRICE_TICK_SIZE[idf]);

        if (isNaN(up_price) || (isNaN(dn_price))) return;

        let updn_prices = [];
        let orders_to_be_cancelled = [];    // client_order_id only
        let orders_to_be_submitted = [];    // {label: "", tgt_qty: "", price: "", direction: ""}

        for (let i = 0; i < span; i++) {
            let ui_p = stratutils.transform_with_tick_size(up_price + i * PRICE_TICK_SIZE[idf], PRICE_TICK_SIZE[idf]);
            let di_p = stratutils.transform_with_tick_size(dn_price - i * PRICE_TICK_SIZE[idf], PRICE_TICK_SIZE[idf]);
            that.status_map[entry][`u${i}`] = ui_p;
            that.status_map[entry][`d${i}`] = di_p;

            updn_prices.push(ui_p);
            updn_prices.push(di_p);

            // 更新UP Orders的标签
            let ui_client_order_ids = utils._util_get_key_by_value_l2(that.order_map[entry], ui_p, "price");
            for (let ui_client_order_id of ui_client_order_ids) that.order_map[entry][ui_client_order_id]["label"] = `u${i}`;
            let [up_sum_q, up_sum_filled] = that.calculate_sum_q_by_label(entry, ui_client_order_ids);

            // 更新DN Orders的标签
            let di_client_order_ids = utils._util_get_key_by_value_l2(that.order_map[entry], di_p, "price");
            for (let di_client_order_id of di_client_order_ids) that.order_map[entry][di_client_order_id]["label"] = `d${i}`;
            let [dn_sum_q, dn_sum_filled] = that.calculate_sum_q_by_label(entry, di_client_order_ids);

            if (Math.abs(that.status_map[entry]["pos"]) < min_q) {
                let up_gap_q = fix_q - (up_sum_q - up_sum_filled);
                up_gap_q  = stratutils.transform_with_tick_size(up_gap_q, QUANTITY_TICK_SIZE[idf]);

                if (up_gap_q >= min_q) {
                    let ui_p = that.status_map[entry][`u${i}`];
                    let client_order_id = that.alias + interval.padStart(3, '0') + track_ATR_multiplier_str + `u${i}` + randomID(7);
                    orders_to_be_submitted.push({ client_order_id: client_order_id, label: `u${i}`, quantity: up_gap_q, price: ui_p, direction: DIRECTION.SELL });
                }

                let dn_gap_q = fix_q - (dn_sum_q - dn_sum_filled);
                dn_gap_q  = stratutils.transform_with_tick_size(dn_gap_q, QUANTITY_TICK_SIZE[idf]);

                if (dn_gap_q >= min_q) {
                    let di_p = that.status_map[entry][`d${i}`];
                    let client_order_id = that.alias + interval.padStart(3, '0') + track_ATR_multiplier_str + `d${i}` + randomID(7);
                    orders_to_be_submitted.push({ client_order_id: client_order_id, label: `d${i}`, quantity: dn_gap_q, price: di_p, direction: DIRECTION.BUY });
                }

            } else if (that.status_map[entry]["pos"] >= min_q) { 

                if (di_p === best_bid) {
                    for (let di_client_order_id of di_client_order_ids) {
                        if (that.order_map[entry][di_client_order_id]["cancelling"] !== true) {
                            if ((i === 0) && (that.status_map[entry]["pos"] < fix_q)) continue;
                            orders_to_be_cancelled.push(di_client_order_id);
                            that.order_map[entry][di_client_order_id]["cancelling"] = true;
                        }
                    }
                } else if (di_p < best_bid - PRICE_TICK_SIZE[idf] * 3) {
                    // 离盘口足够远才补单，否则一个大单救击穿了
                    let dn_gap_q = fix_q - (dn_sum_q - dn_sum_filled);
                    dn_gap_q  = stratutils.transform_with_tick_size(dn_gap_q, QUANTITY_TICK_SIZE[idf]);
    
                    if (dn_gap_q >= min_q) {
                        let client_order_id = that.alias + interval.padStart(3, '0') + track_ATR_multiplier_str + `d${i}` + randomID(7);
                        orders_to_be_submitted.push({ client_order_id: client_order_id, label: `d${i}`, quantity: dn_gap_q, price: di_p, direction: DIRECTION.BUY });
                    }
                }

                let up_gap_q = (i === 0) ? that.status_map[entry]["pos"] + fix_q - (up_sum_q - up_sum_filled): fix_q - (up_sum_q - up_sum_filled);
                up_gap_q  = stratutils.transform_with_tick_size(up_gap_q, QUANTITY_TICK_SIZE[idf]);

                if (up_gap_q >= min_q) {
                    let client_order_id = that.alias + interval.padStart(3, '0') + track_ATR_multiplier_str + `u${i}` + randomID(7);
                    orders_to_be_submitted.push({ client_order_id: client_order_id, label: `u${i}`, quantity: up_gap_q, price: ui_p, direction: DIRECTION.SELL });
                }

            } else if (that.status_map[entry]["pos"] <= - min_q) {

                if (ui_p === best_ask) {
                    for (let ui_client_order_id of ui_client_order_ids) {
                        if (that.order_map[entry][ui_client_order_id]["cancelling"] !== true) {
                            if ((i === 0) && (that.status_map[entry]["pos"] > - fix_q)) continue;  // 防止部分成交的单被撤销
                            orders_to_be_cancelled.push(ui_client_order_id);
                            that.order_map[entry][ui_client_order_id]["cancelling"] = true;
                        }
                    }
                } else if (ui_p > best_ask + PRICE_TICK_SIZE[idf] * 3) {
                    // 离盘口足够远才补单，否则一个大单救击穿了
                    let up_gap_q = fix_q - (up_sum_q - up_sum_filled);
                    up_gap_q  = stratutils.transform_with_tick_size(up_gap_q, QUANTITY_TICK_SIZE[idf]);
    
                    if (up_gap_q >= min_q) {
                        let client_order_id = that.alias + interval.padStart(3, '0') + track_ATR_multiplier_str + `u${i}` + randomID(7);
                        orders_to_be_submitted.push({ client_order_id: client_order_id, label: `u${i}`, quantity: up_gap_q, price: ui_p, direction: DIRECTION.SELL });
                    }
                }

                let dn_gap_q = (i === 0) ? - that.status_map[entry]["pos"] + fix_q - (dn_sum_q - dn_sum_filled): fix_q - (dn_sum_q - dn_sum_filled);
                dn_gap_q  = stratutils.transform_with_tick_size(dn_gap_q, QUANTITY_TICK_SIZE[idf]);

                if (dn_gap_q >= min_q) {
                    let client_order_id = that.alias + interval.padStart(3, '0') + track_ATR_multiplier_str + `d${i}` + randomID(7);
                    orders_to_be_submitted.push({ client_order_id: client_order_id, label: `d${i}`, quantity: dn_gap_q, price: di_p, direction: DIRECTION.BUY });
                }
            }
        }

        let out_orders = Object.keys(that.order_map[entry]).filter(key => !updn_prices.includes(that.order_map[entry][key]["price"])).filter(key => that.order_map[entry][key]["cancelling"] != true);
        for (let client_order_id of out_orders) {
            orders_to_be_cancelled.push(client_order_id);
            that.order_map[entry][client_order_id]["cancelling"] = true;
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
            let client_order_id = order.client_order_id, label = order.label, quantity = order.quantity, price = order.price, direction = order.direction;

            // 发送订单，同时建立order_map
            // {"3106609167": {"label": "DN", "quantity": 21133, "time": 1669492800445, "price": 0.04732, "filled": 0}}
            that.order_map[entry][client_order_id] = { label: label, quantity: quantity, price: price, time: moment.now(), filled: 0 };

            that.send_order({
                label: label,
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

    calculate_sum_q_by_label(entry, client_order_ids) {
        if (this.order_map[entry] === undefined) return ([0, 0]);
        let sum_quantity = client_order_ids.map(client_order_id => this.order_map[entry][client_order_id]["quantity"]).reduce((a, b) => a + b, 0);
        let sum_filled = client_order_ids.map(client_order_id => this.order_map[entry][client_order_id]["filled"]).reduce((a, b) => a + b, 0);
        return ([sum_quantity, sum_filled]);
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
        let quantity = response["request"]["quantity"];
        let direction = response["request"]["direction"];
        let price = response["request"]["price"];

        let interval = (client_order_id.slice(3, 4) === "0") ? client_order_id.slice(4, 6) : client_order_id.slice(3, 6);
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
                    let new_client_order_id = that.alias + interval.padStart(3, '0') + track_ATR_multiplier_str + label + randomID(7);

                    that.order_map[entry][new_client_order_id] = { label: label, quantity: quantity, price: price, time: moment.now(), filled: 0 };

                    that.send_order({
                        retry: retry,
                        label: label,
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

        let idf = [exchange, symbol, contract_type].join(".");
        let interval = (client_order_id.slice(3, 4) === "0") ? client_order_id.slice(4, 6) : client_order_id.slice(3, 6);
        let track_ATR_multiplier_str = client_order_id.slice(6, 9);
        let entry = [exchange, symbol, contract_type, interval, track_ATR_multiplier_str].join(".");
        let label = (that.order_map[entry][client_order_id]) ? that.order_map[entry][client_order_id]["label"] : undefined;
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
        let active_orders = orders.filter(item => item["client_order_id"].slice(0, 3) === that.alias);
        let active_client_order_ids = active_orders.map(item => item["client_order_id"]);

        for (let entry of that.cfg["entries"]) {

            // 对于order_map已经不active的order，要及时检查并删除
            for (let client_order_id of Object.keys(that.order_map[entry]).filter(e => ! active_client_order_ids.includes(e))) {
                if (that.order_map[entry][client_order_id]["ToBeDeleted"] === true) {
                    delete that.order_map[entry][client_order_id];
                } else {
                    that.order_map[entry][client_order_id]["ToBeDeleted"] = true;
                }
            }

            let {span} = that.cfg[entry];
            let interval = entry.split(".")[3];
            let corr_active_orders = active_orders.filter(item => item["client_order_id"].slice(3, 6) === interval.padStart(3, '0'));

            // console.log(JSON.stringify(corr_active_orders));

            let item = {};
            let index = that.cfg["entries"].indexOf(entry);
            for (let i = 0; i < span; i ++) {
                let ui_p = that.status_map[entry][`u${i}`];
                let di_p = that.status_map[entry][`d${i}`];

                let ui_client_order_ids = utils._util_get_key_by_value_l2(that.order_map[entry], `u${i}`, "label");
                let up_sum_q = corr_active_orders.filter(item => ui_client_order_ids.includes(item["client_order_id"])).map(item => item["original_amount"]).reduce((a, b) => a + b, 0);
                let up_sum_filled = corr_active_orders.filter(item => ui_client_order_ids.includes(item["client_order_id"])).map(item => item["filled"]).reduce((a, b) => a + b, 0);

                let di_client_order_ids = utils._util_get_key_by_value_l2(that.order_map[entry], `d${i}`, "label");
                let dn_sum_q = corr_active_orders.filter(item => di_client_order_ids.includes(item["client_order_id"])).map(item => item["original_amount"]).reduce((a, b) => a + b, 0);
                let dn_sum_filled = corr_active_orders.filter(item => di_client_order_ids.includes(item["client_order_id"])).map(item => item["filled"]).reduce((a, b) => a + b, 0);
                
                item[`${index + 1}|layer${i}`] = `${up_sum_filled}|${up_sum_q}@${ui_p}, ${dn_sum_filled}|${dn_sum_q}@${di_p}`
            }
            
            let sendData = {
                "tableName": this.alias,
                "tabName": "PortfolioMonitor",
                "data": []
            }
            sendData["data"].push(item);
            this.intercom.emit("UI_update", sendData, INTERCOM_SCOPE.UI);
        }
    }
}

module.exports = RevTrendXESStrategy;

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

        strategy = new RevTrendXESStrategy("RevTrendXES", alias, new Intercom(intercom_config));
        strategy.start();
    }
});

// process.on('SIGINT', async () => {
//     logger.info(`${strategy.alias}::SIGINT`);
//     /* Note: Just work under pm2 environment */
//     // strategy._test_cancel_order(strategy.test_order_id);
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