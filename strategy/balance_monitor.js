require("../config/typedef.js");
const fs = require('fs');
const moment = require("moment");
const csv = require('csv-parser');

const StrategyBase = require("./strategy_base.js");
const Intercom = require("../module/intercom");
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
        this.accounts = [
            "Binance.th_binance_cny_master.spot",
            "BinanceU.th_binance_cny_master.perp",
            // "BinanceU.th_binance_cny_sub01.perp",
            "BinanceU.th_binance_cny_sub02.perp"
        ];
        this.init_equity = {
            "BinanceU.th_binance_cny_master.perp": 181926.51,
            // "BinanceU.th_binance_cny_sub01.perp": 8223.74,
            "BinanceU.th_binance_cny_sub02.perp": 6436.55,
            "BinanceU.th_binance_cny_sub03.perp": 0
        };
        this.denominator = {
            "BinanceU.th_binance_cny_master.perp": 130172.08, 
            // "BinanceU.th_binance_cny_sub01.perp": 6832.04,
            "BinanceU.th_binance_cny_sub02.perp": 5734.82,
            "BinanceU.th_binance_cny_sub03.perp": 0
        };
        this.init_dates = {
            "BinanceU.th_binance_cny_master.perp": moment("2023-06-23"),
            // "BinanceU.th_binance_cny_sub01.perp": moment("2023-10-08"),
            // "BinanceU.th_binance_cny_sub02.perp": moment("2023-10-24"),
            "BinanceU.th_binance_cny_sub02.perp": moment("2024-01-13"),
            "BinanceU.th_binance_cny_sub03.perp": moment("2023-10-27")
        };
        this.aliases = ["R01", "R06", "R12", "R24", "STR", "SRE"];

        // 初始化各个账户的结单
        this.account_summary = {};
        for (let account of this.accounts) {
            this.account_summary[account] = {};
        }

        // 初始化各个订阅频道的更新时间
        this.subscription_list = SUBSCRIPTION_LIST;
        this.latest_prices = {};
        this.sub_streams_upd_ts = {};
        for (let subscription of this.subscription_list) {
            this.sub_streams_upd_ts[subscription] = moment.now();
        }
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
        }, 1000 * 60 * 1);
        
        setInterval(() => { 
            this.update_status_map_to_slack();
            // 设置为5秒后发送账户总结
            setTimeout(() => {
                this.update_account_summary_to_slack();
            }, 1000 * 5);
        }, 1000 * 60 * 5);

        // 记录净值
        schedule.scheduleJob('0 0/30 * * * *', function() {
            for (let account of that.accounts) {
                let [exchange, account_id, contract_type] = account.split(".");
                if (that.account_summary[account]["equity"] === undefined) return;
                let ts = moment().format('YYYYMMDDHHmmssSSS');
                let {equity, nv, leverage} = that.account_summary[account];
                let record_string = [ts, account_id, that.init_equity[account], equity, that.denominator[account], nv, leverage].join(",") + "\n";
                fs.writeFile("./log/account_summary.csv", record_string, { flag: "a+" }, (err) => {
                    if (err) logger.info(`${that.alias}:: fs write file error!`);
                });
            }
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
            } else if (alias === "STR") {
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

        // 针对Binance.th_binance_cny_master.spot账户单独订制
        if (account === "Binance.th_binance_cny_master.spot") {
            this.account_summary[account]["BNB_equity"] = balance["BNB"]["equity"];
            this.account_summary[account]["USDT_equity"] = balance["USDT"]["equity"];
            return
        }

        let real_positions = response.metadata.metadata.positions;
        let cal_positions = {};

        // BNB头寸管理，专门用BNBUSDC来对冲BNB
        let spot_account = `Binance.${account_id}.spot`;
        let bnb_spot_equity = this.account_summary[spot_account] ? this.account_summary[spot_account]["BNB_equity"] : 0;
        let bnb_equity = stratutils.round(balance["BNB"]["equity"], 2);
        let bnbusdc = (real_positions.length > 0) ? (real_positions.filter(e => e.symbol === "BNBUSDC").length > 0 ? real_positions.filter(e => e.symbol === "BNBUSDC")[0]["position"] : 0) : 0;
        this.account_summary[account]["BNB_spot_equity"] = bnb_spot_equity;
        this.account_summary[account]["BNB_equity"] = bnb_equity;
        this.account_summary[account]["BNBUSDC_position"] = bnbusdc;
        this.account_summary[account]["BNB_beta"] = stratutils.round(bnb_spot_equity + bnb_equity + bnbusdc, 2);

        // pnl计算
        let today = moment.now();
        let n_days = - this.init_dates[account].diff(today, "days");

        this.account_summary[account]["wb"] =  stratutils.round(balance["wallet_balance_in_USD"], 2);
        this.account_summary[account]["equity"] = stratutils.round(balance["equity_in_USD"], 2);
        
        // 如果现货账户中BNB不为零，需要加上对应的BNB价值（折算成USDT）
        if ((bnb_spot_equity > 0) && (this.latest_prices["BinanceU|BNBUSDT|perp|trade"])) {
            this.account_summary[account]["equity"] += bnb_spot_equity * this.latest_prices["BinanceU|BNBUSDT|perp|trade"];
            this.account_summary[account]["equity"] = stratutils.round(this.account_summary[account]["equity"], 2);
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
        fs.createReadStream("/root/jq_cta/log/account_summary.csv")
            .pipe(csv())
            .on('data', function (data) {
                try {
                    let now = utils._util_get_human_readable_timestamp();
                    let month_start = now.slice(0, 6) + "01000000";
                    let account_str = [exchange, data.account_id, contract_type].join(".");
                    if ((account_str === account) && (data.ts.slice(0, 14) === month_start)) {
                        that.account_summary[account]["month_init_nv"] = +data.nv;
                    }
                } catch (err) {
                    logger.info("err", err);
                }
            })
            .on("end", function () { 
            });

        let current_nv = this.account_summary[account]["nv"];
        let month_init_nv = this.account_summary[account]["month_init_nv"];

        this.account_summary[account]["equity_in_cny"] = (this.account_summary[account]["equity"] * usdt_to_cny / 10000).toFixed(2);     // 单位：万
        this.account_summary[account]["pnl_in_cny"] = (this.account_summary[account]["pnl"] * usdt_to_cny / 10000).toFixed(2);          // 单位：万
        this.account_summary[account]["month_to_date_pnl"] = ((current_nv - month_init_nv) / month_init_nv * 100).toFixed(2);    // 百分比

        let sendData = {
            "tableName": account_id,
            "tabName": "Summary",
            "data": [
                {
                    "BNB_spot_equity": this.account_summary[account]["BNB_spot_equity"],
                    "BNB_equity": this.account_summary[account]["BNB_equity"],
                    "BNBUSDC_position": this.account_summary[account]["BNBUSDC_position"],
                    "BNB_beta": this.account_summary[account]["BNB_beta"]
                },
                {
                    "init_equity": this.init_equity[account],
                    "wallet_balance": this.account_summary[account]["wb"],
                    "unrealized_pnl": this.account_summary[account]["unrealized_pnl"],
                    "equity": this.account_summary[account]["equity"]
                },
                {
                    "denominator": this.denominator[account],
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

        // if (account_id === "th_binance_cny_sub01") return;
        // 计算仓位是否和预想一致
        for (let alias of this.aliases) {
            let cfg = JSON.parse(fs.readFileSync(`./config/cfg_${alias}.json`, 'utf8'));
            let status_map = JSON.parse(fs.readFileSync(`./config/status_map_${alias}.json`, 'utf8'));
            // 不在cfg里面的不需要进行统计
            let loop_items = (["STR", "SRE", "XEM", "XES"].includes(alias))? cfg["entries"]: cfg["idfs"];

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

        // logger.info("BAM", JSON.stringify(cal_positions), JSON.stringify(real_positions));

        let warning_msg = "";
        let wierd_symbols = Object.keys(cal_positions).filter((symbol) => ! (real_positions.map((e) => e["symbol"]).includes(symbol)));

        for (let symbol of wierd_symbols) {
            if (cal_positions[symbol] !== 0) warning_msg += `${account_id}|inconsistent position of ${symbol}:: cal: ${cal_positions[symbol]}, real: 0 \n`
        }

        for (let item of real_positions) {
            let symbol = item["symbol"];
            let position = item["position"];

            // BNBUSDC专门拿来对冲，在UI上会单独显示，因此不需要对比！
            if (symbol === "BNBUSDC") continue;

            let idf = [EXCHANGE.BINANCEU, symbol, CONTRACT_TYPE.PERP].join(".");
            let calculated_position = (symbol in cal_positions) ? stratutils.transform_with_tick_size(cal_positions[symbol], QUANTITY_TICK_SIZE[idf]) : 0;
            if (position !== calculated_position) warning_msg += `${account_id}|inconsistent position of ${symbol}:: cal: ${calculated_position}, real: ${position} \n`
        }

        if (warning_msg !== "") {
            this.slack_publish({
                "type": "alert",
                "msg": warning_msg
            });
        }
    }

    update_account_summary_to_slack() {
        let that = this;
        let txt = "";

        for (let account of that.accounts) {
            let {pnl, ret, leverage, equity_in_cny, pnl_in_cny, month_to_date_pnl} = that.account_summary[account];
            let ret_per = `${parseFloat(ret * 100).toFixed(2)}%`;
            
            txt += `====${account}====\npnl\t\tret\t\tleverage\n${pnl}\t\t${ret_per}\t\t${leverage}\nequity_in_cny\tpnl_in_cny\tmonth_to_date_pnl\n${equity_in_cny}\t\t${pnl_in_cny}\t\t${month_to_date_pnl}\n`;
        }

        let obj = this.sub_streams_upd_ts;
        let most_lag_subscription = Object.keys(obj).reduce(function(a, b) { return obj[a] < obj[b] ? a : b });
        let max_time_lag = Math.round((moment.now() - this.sub_streams_upd_ts[most_lag_subscription]) / 1000);
        txt += `[===IMPORTANT===] Haven't received ${most_lag_subscription} data for ${max_time_lag} s!`

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
        this.sub_streams_upd_ts[subscription] = moment.now();
        this.latest_prices[subscription] = trade["metadata"][0][2];
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