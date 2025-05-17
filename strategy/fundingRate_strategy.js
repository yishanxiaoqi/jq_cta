// 在每小时结束前两分钟获取所有symbol的实时资金费率，如果出现资金费率高于-0.015或者-0.02，则在
// 收取资金费率后的几分钟内做空，持仓时间最短1分钟，最长3min，如果持仓时间太长，波动性太大，可能
// 较大亏损（也可以试一试，但是一定要加止损。再强调一遍，仓位控制和止损是长久盈利的根本。你手动交易
// 亏损的主要原因就是没有仓位控制也没有止损，疯狂扛单加仓！）

require("../config/typedef.js");
const fs = require("fs");
const moment = require("moment");
const randomID = require("random-id");

const Intercom = require("../module/intercom.js");
const logger = require("../module/logger.js");
const request = require('../module/request.js');
const utils = require("../utils/util_func.js");
const stratutils = require("../utils/strat_util.js");
const StrategyBase = require("./strategy_base.js");
const schedule = require('node-schedule');

const LABELS = ["DN", "TP", "SP", "CV"];
// DN: 开仓单
// TP: 止盈单
// SP: 止损单
// CV: 平仓单

class FundingRateStrategy extends StrategyBase {
    constructor(name, alias, intercom) {
        super(name, alias, intercom);

        this.cfg = require(`../config/cfg_${alias}.json`);

        this.status_map  = {};
        this.order_map = {};

        // idf::exchange.symbol.contract_type
        this.prices = {};
        // set-up
        this.contract_type = CONTRACT_TYPE.PERP;
    }

    start() {
        let that = this;

        this._register_events();
        this.subscribe_market_data();

        this.load_fundingRate();
        schedule.scheduleJob('30 59 * * * *', function() {
            that.load_fundingRate();
        });

        setInterval(() => {
            fs.writeFile(`./config/status_map_${this.alias}.json`, JSON.stringify(this.status_map), function (err) {
                if (err) logger.info(`${this.alias}::err`);
            });
            fs.writeFile(`./config/order_map_${this.alias}.json`, JSON.stringify(this.order_map), function (err) {
                if (err) logger.info(`${this.alias}::err`);
            });
            that.refresh_ui();
        }, 1000 * 5);

        schedule.scheduleJob('30 1,5,58 * * * *', function() {
            that.query_active_orders();
            let ts = moment().format('YYYYMMDDHHmmssSSS'), month = moment().format('YYYY-MM');
            fs.writeFile(`./log/status_map_${that.alias}_${month}.log`, ts + ": " + JSON.stringify(that.status_map) + "\n", { flag: "a+" }, (err) => {
                if (err) logger.info(`${that.alias}::err`);
            });
            fs.writeFile(`./log/order_map_${that.alias}_${month}.log`, ts + ": " + JSON.stringify(that.order_map) + "\n", { flag: "a+" }, (err) => {
                if (err) logger.info(`${that.alias}::err`);
            });
        });
    }

    refresh_ui() {
        let that = this;
        let sendData = {
            "tableName": this.alias,
            "tabName": "PortfolioMonitor",
            "data": []
        }

        that.cfg["entries"].forEach((entry, index) => {
            // entry: ALPACAUSDT_1min_015
            let item = {};

            // 计算time_gap
            let symbol = entry.split("_")[0];
            let idf = ["BinanceU", symbol, "perp"].join(".");
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
            item[`${index + 1}|pos`] = that.status_map[entry]["pos"];
            item[`${index + 1}|fee`] = that.status_map[entry]["fee"];
            item[`${index + 1}|np`] = that.status_map[entry]["net_profit"];
            item[`${index + 1}|price`] = price_presentation;
            item[`${index + 1}|sp`] = that.status_map[entry]["stoploss_price"];
            item[`${index + 1}|rate`] = that.status_map[entry]["rate"];
            item[`${index + 1}|nextFundingTime`] = that.status_map[entry]["nextFundingTime"];
            sendData["data"].push(item);
        });

        this.intercom.emit("UI_update", sendData, INTERCOM_SCOPE.UI);
    }

    query_active_orders() {
        let that = this;
        let act_id = this.cfg["act_id"];
        that.query_orders({
            exchange: EXCHANGE.BINANCEU,
            contract_type: CONTRACT_TYPE.PERP,
            account_id: act_id,
        });
    }

    load_fundingRate() {
        let that = this;
        that.cfg["symbols"] = [];
        that.cfg["entries"] = [];
        that.status_map = {};

        let url = "https://fapi.binance.com/fapi/v1/premiumIndex?";
        logger.info(`Loading the fundingRate from ${url}`);
        request.get({
            url: url, json: true
        }, function (error, res, body) {
            that.cfg["rates"].forEach(rate => {
                let rate_str = rate.toFixed(3).slice(3, 6);
                let items = body.filter(e => parseFloat(e['lastFundingRate']) <= rate);
                items.forEach(item => {
                    let symbol = item.symbol;
                    let channels = [`BinanceU|${symbol}|perp|trade`, `BinanceU|${symbol}|perp|bestquote`];
                    that.cfg["symbols"].push(symbol);

                    // TODO: 不要一个一个订阅，会导致websocket过载，要一起订阅
                    for (let channel of channels) {
                        if (! SUBSCRIPTION_LIST.includes(channel)) {
                            that.subscribe_channel(channel);
                        }
                    }

                    that.cfg["mins"].forEach(n_min => {
                        let entry = `${item.symbol}_${n_min}_${rate_str}`;
                        that.cfg["entries"].push(entry);

                        that.status_map[entry] = {
                            "status": "EMPTY",
                            "pos": 0,
                            "rate": parseFloat(item["lastFundingRate"]),
                            "nextFundingTime": utils.get_human_readable_timestamp(item["nextFundingTime"]),
                            "enter": "",
                            "stoploss_price": "",
                            "fee": 0,
                            "quote_ccy": 0,
                            "net_profit": 0
                        };
                        that.order_map[entry] = {}
                    });

                    let idf = `BinanceU.${symbol}.perp`;
                    if ((PRICE_TICK_SIZE[idf] === undefined) || (QUANTITY_TICK_SIZE[idf] === undefined)) {
                        that.load_tick_size(idf);
                    }
                });
            });

            that.status_map["ready"] = true;
        });


        // 5秒后，如果status_map仍然是空的，则重新获取
        setTimeout(() => {
            if (that.status_map["ready"] === undefined) that.load_fundingRate();
        }, 5000);
    }

    load_tick_size(idf) {
        let [exchange, symbol, contract_type] = idf.split(".");
        let url = "https://fapi.binance.com/fapi/v1/exchangeInfo";
        request.get({
            url: url, json: true
        }, function (error, res, body) {
            let infos = body["symbols"].filter(e => e.symbol == symbol);
            if (infos.length === 1) {
                let info = infos[0];
                PRICE_TICK_SIZE[idf] = parseFloat(info["filters"].filter(e => e.filterType === "PRICE_FILTER")[0]["tickSize"]);
                QUANTITY_TICK_SIZE[idf] = parseFloat(info["filters"].filter(e => e.filterType === "LOT_SIZE")[0]["stepSize"]);
                that.slack_publish({
                    "type": "alert",
                    "msg": `FRA::${idf} tick size info updated!`
                });
            } else {
                that.slack_publish({
                    "type": "alert",
                    "msg": `FRA::${idf} tick size info not right::${infos}`
                });
            }
        });
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

        // 不是本策略的订单更新，自动过滤
        // that.alias + "DN" + min_str + rate_str + randomID(5):: FRADN1min015XXXXX
        if (client_order_id.slice(0, 3) !== that.alias) return;
        logger.info(`${that.alias}::on_order_update|${JSON.stringify(order_update)}`);

        let label = client_order_id.slice(3, 5);
        if (! LABELS.includes(label) ) {
            logger.info(`${that.alias}::on_order_update|unknown order label ${label}!`);
            return;
        }
        let min_str = client_order_id.slice(5, 9);
        let rate_str = client_order_id.slice(9, 12);
        let entry = [symbol, min_str, rate_str].join("_");
        let order_idf = [act_id, entry, direction, label, client_order_id].join("|");

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

            logger.info(`${that.alias}::on_order_update|${order_idf} ${order_type} order ${filled}/${original_amount} filled @${avg_executed_price}/${submit_price}!`);

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

            // 如果止盈单成交，则取消止损单；如果止损单成交，则取消止盈单
            let orders_to_be_cancelled = [];
            if ((label === "TP") && (that.order_map[entry]["SP"] !== undefined)) orders_to_be_cancelled.push(that.order_map[entry]["SP"]["client_order_id"]);
            if ((label === "SP") && (that.order_map[entry]["TP"] !== undefined)) orders_to_be_cancelled.push(that.order_map[entry]["TP"]["client_order_id"]);

            orders_to_be_cancelled.forEach((client_order_id) => {
                that.cancel_order({
                    exchange: exchange,
                    symbol: symbol,
                    contract_type: contract_type,
                    client_order_id: client_order_id,
                    account_id: act_id,
                });
            });

            if (order_status === ORDER_STATUS.FILLED) {
                // 订单完全成交，更新status_map
                that.status_map[entry]["status"] = that.order_map[entry][client_order_id]["target"];
                that.status_map[entry]["enter"] = avg_executed_price;

                // 订单完全成交，在order_map中删去该订单（注意：完全成交才删除，且当场删除！）
                delete that.order_map[entry][label];

                // remove the client_order_id from order_map 100ms later, as the on_response may need to use it!
                setTimeout(() => delete that.order_map[entry][client_order_id], 100);

            }

            // record the order filling details
            let ts = order_update["metadata"]["timestamp"];
            // 注意：这里添加了order_type
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

        if ((that.cfg["symbols"] === undefined) || (!that.cfg["symbols"].includes(symbol))) return;
        that.prices[idf] = { "price": price, "upd_ts": ts };

        let corr_entries = that.cfg["entries"].filter((entry) => entry.split("_")[0] === symbol);
        for (let entry of corr_entries) {
            that.main_execuation(entry, price, ts);
            that.status_map[entry]["net_profit"] = that.status_map[entry]["quote_ccy"] + that.status_map[entry]["pos"] * price - that.status_map[entry]["fee"];
            that.status_map[entry]["net_profit"] = stratutils.transform_with_tick_size(that.status_map[entry]["net_profit"], 0.01);
        }
    }

    _on_market_data_bestquote_ready(bestquote) {
        let that = this;

        let exchange = bestquote["exchange"];
        let symbol = bestquote["symbol"];
        let contract_type = bestquote["contract_type"];
        let ts = bestquote["metadata"][0][1];
        let best_bid = bestquote.metadata[0][4];

        if ((that.cfg["symbols"] === undefined) || (!that.cfg["symbols"].includes(symbol))) return;

        let corr_entries = that.cfg["entries"].filter((entry) => entry.split("_")[0] === symbol);
        for (let entry of corr_entries) {
            that.main_execuation(entry, best_bid, ts);
        }
    }

    main_execuation(entry, price, ts) {
        let that = this;
        let [symbol, min_str, rate_str] = entry.split("_");
        let idf = ["BinanceU", symbol, "perp"].join(".");
        let [exchange, _, contract_type] = idf.split(".");

        let n_min = parseInt(min_str.split("min")[0]);
        let ini_usdt = that.cfg["ini_usdt"][min_str];
        let act_id = that.cfg["act_id"];
        let stoploss_rate = that.cfg["stoploss_rate"];
        let tp_rate = that.cfg["tp_rate"][min_str];

        let orders_to_be_submitted = [];    // {client_order_id: "", label: "", target: "", quantity: "", price: "", direction: ""}
        let orders_to_be_cancelled = [];    // {client_order_id: "", label: "", target: "", quantity: "", price: "", direction: ""}

        if (that.status_map[entry]["status"] === "EMPTY") {
            let nextFundingTime = that.status_map[entry]['nextFundingTime'];
            let bar_otime = ts.slice(0, 10) + '0000000';
            // 还没有到收取资金费率的时间，或者当前时间已经超过收取资金费率时间50秒，不再开仓
            if ( (bar_otime !== nextFundingTime) || (moment(ts, "YYYYMMDDHHmmssSSS").diff(moment(nextFundingTime, "YYYYMMDDHHmmssSSS"), "seconds") > 50) ) return;
            // 已经开过仓了，不再开仓
            if (that.status_map[entry]["opened"] !== undefined ) return;

            // 设置仓位状态为TBA，避免不断发单开仓
            that.status_map[entry]["status"] = "TBA";
            that.status_map[entry]["opened"] = true;
            that.status_map[entry]["coverTime"] = moment(nextFundingTime, "YYYYMMDDHHmmssSSS").add(n_min, 'minutes').format("YYYYMMDDHHmmssSSS");
            let qty = stratutils.transform_with_tick_size(ini_usdt / price, QUANTITY_TICK_SIZE[idf]);
            let dn_client_order_id = that.alias + "DN" + min_str + rate_str + randomID(5);
            orders_to_be_submitted.push({ client_order_id: dn_client_order_id, label: "DN", target: "SHORT", quantity: qty, order_type: ORDER_TYPE.MARKET, price: price, direction: DIRECTION.SELL });
            
            let tp_client_order_id = that.alias + "TP" + min_str + rate_str + randomID(5);
            let tp_price = stratutils.transform_with_tick_size(price * (1 - tp_rate), PRICE_TICK_SIZE[idf]);
            orders_to_be_submitted.push({ client_order_id: tp_client_order_id, label: "TP", target: "EMPTY", quantity: qty, order_type: ORDER_TYPE.LIMIT, price: tp_price, direction: DIRECTION.BUY });
            
            let sp_client_order_id = that.alias + "SP" + min_str + rate_str + randomID(5);
            let sp_price = stratutils.transform_with_tick_size(price * (1 + stoploss_rate), PRICE_TICK_SIZE[idf]);
            orders_to_be_submitted.push({ client_order_id: sp_client_order_id, label: "SP", target: "EMPTY", quantity: qty, order_type: ORDER_TYPE.STOP_MARKET, stop_price: sp_price, direction: DIRECTION.BUY });

            that.slack_publish({
                "type": "alert",
                "msg": `${moment().format("HH:mm")}|${that.alias}::${entry} open the position!`
            });
            
        } else if (that.status_map[entry]["status"] === "SHORT") {
            let cover_time = that.status_map[entry]["coverTime"];
            // 当前时间还没到平仓时间，直接return 
            if ( parseInt(ts.slice(0, 12) + '00000') < parseInt(cover_time) ) return;
            that.status_map[entry]["status"] = "TBA";

            let qty = Math.abs(that.status_map[entry]["pos"]);
            let cv_client_order_id = that.alias + "CV" + min_str + rate_str + randomID(5);
            orders_to_be_submitted.push({ client_order_id: cv_client_order_id, label: "CV", target: "EMPTY", quantity: qty, order_type: ORDER_TYPE.MARKET, price: price, direction: DIRECTION.BUY });

            if (that.order_map[entry]["TP"] !== undefined) orders_to_be_cancelled.push(that.order_map[entry]["TP"]["client_order_id"]);
            if (that.order_map[entry]["SP"] !== undefined) orders_to_be_cancelled.push(that.order_map[entry]["SP"]["client_order_id"]);
        }

        orders_to_be_submitted.forEach((order) => {
            let client_order_id = order.client_order_id, label = order.label, target = order.target, quantity = order.quantity, order_type = order.order_type, price = order.price, stop_price = order.stop_price, direction = order.direction;

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
                stop_price: stop_price,     // 若为limit或者marketorder，则为undefined
                price: price,
                quantity: quantity,
                direction: direction,
                order_type: order_type,
                account_id: act_id,
                client_order_id: client_order_id
            });
        });

        orders_to_be_cancelled.forEach((client_order_id) => {
            that.cancel_order({
                exchange: exchange,
                symbol: symbol,
                contract_type: contract_type,
                client_order_id: client_order_id,
                account_id: act_id,
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

        let label = client_order_id.slice(3, 5);
        if (!LABELS.includes(label)) {
            logger.info(`${that.alias}::on_send_order_response|unknown order label ${label}!`);
            return;
        }
        let min_str = client_order_id.slice(5, 9);
        let rate_str = client_order_id.slice(9, 12);
        let entry = [symbol, min_str, rate_str].join("_");
        let idf = [exchange, symbol, contract_type].join(".");
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
                    let new_client_order_id = that.alias + label + min_str + rate_str + randomID(5);

                    // 注意：order_map里面的key只有ANTI_L, ANTI_S, UP, DN四种；
                    // 但是label有六种！
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

        let label = client_order_id.slice(3, 5);
        if ( !LABELS.includes(label) ) {
            logger.info(`${that.alias}::on_cancel_order_response|unknown order label ${label}!`);
            return;
        }

        let min_str = client_order_id.slice(5, 9);
        let rate_str = client_order_id.slice(9, 12);
        let entry = [symbol, min_str, rate_str].join("_");
        let idf = [exchange, symbol, contract_type].join(".");
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

        let alert_string = "";

        for (let entry of that.cfg["entries"]) {
            let symbol = idf.split(".")[1];
            let corr_active_orders = active_orders.filter(item => (item.symbol === symbol));
            let corr_active_client_order_ids = corr_active_orders.map(item => item.client_order_id);
            let string = corr_active_client_order_ids.join(",");

            let index = that.cfg["entries"].indexOf(idf);

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
                        alert_string += `${idf}: ${key}: ${JSON.stringify(that.order_map[entry][key])}\n`;
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
            logger.info(`${that.alias}:: order not active, but still in the order map as follows, \n${alert_string}`);
            that.slack_publish({
                "type": "alert",
                "msg": `${that.alias}:: order not active, but still in the order map as follows, \n${alert_string}`
            });
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
        let idf = [exchange, symbol, contract_type].join(".");

        let label = client_order_id.slice(3, 5);
        if (!LABELS.includes(label)) {
            logger.error(`${that.alias}::on_order_update|unknown order label ${label}!`);
            return;
        }

        if ((response["metadata"]["order_info"]["status"] === "unknown") && (response["metadata"]["metadata"]["error_code_msg"] === "Order does not exist.")) {
            if (client_order_id in that.order_map[entry]) {
                delete that.order_map[entry][client_order_id];
                that.slack_publish({
                    "type": "alert",
                    "msg": `${that.alias}::${idf}::After inspecting, delete ${client_order_id} from order map!`
                });
            }

            if ((label.slice(0, 6) in that.order_map[entry]) && (that.order_map[entry][label.slice(0, 6)]["client_order_id"] === client_order_id)) {
                delete that.order_map[entry][label.slice(0, 6)];
                that.slack_publish({
                    "type": "alert",
                    "msg": `${that.alias}::${idf}::After inspecting, delete ${label}|${client_order_id} from order map!`
                });
            }
        }
    }
}

module.exports = FundingRateStrategy;

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

        strategy = new FundingRateStrategy("FundingRate", alias, new Intercom(intercom_config));
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