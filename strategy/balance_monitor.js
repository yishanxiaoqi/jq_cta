require("../config/typedef.js");
const fs = require('fs');
const moment = require("moment");

const StrategyBase = require("./strategy_base.js");
const Intercom = require("../module/intercom");
const stratutils = require("../utils/strat_util.js");

class BalanceMonitor extends StrategyBase {
    constructor(name, alias, intercom) {
        super(name, alias, intercom);

        // 需要自行修改 ========
        this.init_balance = 5713.51;
        this.init_date = moment("2023-06-23");
        this.aliases = ["R01", "STR"];
    }

    start() {
        this._register_events();
        setInterval(() => { this.update_status_map_to_slack() }, 1000 * 60 * 2);
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

    on_balance_update(balance) {
        for (let item of balance) {
            if (item["a"] === "USDT") {
                let today = moment.now();
                let wallet_balance = stratutils.round(item["wb"], 2);
                let pnl = stratutils.round(wallet_balance - this.init_balance, 2);
                let ret = pnl / this.init_balance;
                let ret_per = `${parseFloat(ret * 100).toFixed(2)}%`;
                let n_days = - this.init_date.diff(today, "days");
                let annul_return = ret / n_days * 365;
                let annul_return_per = `${parseFloat(annul_return * 100).toFixed(2)}%`;
                let txt = `====Summary====\ninit\t\tcurr\t\tpnl\t\tret\t\tannul\n${this.init_balance}\t\t${wallet_balance}\t\t${pnl}\t\t${ret_per}\t\t${annul_return_per}`;
                this.slack_publish({
                    "type": "info",
                    "msg": txt
                });
            }
        }
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
    INTERCOM_CONFIG[`LOCALHOST_STRATEGY`]
];

strategy = new BalanceMonitor("BalanceMonitor", "BAM", new Intercom(intercom_config));
strategy.start();

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