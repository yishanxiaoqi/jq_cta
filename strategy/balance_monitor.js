require("../config/typedef.js");
const moment = require("moment");
const StrategyBase = require("./strategy_base.js");
const Intercom = require("../module/intercom");
const stratutils = require("../utils/strat_util.js");

class BalanceMonitor extends StrategyBase {
    constructor(name, alias, intercom) {
        super(name, alias, intercom);
        this.init_balance = 5713.51;
        this.init_date = moment("2023-06-23");
    }

    on_balance_update(balance) {
        console.log(JSON.stringify(balance));
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
                let txt = `init\t\tcurr\t\tpnl\t\tret\t\tannul\n${this.init_balance}\t\t${wallet_balance}\t\t${pnl}\t\t${ret_per}\t\t${annul_return_per}`;
                this.slack.info(txt);
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