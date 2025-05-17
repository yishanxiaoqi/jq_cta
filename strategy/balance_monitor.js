require("../config/typedef.js");
const fs = require('fs');
const moment = require("moment");
const csv = require('csv-parser');
const disk = require('diskusage');

const request = require('../module/request.js');
const Intercom = require("../module/intercom");
const StrategyBase = require("./strategy_base.js");
const utils = require("../utils/util_func");
const stratutils = require("../utils/strat_util.js");
const schedule = require('node-schedule');

class BalanceMonitor extends StrategyBase {
    constructor(name, alias, intercom) {
        super(name, alias, intercom);

        // 需要自行修改 ========
        // this.accounts = [
        //     "BinanceU.th_binance_cny_master.perp",
        //     "BinanceU.th_binance_cny_sub01.perp",
        //     "BinanceU.th_binance_cny_sub02.perp",
        //     "BinanceU.th_binance_cny_sub03.perp"
        // ];
        // accounts不包括CTA，因为CTA是两个或多个account的组合
        this.accounts = [
            // "Binance.th_binance_cny_master.spot",
            "BinanceU.th_binance_cny_master.perp",
            "BinanceU.th_binance_cny_sub01.perp",
            "BinanceU.th_binance_cny_sub02.perp"
        ];
        this.init_equity = {
            "BinanceU.th_binance_cny_master.perp": 131926.51,
            "BinanceU.th_binance_cny_sub01.perp": 51925.76,
            "BinanceU.th_binance_cny_sub02.perp": 3636.55,
            "BinanceU.th_binance_cny_sub03.perp": 0,
            "CTA": 183852.3
        };
        this.denominator = {
            "BinanceU.th_binance_cny_master.perp": 106226.80,   
            "BinanceU.th_binance_cny_sub01.perp": 51925.76,
            "BinanceU.th_binance_cny_sub02.perp": 2069.74,
            "BinanceU.th_binance_cny_sub03.perp": 0,
            "CTA": 131090.70
        };
        this.init_dates = {
            "BinanceU.th_binance_cny_master.perp": moment("2023-06-23"),
            "BinanceU.th_binance_cny_sub01.perp": moment("2024-12-27"),
            // "BinanceU.th_binance_cny_sub02.perp": moment("2023-10-24"),
            "BinanceU.th_binance_cny_sub02.perp": moment("2024-01-13"),
            "BinanceU.th_binance_cny_sub03.perp": moment("2023-10-27"),
            "CTA": moment("2023-06-23")
        };
        this.aliases = ["R01", "R06", "R12", "R24", "STR", "SRE"];
        this.rev_aliases = ["R01", "R06", "R12", "R24"];
        // cta如今包含了两个账户：BinanceU.th_binance_cny_master.perp和BinanceU.th_binance_cny_sub01.perp
        this.cta_accounts = ["BinanceU.th_binance_cny_master.perp", "BinanceU.th_binance_cny_sub01.perp"];
        this.cta_positions = {};

        // 初始化各个账户的结单，尤其是CTA
        this.account_summary = {};
        for (let account of ["CTA"].concat(this.accounts)) {
            this.account_summary[account] = {
                "init_equity": this.init_equity[account],
                "denominator": this.denominator[account],
                "init_date": this.init_dates[account],
            };
        }

        // 初始化各个订阅频道的更新时间
        this.subscription_list = SUBSCRIPTION_LIST;
        this.latest_prices = {};
        this.sub_streams_upd_ts = {};
        for (let subscription of this.subscription_list) {
            this.sub_streams_upd_ts[subscription] = moment.now();
        }

        // 更新futures交易所上交易的交易对
        this.symbols_on_track = {};
    }

    start() {
        let that = this;
        this._register_events();

        setInterval(() => { 
            for (let account of this.accounts) {
                let [exchange, account_id, contract_type] = account.split(".");
                this.query_account({
                    exchange: exchange,
                    contract_type: contract_type,
                    account_id: account_id
                }) 
            }
            this.update_cta_account_summary_to_ui();
        }, 1000 * 60 * 0.5);
        
        // 20250109: 各个策略的仓位和盈利情况不再推送，反正也不会看
        // setInterval(() => { 
        //     this.update_status_map_to_slack();
        //     // 设置为5秒后发送账户总结
        //     setTimeout(() => {
        //         this.update_account_summary_to_slack();
        //     }, 1000 * 5);
        // }, 1000 * 60 * 5);
        setInterval(() => { 
            // 每个5分钟推送账号截单到slack
            this.update_account_summary_to_slack();
        }, 1000 * 60 * 5);

        setInterval(() => { 
            // 每隔1分钟查询一下active orders，并推送到各个策略
            this.query_active_orders();
        }, 1000 * 60);

        schedule.scheduleJob('0 0/30 * * * *', function() {
            // 记录净值
            for (let account of ["CTA"].concat(that.accounts)) {
                let account_id = (account === "CTA") ? account : account.split(".")[1];
                if (that.account_summary[account]["equity"] === undefined) return;
                let ts = moment().format('YYYYMMDDHHmmssSSS');
                let {equity, nv, leverage} = that.account_summary[account];
                let record_string = [ts, account_id, that.init_equity[account], equity, that.denominator[account], nv, leverage].join(",") + "\n";
                fs.writeFile("./log/account_summary.csv", record_string, { flag: "a+" }, (err) => {
                    if (err) logger.info(`${that.alias}:: fs write file error!`);
                });
            }

            // 查看上架的交易对，如果有上新，推送到slack
            that.check_symbols_on_track();
        });
    }

    query_active_orders() {
        let that = this;
        for (let account of that.accounts) {
            let [exchange, account_id, contract_type] = account.split(".");
            that.query_orders({
                exchange: exchange,
                contract_type: contract_type,
                account_id: account_id,
            });
        }
    }

    check_symbols_on_track() {
        let that = this;
        let url = "https://fapi.binance.com/fapi/v1/exchangeInfo";
        request.get({
            url: url, json: true
        }, function (error, res, body) {
            let newest_symbols_on_track = {};
            body["symbols"].forEach(({symbol, onboardDate}) => {newest_symbols_on_track[symbol] = new Date(onboardDate)});
            
            let new_symbols = Object.keys(newest_symbols_on_track).filter(e => !(e in that.symbols_on_track));
            that.symbols_on_track = {...newest_symbols_on_track};    // 创建一个新的instance，而非引用
            if (new_symbols.length > 50) return;

            let txt = "";
            for (let symbol of new_symbols) {
                txt += `${symbol} will be on board on ${newest_symbols_on_track[symbol]}!\n`
            }
            if (txt !== "") that.slack_publish({"type": "alert", "msg": txt});
        });
    }

    update_status_map_to_slack() {
        let text = "";
        let add_items;

        for (let alias of this.aliases) {

            let status_map = JSON.parse(fs.readFileSync(`./config/status_map_${alias}.json`, 'utf8'));
            let cfg = JSON.parse(fs.readFileSync(`./config/cfg_${alias}.json`, 'utf8'));
            let loop_entries;

            // 需要修改！！！
            // 需要怎么修改？以后一定要规范写注释！
            if (["SRE", "XEM"].includes(alias)) { 
                loop_entries = cfg["entries"];
                add_items = ["status", "triggered", "net_profit"]; 
                text += `========${alias}========\nentry\tstatus\tfee\tnp\n`;
            } else if (["STR"].includes(alias)) {
                loop_entries = cfg["entries"];
                add_items = ["status", "net_profit"]; 
                text += `========${alias}========\nentry\tstatus\tnp\n`;
            } else if (["XES", "MMS"].includes(alias)) {
                loop_entries = cfg["entries"];
                add_items = ["net_profit"]; 
                text += `========${alias}========\nentry\tnp\n`;
            } else {
                loop_entries = cfg["idfs"];
                add_items = ["status", "triggered", "net_profit"];
                text += `========${alias}========\nidf\tstatus\ttriggered\tnp\n`;
            }

            for (let idf of loop_entries) {
                text += `${idf}\t`;
                for (let item of add_items) {
                    if (item === "net_profit") {
                        text += `=${status_map[idf][item]}=\t`;
                    } else {
                        text += `${status_map[idf][item]}\t`;
                    }
                }
                text += "\n";
            }
        }

        this.slack_publish({
            "type": "info",
            "msg": text
        });
    }

    on_response(response) {
        // 过滤不属于本策略的response
        let ref_id = response["ref_id"];
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

    on_query_account_response(response) {

        // 计算仓位是否一致
        let exchange = response.metadata.exchange;
        let contract_type = response.metadata.contract_type;
        let account_id = response.metadata.metadata.account_id;
        let balance = response.metadata.metadata.balance;
        let account = [exchange, account_id, contract_type].join(".");

        let real_positions = response.metadata.metadata.positions;
        let cal_positions = {};

        // pnl计算
        let today = moment.now();
        // 天数最小是1，如果是0的话后面的计算会报错
        let n_days = Math.max(1, - this.init_dates[account].diff(today, "days"));

        this.account_summary[account]["wallet_balance"] =  stratutils.round(balance["wallet_balance_in_USD"], 2);

        // FUSD for launchpool
        if (account === "BinanceU.th_binance_cny_master.perp") {
            // 2370.81 USDC + 60000 USDT 划转到th_binance_cny_sub01z账户
            this.account_summary[account]["equity"] = stratutils.round(balance["equity_in_USD"] + 2370.81 + 60000, 2);
        } else if (account === "BinanceU.th_binance_cny_sub01.perp") { 
            this.account_summary[account]["equity"] = stratutils.round(balance["equity_in_USD"] - 60000, 2);
        } else {
            this.account_summary[account]["equity"] = stratutils.round(balance["equity_in_USD"], 2);
        }

        this.account_summary[account]["nv"] = stratutils.round(this.account_summary[account]["equity"] / this.denominator[account], 4); 
        this.account_summary[account]["pnl"] = stratutils.round(this.account_summary[account]["equity"] - this.init_equity[account], 2);
        this.account_summary[account]["unrealized_pnl"] = stratutils.round(balance["unrealized_pnl_in_USD"], 2);
        this.account_summary[account]["ret"] = stratutils.round(this.account_summary[account]["nv"] - 1, 4); 
        this.account_summary[account]["annual_ret"] = stratutils.round(this.account_summary[account]["ret"] / n_days * 365, 4); 

        // 真的是in_USDT吗？
        this.account_summary[account]["total_position_initial_margin_in_USDT"] = (real_positions.length > 0) ? stratutils.round(real_positions.map(e => e.positionInitialMargin * e.leverage).reduce((a, b) => a + b), 2) : 0; 
        this.account_summary[account]["total_long_position_initial_margin_in_USDT"] = (real_positions.length > 0) ? stratutils.round(real_positions.filter(e => e.position > 0).map(e => e.positionInitialMargin * e.leverage).reduce((a, b) => a + b, 0), 2) : 0; 
        this.account_summary[account]["total_short_position_initial_margin_in_USDT"] = (real_positions.length > 0) ? stratutils.round(real_positions.filter(e => e.position < 0).map(e => e.positionInitialMargin * e.leverage).reduce((a, b) => a + b, 0), 2) : 0; 
 
        this.account_summary[account]["long_lev"] = stratutils.round(this.account_summary[account]["total_long_position_initial_margin_in_USDT"] / this.account_summary[account]["equity"], 2); 
        this.account_summary[account]["short_lev"] = stratutils.round(this.account_summary[account]["total_short_position_initial_margin_in_USDT"] / this.account_summary[account]["equity"], 2); 
        this.account_summary[account]["leverage"] = stratutils.round(this.account_summary[account]["total_position_initial_margin_in_USDT"] / this.account_summary[account]["equity"], 2); 

        // TODO: query from some api things
        let usdt_to_cny = 7.2;
        let that = this;
        // 从account_summary中读取月初的净值nv
        fs.createReadStream("/root/jq_cta/log/account_summary.csv")
            .pipe(csv())
            .on('data', function (data) {
                try {
                    let now = utils._util_get_human_readable_timestamp();
                    let month_start = now.slice(0, 6) + "01000000";
                    let account_str = [exchange, data.account_id, contract_type].join(".");
                    if ((account_str === account) && (data.ts.slice(0, 14) === month_start)) {
                        that.account_summary[account]["month_init_nv"] = +data.nv;
                        that.account_summary[account]["month_init_equity"] = +data.equity;
                    }
                } catch (err) {
                    logger.info("err", err);
                }
            })
            .on("end", function () { 
                // 如果没有读取到，一般情况是账户刚启用，那么净值定义为1
                if (that.account_summary[account]["month_init_nv"] === undefined) {
                    that.account_summary[account]["month_init_nv"] = 1;
                    that.account_summary[account]["month_init_equity"] = that.account_summary[account]["init_equity"];
                }
            });

        let current_nv = this.account_summary[account]["nv"];
        let month_init_nv = this.account_summary[account]["month_init_nv"];

        this.account_summary[account]["equity_in_cny"] = (this.account_summary[account]["equity"] * usdt_to_cny / 10000).toFixed(2);     // 单位：万
        this.account_summary[account]["pnl_in_cny"] = (this.account_summary[account]["pnl"] * usdt_to_cny / 10000).toFixed(2);          // 单位：万
        this.account_summary[account]["month_to_date_pnl"] = ((current_nv - month_init_nv) / month_init_nv * 100).toFixed(2);    // 百分比

        // account_id和account是不一样的：
        // acccount_id如th_binance_cny_master，account如BinanceU.th_binance_cny_master.perp
        this.update_account_summary_to_ui(account_id, account, usdt_to_cny);

        
        // if (account_id === "th_binance_cny_sub01") return;
        // 计算仓位是否和预想一致
        for (let alias of this.aliases) {
            let cfg = JSON.parse(fs.readFileSync(`./config/cfg_${alias}.json`, 'utf8'));
            let status_map = JSON.parse(fs.readFileSync(`./config/status_map_${alias}.json`, 'utf8'));
            // 不在cfg里面的不需要进行统计
            let loop_items = (this.rev_aliases.includes(alias))? cfg["idfs"] : cfg["entries"];

            for (let item of loop_items) {
                if (cfg[item].act_id !== account_id) continue;
                if (status_map[item] === undefined) continue;
                
                let symbol = item.split(".")[1];
                if (symbol in cal_positions) {
                    cal_positions[symbol] += status_map[item]["pos"];
                } else {
                    cal_positions[symbol] = status_map[item]["pos"];
                }

                let idf = item.split(".").slice(0, 3).join(".");
                cal_positions[symbol] = stratutils.transform_with_tick_size(cal_positions[symbol], QUANTITY_TICK_SIZE[idf]);
            }
        }

        let additional_position = JSON.parse(fs.readFileSync(`./config/additional_position.json`, 'utf8'));
        for (let symbol of Object.keys(additional_position[account_id]) ) {
            let idf = [EXCHANGE.BINANCEU, symbol, CONTRACT_TYPE.PERP].join(".");
            cal_positions[symbol] = (symbol in cal_positions) ? (cal_positions[symbol] + additional_position[account_id][symbol]) : additional_position[account_id][symbol];
            cal_positions[symbol] = stratutils.transform_with_tick_size(cal_positions[symbol], QUANTITY_TICK_SIZE[idf]);
        }

        // logger.info("BAM", JSON.stringify(cal_positions), JSON.stringify(real_positions));

        let warning_msg = "";
        // wierd_symbols是指实际仓位中没有仓位，但是计算出来却有的交易对
        let wierd_symbols = Object.keys(cal_positions).filter((symbol) => ! (real_positions.map((e) => e["symbol"]).includes(symbol)));

        for (let symbol of wierd_symbols) {
            if (cal_positions[symbol] !== 0) warning_msg += `${account_id}|inconsistent position of ${symbol}:: cal: ${cal_positions[symbol]}, real: 0 \n`
        }

        // real_positions没有的怎么主动清除，否则会一直残存在cta_positions里面
        Object.keys(that.cta_positions).filter((symbol) => ! (real_positions.map((e) => e["symbol"]).includes(symbol))).map((symbol) => {
            that.cta_positions[symbol][account] = 0;
        });

        for (let item of real_positions) {
            let symbol = item["symbol"];
            let position = item["position"];

            if (that.cta_accounts.includes(account)) {
                if (that.cta_positions[symbol] === undefined) that.cta_positions[symbol] = {};
                that.cta_positions[symbol][account] = position;
            }

            // logger.info(JSON.stringify(that.cta_positions));
            // logger.info(JSON.stringify(that.latest_prices));

            let idf = [EXCHANGE.BINANCEU, symbol, CONTRACT_TYPE.PERP].join(".");
            let calculated_position = (symbol in cal_positions) ? stratutils.transform_with_tick_size(cal_positions[symbol], QUANTITY_TICK_SIZE[idf]) : 0;

            if (position !== calculated_position) warning_msg += `${account_id}|inconsistent position of ${symbol}:: cal: ${calculated_position}, real: ${position} \n`;
        }

        if (warning_msg !== "") {
            this.slack_publish({
                "type": "alert",
                "msg": warning_msg
            });
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

        this.intercom.emit(INTERCOM_CHANNEL.ACTIVE_ORDERS, response, INTERCOM_SCOPE.STRATEGY);
    }

    update_cta_account_summary_to_ui() {
        let usdt_to_cny = 7.2;
        let today = moment.now();
        if (this.account_summary["BinanceU.th_binance_cny_master.perp"]["month_to_date_pnl"] && this.account_summary["BinanceU.th_binance_cny_sub01.perp"]["month_to_date_pnl"]) {
            this.account_summary["CTA"]["wallet_balance"] = this.cta_accounts.map(account => this.account_summary[account]["wallet_balance"]).reduce((a, b) => a + b, 0);
            this.account_summary["CTA"]["unrealized_pnl"] = this.cta_accounts.map(account => this.account_summary[account]["unrealized_pnl"]).reduce((a, b) => a + b, 0);
            this.account_summary["CTA"]["equity"] = this.cta_accounts.map(account => this.account_summary[account]["equity"]).reduce((a, b) => a + b, 0);
            this.account_summary["CTA"]["nv"] = stratutils.round(this.account_summary["CTA"]["equity"] / this.account_summary["CTA"]["denominator"], 4); 

            let sum_long_position_initial_margin_in_USDT = this.cta_accounts.map(account => this.account_summary[account]["total_long_position_initial_margin_in_USDT"]).reduce((a, b) => a + b, 0);
            let sum_short_position_initial_margin_in_USDT = this.cta_accounts.map(account => this.account_summary[account]["total_short_position_initial_margin_in_USDT"]).reduce((a, b) => a + b, 0);
            let sum_position_initial_margin_in_USDT = this.cta_accounts.map(account => this.account_summary[account]["total_position_initial_margin_in_USDT"]).reduce((a, b) => a + b, 0);

            this.account_summary["CTA"]["long_lev"] = stratutils.round(sum_long_position_initial_margin_in_USDT / this.account_summary["CTA"]["equity"], 2); 
            this.account_summary["CTA"]["short_lev"] = stratutils.round(sum_short_position_initial_margin_in_USDT / this.account_summary["CTA"]["equity"], 2); 
            this.account_summary["CTA"]["leverage"] = stratutils.round(sum_position_initial_margin_in_USDT / this.account_summary["CTA"]["equity"], 2); 

            let n_cta_days = Math.max(1, - this.account_summary["CTA"]["init_date"].diff(today, "days"));
            this.account_summary["CTA"]["pnl"] = stratutils.round(this.account_summary["CTA"]["equity"] - this.account_summary["CTA"]["init_equity"], 2);
            this.account_summary["CTA"]["ret"] = stratutils.round(this.account_summary["CTA"]["nv"] - 1, 4); 
            this.account_summary["CTA"]["annual_ret"] = stratutils.round(this.account_summary["CTA"]["ret"] / n_cta_days * 365, 4); 

            let cta_month_init_equity = this.cta_accounts.map(account => this.account_summary[account]["month_init_equity"]).reduce((a, b) => a + b, 0);
            this.account_summary["CTA"]["equity_in_cny"] = (this.account_summary["CTA"]["equity"] * usdt_to_cny / 10000).toFixed(2);      // 单位：万
            this.account_summary["CTA"]["pnl_in_cny"] = (this.account_summary["CTA"]["pnl"] * usdt_to_cny / 10000).toFixed(2);            // 单位：万
            this.account_summary["CTA"]["month_to_date_pnl"] = ((this.account_summary["CTA"]["equity"] - cta_month_init_equity) / cta_month_init_equity * 100).toFixed(2);             // 百分比
        
            this.update_account_summary_to_ui("CTA", "CTA", usdt_to_cny);
        }
    }

    update_account_summary_to_ui(table_name, account, usdt_to_cny) {
        let sendData = {
            "tableName": table_name,
            "tabName": "Summary",
            "data": [
                {
                    "init_equity": this.account_summary[account]["init_equity"],
                    "wallet_balance": this.account_summary[account]["wallet_balance"],
                    "unrealized_pnl": this.account_summary[account]["unrealized_pnl"],
                    "equity": this.account_summary[account]["equity"]
                },
                {
                    "denominator": this.account_summary[account]["denominator"],
                    "nv": this.account_summary[account]["nv"],
                    "long_lev": this.account_summary[account]["long_lev"],
                    "short_lev": this.account_summary[account]["short_lev"]
                },
                {
                    "pnl": this.account_summary[account]["pnl"],
                    "ret": this.account_summary[account]["ret"] * 100,                   // 百分比
                    "annual_ret": this.account_summary[account]["annual_ret"] * 100,     // 百分比
                    "leverage": this.account_summary[account]["leverage"]
                },
                {
                    "usdt_to_cny": usdt_to_cny,
                    "equity_in_cny": this.account_summary[account]["equity_in_cny"],
                    "pnl_in_cny": this.account_summary[account]["pnl_in_cny"],
                    "month_to_date_pnl": this.account_summary[account]["month_to_date_pnl"]
                }
            ]
        }

        this.intercom.emit("UI_update", sendData, INTERCOM_SCOPE.UI);
    }

    update_account_summary_to_slack() {
        let that = this;
        let txt = "";

        for (let account of that.accounts.concat(["CTA"])) {
            let {pnl, ret, long_lev, short_lev, leverage, equity_in_cny, pnl_in_cny, month_to_date_pnl} = that.account_summary[account];
            let ret_per = `${parseFloat(ret * 100).toFixed(2)}%`;
            
            txt += `====${account}====\npnl\t\tret\t\tleverage\n${pnl}\t\t${ret_per}\t\t${long_lev} + ${short_lev} = ${leverage}\nequity_in_cny\tpnl_in_cny\tmonth_to_date_pnl\n${equity_in_cny}\t\t${pnl_in_cny}\t\t${month_to_date_pnl}\n`;
        }

        txt += `[===IMPORTANT===]\n`
        let top3_lag_subscription = Object.entries(this.sub_streams_upd_ts).sort(([, a], [, b]) => a - b).slice(0, 3).map(([n]) => n);
        for (let subscription of top3_lag_subscription) {
            let time_lag = Math.round((moment.now() - this.sub_streams_upd_ts[subscription]) / 1000);
            txt += `${subscription} lag for ${time_lag} s!\n`
        }

        let mem = process.memoryUsage();    // 2024-09-21：这里为什么是实际内存值的三倍？不懂 {"rss":157360128,"heapTotal":23584768,"heapUsed":17692624,"external":15990849,"arrayBuffers":14454056}
        let mem_usage = (mem.heapUsed / mem.heapTotal * 100).toFixed(1);
        txt += `Memory usage: ${mem_usage} %\n`;

        let disk_info = disk.checkSync('/');
        let disk_usage = ((1 - disk_info.available / disk_info.total) * 100).toFixed(1);
        txt += `Disk usage: ${disk_usage} %\n`;


        // 计算仓位的价值和占比，要永远记住，控制仓位才能长久！
        txt += `[===永远要控制仓位===]\n`
        let value_position = {};
        for (let symbol of Object.keys(that.cta_positions)) {
            let sum_pos = Object.values(that.cta_positions[symbol]).reduce((a, b) => a + b, 0);
            let sub = `BinanceU|${symbol}|perp|trade`;
            if (that.latest_prices[sub] !== undefined) {
                let sum_value = Math.abs(sum_pos * that.latest_prices[sub]);
                value_position[symbol] = sum_value;
            }
        }
        let top3 = Object.entries(value_position).sort(([, a], [, b]) => b - a).slice(0, 3).map(([n]) => n);
        for (let symbol of top3) {
            let sub = `BinanceU|${symbol}|perp|trade`;
            if (this.account_summary["CTA"]["equity"]) {
                let sum_pos = Object.values(that.cta_positions[symbol]).reduce((a, b) => a + b, 0);
                let sum_pos_str = (sum_pos > 0) ? "LONG" : "SHORT";
                let per_value = (value_position[symbol] / that.account_summary["CTA"]["equity"] * 100);
                txt += `${symbol}: \n${value_position[symbol].toFixed(0)}USDT \t${per_value.toFixed(1)}% \t${sum_pos_str}\n`;
            }
        }

        this.slack_publish({
            "type": "info",
            "msg": txt
        });
    }

    on_balance_update(balance) {
    }

    on_order_update(order_update) {
    }

    _on_market_data_trade_ready(trade) {
        let subscription = [trade.exchange, trade.symbol, trade.contract_type, "trade"].join("|");

        if (SUBSCRIPTION_LIST.includes(subscription)) {
            this.sub_streams_upd_ts[subscription] = moment.now();
            this.latest_prices[subscription] = trade["metadata"][0][2];
        }
    }
}

module.exports = BalanceMonitor;

let strategy;
let intercom_config = [
    INTERCOM_CONFIG[`LOCALHOST_FEED`],
    INTERCOM_CONFIG[`LOCALHOST_STRATEGY`],
    INTERCOM_CONFIG[`LOCALHOST_UI`]
];

strategy = new BalanceMonitor("BalanceMonitor", "BAM", new Intercom(intercom_config));
strategy.start();

process.on('SIGINT', async () => {
    logger.info(`${strategy.alias}::SIGINT`);
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