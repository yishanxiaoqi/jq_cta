require("../config/typedef.js");
const fs = require('fs');
const moment = require("moment");

const StrategyBase = require("./strategy_base.js");
const Intercom = require("../module/intercom");
const stratutils = require("../utils/strat_util.js");
const schedule = require('node-schedule');

class BalanceMonitor extends StrategyBase {
    constructor(name, alias, intercom) {
        super(name, alias, intercom);

        // 需要自行修改 ========
        this.account_id = "jq_cta_02";
        this.init_equity = 5713.51;
        this.denominator = 5713.51;
        this.init_date = moment("2023-06-23");
        this.aliases = ["R01", "R06", "R12", "R24", "STR"];

        // only one account_id for now;
        this.account_summary = {};
    }

    start() {
        let that = this;
        this._register_events();
        setInterval(() => { 
            this.query_account({
                exchange: EXCHANGE.BINANCEU,
                contract_type: CONTRACT_TYPE.PERP,
                account_id: "jq_cta_02"
            }) 
        }, 1000 * 60 * 1);

        setInterval(() => { 
            this.update_status_map_to_slack();
            this.update_account_summary_to_slack();
        }, 1000 * 60 * 5);

        // 记录净值
        schedule.scheduleJob('0 0/30 * * * *', function() {
            if (that.account_summary["equity"] === undefined) return;
            let ts = moment().format('YYYYMMDDHHmmssSSS');
            let {equity, nv} = that.account_summary;
            let record_string = [ts, that.account_id, that.init_equity, equity, that.denominator, nv].join(",") + "\n";
            fs.writeFile("./log/account_summary.csv", record_string, { flag: "a+" }, (err) => {
                if (err) logger.info(`${that.alias}:: fs write file error!`);
            });
        });
    }

    update_status_map_to_slack() {
        let text = "";
        let add_items;

        for (let alias of this.aliases) {

            if (alias === "STR") {
                add_items = ["status", "pos", "fee", "net_profit", "sar", "up", "dn"]; 
                text += `========${alias}========\nentry\tstatus\tpos\tfee\tnp\tsar(sp)\tup\tdn\n`;
            } else {
                add_items = ["status", "triggered", "pos", "fee", "net_profit", "stoploss_price", "up", "dn"];
                text += `========${alias}========\nidf\tstatus\ttriggered\tpos\tfee\tnp\tsp\tup\tdn\n`;
            }
            
            let status_map = JSON.parse(fs.readFileSync(`./config/status_map_${alias}.json`, 'utf8'));
            for (let idf of Object.keys(status_map)) {
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

        let real_positions = response.metadata.metadata.positions;
        let balance = response.metadata.metadata.balance;
        let cal_positions = {};

        for (let alias of this.aliases) {
            let cfg = JSON.parse(fs.readFileSync(`./config/cfg_${alias}.json`, 'utf8'));
            let status_map = JSON.parse(fs.readFileSync(`./config/status_map_${alias}.json`, 'utf8'));
            let loop_items = (alias === "STR")? cfg["entries"]: cfg["idfs"];

            for (let item of loop_items) {
                let symbol = item.split(".")[1];
                if (symbol in cal_positions) {
                    cal_positions[symbol] += status_map[item]["pos"];
                } else {
                    cal_positions[symbol] = status_map[item]["pos"];
                }
            }
        }

        let warning_msg = "";
        let wierd_symbols = Object.keys(cal_positions).filter((symbol) => ! (real_positions.map((e) => e["symbol"]).includes(symbol)));

        for (let symbol of wierd_symbols) {
            if (cal_positions[symbol] !== 0) warning_msg += `inconsistent position of ${symbol}:: cal: ${cal_positions[symbol]}, real: 0 \n`
        }

        for (let item of real_positions) {
            let symbol = item["symbol"];
            let position = item["position"];

            let idf = [EXCHANGE.BINANCEU, symbol, CONTRACT_TYPE.PERP].join(".");
            let calculated_position = stratutils.transform_with_tick_size(cal_positions[symbol], QUANTITY_TICK_SIZE[idf]);
            if (position !== calculated_position) warning_msg += `inconsistent position of ${symbol}:: cal: ${calculated_position}, real: ${position} \n`
        }

        if (warning_msg !== "") {
            this.slack_publish({
                "type": "alert",
                "msg": warning_msg
            });
        }

        let today = moment.now();
        let n_days = - this.init_date.diff(today, "days");

        this.account_summary["wb"] =  stratutils.round(balance["wallet_balance_in_USDT"], 2);
        this.account_summary["equity"] = stratutils.round(balance["equity_in_USDT"], 2);
        this.account_summary["nv"] = stratutils.round(this.account_summary["equity"] / this.denominator, 4); 
        this.account_summary["pnl"] = stratutils.round(this.account_summary["equity"] - this.init_equity, 2);
        this.account_summary["unrealized_pnl"] = stratutils.round(balance["unrealized_pnl_in_USDT"], 2);
        this.account_summary["ret"] = stratutils.round(this.account_summary["pnl"] / this.init_equity, 4); 
        this.account_summary["annual_ret"] = stratutils.round(this.account_summary["ret"] / n_days * 365, 4); 
        this.account_summary["total_position_initial_margin_in_USDT"] = stratutils.round(real_positions.map(e => e.positionInitialMargin * e.leverage).reduce((a, b) => a + b), 2); 
        this.account_summary["leverage"] = stratutils.round(this.account_summary["total_position_initial_margin_in_USDT"] / this.account_summary["equity"], 2); 

        let sendData = {
            "tableName": "summary",
            "tabName": "Summary",
            "data": [
                {
                    "init_equity": this.init_equity,
                    "wallet_balance": this.account_summary["wb"],
                    "unrealized_pnl": this.account_summary["unrealized_pnl"],
                    "equity": this.account_summary["equity"]
                },
                {
                    "denominator": this.denominator,
                    "nv": this.account_summary["nv"]
                },
                {
                    "pnl": this.account_summary["pnl"],
                    "ret": this.account_summary["ret"],
                    "annual_ret": this.account_summary["annual_ret"],
                    "leverage": this.account_summary["leverage"]
                }
            ]
        }
        this.intercom.emit("UI_SUMMARY", sendData, INTERCOM_SCOPE.UI);
    }

    update_account_summary_to_slack() {
        let {wb, unrealized_pnl, equity, pnl, ret, annual_ret, leverage} = this.account_summary;
        let ret_per = `${parseFloat(ret * 100).toFixed(2)}%`;
        let annual_ret_per = `${parseFloat(annual_ret * 100).toFixed(2)}%`;
        let txt = `====Summary====\ninit_equity\t\twallet_balance\t\tunrealized_pnl\t\tequity\t\tpnl\t\tret\t\tannual\t\tleverage\n${this.init_equity}\t\t${wb}\t\t${unrealized_pnl}\t\t${equity}\t\t${pnl}\t\t${ret_per}\t\t${annual_ret_per}\t\t${leverage}`;
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