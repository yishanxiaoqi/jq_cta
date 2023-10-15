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
const ExchangeBase = require("../exchange/exchange_base.js");

class SpreadArbitrageStrategy extends StrategyBase {
    constructor(name, alias, intercom) {
        super(name, alias, intercom);

        this.cfg = require(`../config/cfg_${alias}.json`);

        this.init_status_map();
        this.init_order_map();  // this will set order_map to be empty

        // idf::exchange.symbol.contract_type
        this.best_quotes = {};
        for (let idf of this.cfg["all_idfs"]) this.best_quotes[idf] = {};
    }

    start() {
        this._register_events();
        this.subscribe_market_data();

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
        }, 1000 * 60 * 5);

        setInterval(() => {
            // 每隔1小时将status_map做一个记录
            let ts = moment().format('YYYYMMDDHHmmssSSS'), month = moment().format('YYYY-MM');
            fs.writeFile(`./log/status_map_${this.alias}_${month}.log`, ts + ": " + JSON.stringify(this.status_map) + "\n", { flag: "a+" }, (err) => {
                if (err) logger.info(`${this.alias}::err`);
            });
        }, 1000 * 60 * 60);


        setInterval(() => {
            this.record_best_quote("regular");

            for (let idf of this.cfg["all_idfs"]) {
                if (this.cfg["idfs"].includes(idf)) this.main_execuation(idf);

                if (this.best_quotes[idf] === undefined) continue;
                let mid_price = (this.best_quotes[idf]["best_ask"] + this.best_quotes[idf]["best_bid"]) / 2;
                this.status_map[idf]["net_profit"] = this.status_map[idf]["quote_ccy"] + this.status_map[idf]["pos"] * mid_price - this.status_map[idf]["fee"];
                this.status_map[idf]["net_profit"] = stratutils.transform_with_tick_size(this.status_map[idf]["net_profit"], 0.01);
            }
        }, 1000 * 2);
    }

    record_best_quote(mark) {
        let ts = utils._util_get_human_readable_timestamp();
        let arr = [
            ts,
            this.best_quotes["BinanceU.CRVUSDT.perp"].best_ask,
            this.best_quotes["BinanceU.CRVUSDT.perp"].best_bid,
            this.best_quotes["OKX.CRVUSDT.perp"].best_ask,
            this.best_quotes["OKX.CRVUSDT.perp"].best_bid,
            mark
        ]        
        let output_string = arr.join(",") + "\n";
        fs.writeFile(`./log/best_quote_${this.alias}.csv`, output_string, { flag: "a+" }, (err) => {
            if (err) logger.info(`${this.alias}::${err}`);
        });
    }

    refresh_ui() {
        let that = this;
        let sendData = {
            "tableName": this.alias,
            "tabName": "PortfolioMonitor",
            "data": []
        }

        that.cfg["idfs"].forEach((idf, index) => {
            if (!(idf in that.status_map)) return;
            let anti_idf = that.cfg[idf]["anti_idf"];
            let item = {};
            let net_np = stratutils.transform_with_tick_size(that.status_map[idf]["net_profit"] + that.status_map[anti_idf]["net_profit"], 0.01);
            
            item[`${index + 1}|idf`] = idf;
            item[`${index + 1}|pos`] = that.status_map[idf]["pos"];
            item[`${index + 1}|fee`] = that.status_map[idf]["fee"];
            item[`${index + 1}|np`] = that.status_map[idf]["net_profit"];

            item[`${index + 1}|anti_idf`] = anti_idf;
            item[`${index + 1}|anti_pos`] = that.status_map[anti_idf]["pos"];
            item[`${index + 1}|anti_fee`] = that.status_map[anti_idf]["fee"];
            item[`${index + 1}|anti_np`] = that.status_map[anti_idf]["net_profit"];

            item[`${index + 1}|net_np`] = net_np;
            sendData["data"].push(item);
        });

        this.intercom.emit("UI_update", sendData, INTERCOM_SCOPE.UI);
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
        that.order_map = (!fs.existsSync(`./config/order_map_${that.alias}.json`)) ? {} : require(`../config/order_map_${that.alias}`);

        // TODO: how to differ from new_start and first initialization
        that.cfg["all_idfs"].forEach((idf) => {
            if (that.cfg["clear_existing_status"]) {
                that.order_map[idf] = {};
            } else {
                that.order_map[idf] = (that.order_map[idf]) ? that.order_map[idf] : {};
            }
        });
    }

    init_status_map() {
        let that = this;

        that.status_map = (!fs.existsSync(`./config/status_map_${that.alias}.json`)) ? {} : require(`../config/status_map_${that.alias}`);

        that.cfg["all_idfs"].forEach((idf) => {
            if ((that.status_map[idf] === undefined) || (that.cfg["clear_existing_status"])) {
                that.status_map[idf] = {
                    "cover_sent": false,
                    "pos": 0,
                    "fee": 0,
                    "quote_ccy": 0,
                    "net_profit": 0
                }
            }
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

        // 不是本策略的订单更新，自动过滤
        if (client_order_id.slice(0, 3) !== that.alias) return;
        // logger.info(`${that.alias}::on_order_update|${JSON.stringify(order_update)}`);

        let label = client_order_id.slice(3, 5);
        if (!["UP", "DN"].includes(label)) {
            logger.info(`${that.alias}::on_order_update|unknown order label ${label}!`);
            return;
        }
        let order_idf = [act_id, idf, direction, label, client_order_id].join("|");

        if (order_status === ORDER_STATUS.SUBMITTED) {

            let submit_price = order_update["order_info"]["submit_price"];
            let original_amount = order_update["order_info"]["original_amount"];
            logger.info(`${that.alias}::on_order_update|${order_idf}|${original_amount}@${submit_price} submitted!`);
        
        } else if (order_status === ORDER_STATUS.CANCELLED) {

            logger.info(`${that.alias}::on_order_update|${order_idf} order cancelled after ${update_type}!`);
            if (update_type === "cancelled") {
                // 订单已经撤销，100毫秒后从order_map中删除该订单（1分钟之后的原因是防止on_response还要用）
                // logger.info(`${that.alias}::on_order_update|${order_idf} order cancelled, will be removed from order_map in 200ms!`);
                setTimeout(() => delete that.order_map[idf][client_order_id], 100);
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
            // 检查一下status_map变化
            // logger.info(`${that.alias}|${symbol}::${JSON.stringify(that.status_map[idf])}`);
            // logger.info(`${that.alias}|${symbol}::${JSON.stringify(that.order_map[idf])}`);

            // 更新order_map
            that.order_map[idf][client_order_id]["filled"] = filled;

            // 更新cover_sent
            that.status_map[idf]["cover_sent"] = false;

            // 更新position
            that.status_map[idf]["pos"] += (direction === DIRECTION.BUY) ? new_filled : - new_filled;
            that.status_map[idf]["fee"] += fee;
            that.status_map[idf]["quote_ccy"] += (direction === DIRECTION.SELL) ? new_filled * avg_executed_price : - new_filled * avg_executed_price;

            that.status_map[idf]["pos"] = stratutils.transform_with_tick_size(that.status_map[idf]["pos"], QUANTITY_TICK_SIZE[idf]);
            that.status_map[idf]["fee"] = stratutils.transform_with_tick_size(that.status_map[idf]["fee"], 0.001);
            that.status_map[idf]["quote_ccy"] = stratutils.transform_with_tick_size(that.status_map[idf]["quote_ccy"], 0.01);

            if (order_status === ORDER_STATUS.FILLED) {
                // 订单完全成交，在order_map中删去该订单（注意：完全成交才删除，且当场删除！）
                that.order_map[idf][label] = undefined;

                // remove the client_order_id from order_map 100ms later, as the on_response may need to use it!
                setTimeout(() => delete that.order_map[idf][client_order_id], 100);

                // 这里是最关键的部分了，当向上突破或者向下突破时，才在OKX发市价单，发单的大小应该是净仓位
                // 如果盘口没有移动（两边都没有移动，单一移动也认为没有移动），则不需要再OKX发单
                // 那问题来了，如果盘口一直没移动，仓位一直超一个方向LONG累积，直到超过threshold，系统不再发DN order，只发UP order
                // let breakthrough = label === "DN" ? (that.best_quotes[idf]["best_bid"] < submit_price) : (that.best_quotes[idf]["best_ask"] > submit_price);
                // if (that.cfg["idfs"].includes(idf) && breakthrough) {
                //     // 在anti端发送Market Order，如果是这样的话，完全就是赚BN和OK之间的spread差，没办法转BN内的spread
                //     let anti_idf = that.cfg[idf]["anti_idf"];
                //     let anti_act_id = that.cfg[idf]["anti_act_id"];
                //     let [anti_exchange, anti_symbol, anti_contract_type] = anti_idf.split(".");
                //     let anti_client_order_id = that.alias + anti_label + randomID(7);

                //     let net_pos = stratutils.transform_with_tick_size(that.status_map[idf]["pos"] + that.status_map[anti_idf]["pos"], QUANTITY_TICK_SIZE[anti_idf]);
                //     if (net_pos !== 0) {
                //         // let anti_label = label === "DN" ? "UP" : "DN";
                //         // let anti_direction = label === "DN" ? DIRECTION.SELL : DIRECTION.BUY;
                //         let anti_label = net_pos > 0 ? "UP" : "DN";
                //         let anti_direction = net_pos > 0 ? DIRECTION.SELL : DIRECTION.BUY;
                //         let anti_q = Math.abs(net_pos);
    
                //         that.order_map[anti_idf][anti_label] = {label: anti_label, client_order_id: anti_client_order_id, price: 0, quantity: anti_q, time: moment.now()}
                //         that.order_map[anti_idf][anti_client_order_id] = {label: anti_label, price: 0, quantity: anti_q, filled: 0, time: moment.now()};
    
                //         that.send_order({
                //             label: anti_label,
                //             exchange: anti_exchange,
                //             symbol: anti_symbol,
                //             contract_type: anti_contract_type,
                //             quantity: anti_q,
                //             direction: anti_direction,
                //             order_type: ORDER_TYPE.MARKET,
                //             account_id: anti_act_id,
                //             client_order_id: anti_client_order_id
                //         });
                //     }
                // }

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

    _on_market_data_trade_ready(trade) {
    }

    _on_market_data_bestquote_ready(best_quote) {
        let that =  this;
        let exchange = best_quote["exchange"];
        let symbol = best_quote["symbol"];
        let contract_type = best_quote["contract_type"];

        let idf = [exchange, symbol, contract_type].join(".");
        if (!this.cfg["all_idfs"].includes(idf)) return;

        let pre_best_ask = this.best_quotes[idf]["best_ask"];
        let pre_best_bid = this.best_quotes[idf]["best_bid"];

        this.best_quotes[idf]["best_ask"] = best_quote.metadata[0][2];
        this.best_quotes[idf]["best_ask_q"] = best_quote.metadata[0][3];
        this.best_quotes[idf]["best_bid"] = best_quote.metadata[0][4];
        this.best_quotes[idf]["best_bid_q"] = best_quote.metadata[0][5];
        this.best_quotes[idf]["upd_ts"] = best_quote.metadata[0][1];

        if ((pre_best_ask === undefined) || (pre_best_bid === undefined)) return;

        if (! this.cfg["idfs"].includes(idf) ) return;
        let breakthrough = false;
        let message = `${that.alias}::`;
        if (pre_best_ask !== this.best_quotes[idf]["best_ask"]) {
            breakthrough = true;
            message += `Ask move from ${pre_best_ask} to ${this.best_quotes[idf]["best_ask"]}! `;
        }
        if (pre_best_bid !== this.best_quotes[idf]["best_bid"]) {
            breakthrough = true;
            message += `Bid move from ${pre_best_bid} to ${this.best_quotes[idf]["best_bid"]}! `;
        }

        // let breakthrough = ((pre_best_ask !== this.best_quotes[idf]["best_ask"]) || (pre_best_bid !== this.best_quotes[idf]["best_bid"]));

        if (breakthrough) {
            logger.info(message);
            this.record_best_quote("move");
            let anti_idf = that.cfg[idf]["anti_idf"];

            let net_pos = stratutils.transform_with_tick_size(that.status_map[idf]["pos"] + that.status_map[anti_idf]["pos"], QUANTITY_TICK_SIZE[anti_idf]);
            if ((net_pos !== 0) && (that.status_map[anti_idf]["cover_sent"] === false)) {
                let anti_act_id = that.cfg[idf]["anti_act_id"];
                let [anti_exchange, anti_symbol, anti_contract_type] = anti_idf.split(".");

                that.status_map[anti_idf]["cover_sent"] = true;
                // let anti_label = label === "DN" ? "UP" : "DN";
                // let anti_direction = label === "DN" ? DIRECTION.SELL : DIRECTION.BUY;
                let anti_label = net_pos > 0 ? "UP" : "DN";
                let anti_direction = net_pos > 0 ? DIRECTION.SELL : DIRECTION.BUY;
                let anti_q = Math.abs(net_pos);
                let anti_client_order_id = that.alias + anti_label + randomID(7);

                that.order_map[anti_idf][anti_label] = {label: anti_label, client_order_id: anti_client_order_id, price: 0, quantity: anti_q, time: moment.now()}
                that.order_map[anti_idf][anti_client_order_id] = {label: anti_label, price: 0, quantity: anti_q, filled: 0, time: moment.now()};

                // that.send_order({
                //     label: anti_label,
                //     exchange: anti_exchange,
                //     symbol: anti_symbol,
                //     contract_type: anti_contract_type,
                //     quantity: anti_q,
                //     direction: anti_direction,
                //     order_type: ORDER_TYPE.MARKET,
                //     account_id: anti_act_id,
                //     client_order_id: anti_client_order_id
                // });
            }
        }
    }


    main_execuation(idf) {
        let that = this;

        let [exchange, symbol, contract_type] = idf.split(".");
        let anti_idf = that.cfg[idf]["anti_idf"];
        let act_id = that.cfg[idf]["act_id"];

        let best_ask = that.best_quotes[idf]["best_ask"];
        let best_bid = that.best_quotes[idf]["best_bid"];
        let quantity_tick = Math.max(QUANTITY_TICK_SIZE[idf], QUANTITY_TICK_SIZE[anti_idf]);
        let fixed_q = stratutils.transform_with_tick_size(that.cfg[idf]["ini_usdt"] / best_ask, quantity_tick);

        let send_up = false;
        if (that.order_map[idf]["UP"] === undefined) {
            send_up = true;
        } else {
            let current_price = that.order_map[idf]["UP"]["price"];
            let current_quantity = that.order_map[idf]["UP"]["quantity"];
            let current_client_order_id = that.order_map[idf]["UP"]["client_order_id"];
            if ((current_price !== best_ask) || (current_quantity !== fixed_q)) {
                send_up = true;
                // that.cancel_order({
                //     exchange: exchange,
                //     symbol: symbol,
                //     contract_type: contract_type,
                //     client_order_id: current_client_order_id,
                //     account_id: act_id
                // });
            }
        }

        if (this.status_map[idf]["pos"] < - this.cfg[idf]["threshold"] / best_ask) send_up = false;

        if (send_up) {
            let up_client_order_id = that.alias + "UP" + randomID(7);
            that.order_map[idf]["UP"] = {label: "UP", client_order_id: up_client_order_id, price: best_ask, quantity: fixed_q, time: moment.now()}
            that.order_map[idf][up_client_order_id] = {label: "UP", price: best_ask, quantity: fixed_q, filled: 0, time: moment.now()};
            // that.send_order({
            //     label: "UP",
            //     exchange: exchange,
            //     symbol: symbol,
            //     contract_type: contract_type,
            //     price: best_ask,
            //     quantity: fixed_q,
            //     direction: DIRECTION.SELL,
            //     order_type: ORDER_TYPE.POST_ONLY,
            //     account_id: act_id,
            //     client_order_id: up_client_order_id
            // });
        }

        let send_dn = false;
        if (that.order_map[idf]["DN"] === undefined) {
            send_dn = true;
        } else {
            let current_price = that.order_map[idf]["DN"]["price"];
            let current_quantity = that.order_map[idf]["DN"]["quantity"];
            let current_client_order_id = that.order_map[idf]["DN"]["client_order_id"];
            if ((current_price !== best_bid) || (current_quantity !== fixed_q)) {
                send_dn = true;
                // that.cancel_order({
                //     exchange: exchange,
                //     symbol: symbol,
                //     contract_type: contract_type,
                //     client_order_id: current_client_order_id,
                //     account_id: act_id
                // });
            }
        }

        if (this.status_map[idf]["pos"] > this.cfg[idf]["threshold"] / best_bid) send_dn = false;

        if (send_dn) {
            let dn_client_order_id = that.alias + "DN" + randomID(7);
            that.order_map[idf]["DN"] = {label: "DN", client_order_id: dn_client_order_id, price: best_bid, quantity: fixed_q, time: moment.now()}
            that.order_map[idf][dn_client_order_id] = {label: "DN", price: best_bid, quantity: fixed_q, filled: 0, time: moment.now()};
            // that.send_order({
            //     label: "DN",
            //     exchange: exchange,
            //     symbol: symbol,
            //     contract_type: contract_type,
            //     price: best_bid,
            //     quantity: fixed_q,
            //     direction: DIRECTION.BUY,
            //     order_type: ORDER_TYPE.POST_ONLY,
            //     account_id: act_id,
            //     client_order_id: dn_client_order_id
            // });
        }
    }

    on_response(response) {
        // 过滤不属于本策略的response
        let ref_id = response["ref_id"];
        if (response.action !== REQUEST_ACTIONS.QUERY_ORDERS) {
            // logger.info(`${this.alias}::on_${response.action}_response| ${JSON.stringify(response)}`);
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

        let price = response["request"]["price"];
        let quantity = response["request"]["quantity"];
        let direction = response["request"]["direction"];
        let label = client_order_id.slice(3, 5);
        if (! ["UP", "DN"].includes(label)) {
            logger.info(`${that.alias}::on_send_order_response|unknown order label ${label}!`);
            return;
        }

        let idf = [exchange, symbol, contract_type].join(".");
        let order_idf = [act_id, idf, direction, label, client_order_id].join("|");

        if (response["metadata"]["metadata"]["result"] === false) {
            // 发单失败，1分钟后删除该订单信息
            setTimeout(() => delete that.order_map[idf][client_order_id], 1000 * 60);

            let error_code = response["metadata"]["metadata"]["error_code"];
            let error_code_msg = response["metadata"]["metadata"]["error_code_msg"];

            // 所有的发单报错都会发邮件！
            logger.debug(`${that.alias}::on_response|${order_idf}::an error occured during ${action}: ${error_code}: ${error_code_msg}`);
            that.slack_publish({
                "type": "alert",
                "msg": `${that.alias}::on_response|${order_idf}::an error occured during ${action}: ${error_code}: ${error_code_msg}`
            });

            // 重新发单
            if (exchange === EXCHANGE.BINANCEU) {
                // BinanceU上发Post-only Order
                let best_ask = that.best_quotes[idf]["best_ask"];
                let anti_idf = that.cfg[idf]["anti_idf"];
                let quantity_tick = Math.max(QUANTITY_TICK_SIZE[idf], QUANTITY_TICK_SIZE[anti_idf]);
                let fixed_q = stratutils.transform_with_tick_size(that.cfg[idf]["ini_usdt"] / best_ask, quantity_tick);
                
                let new_client_order_id = that.alias + label + randomID(7);
                let new_px = (label === "UP")? that.best_quotes[idf]["best_ask"]: that.best_quotes[idf]["best_bid"];
                let new_direction = (label === "UP")? DIRECTION.SELL: DIRECTION.BUY;
    
                that.order_map[idf][label] = {label: label, client_order_id: new_client_order_id, price: new_px, quantity: fixed_q, time: moment.now()}
                that.order_map[idf][new_client_order_id] = {label: label, price: new_px, quantity: fixed_q, filled: 0, time: moment.now()};
                // that.send_order({
                //     label: label,
                //     exchange: exchange,
                //     symbol: symbol,
                //     contract_type: contract_type,
                //     price: new_px,
                //     quantity: fixed_q,
                //     direction: new_direction,
                //     order_type: ORDER_TYPE.POST_ONLY,
                //     account_id: act_id,
                //     client_order_id: new_client_order_id
                // });
            } else {
                // OKX发Market Order，按照原来的Maket信息重发
                let new_client_order_id = that.alias + label + randomID(7);
                that.order_map[idf][label] = {label: label, client_order_id: new_client_order_id, price: 0, quantity: quantity, time: moment.now()}
                that.order_map[idf][new_client_order_id] = {label: label, price: 0, quantity: quantity, filled: 0, time: moment.now()};
                // that.send_order({
                //     label: label,
                //     exchange: exchange,
                //     symbol: symbol,
                //     contract_type: contract_type,
                //     quantity: quantity,
                //     direction: direction,
                //     order_type: ORDER_TYPE.MARKET,
                //     account_id: act_id,
                //     client_order_id: new_client_order_id
                // });
            }
        } else {
            // 订单发送成功
            logger.info(`${this.alias}::on_response|${order_idf}|${quantity}@${price} submitted!`);
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

        let label = client_order_id.slice(3, 5);
        if (!["UP", "DN"].includes(label)) {
            logger.info(`${that.alias}::on_cancel_order_response|unknown order label ${label}!`);
            return;
        }

        let idf = [exchange, symbol, contract_type].join(".");
        let order_idf = [act_id, idf, label, client_order_id].join("|");

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
                recancel = true, timeout = 1000;
            } else if (error_code_msg.slice(0, 48) === 'Unexpected error happened: {"name":"SyntaxError"') {
                // 1秒后重新撤单
                recancel = true, timeout = 1000;
            } else if (error_code_msg.slice(0, 36) === 'RequestError: Error: read ECONNRESET') {
                // 1秒后重新撤单
                recancel = true, timeout = 1000;
            } else if (error_code_msg === ERROR_MSG.CANCEL_ORDER_FAIL) {
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
    }
}

module.exports = SpreadArbitrageStrategy;

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

        strategy = new SpreadArbitrageStrategy("SpreadArbitrage", alias, new Intercom(intercom_config));
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