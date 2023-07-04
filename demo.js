require("./config/typedef.js");
const moment = require("moment");
const stratutils = require("./utils/strat_util.js");

this.init_balance = 5713.51;
this.init_date = moment("2023-06-23");

let account_update = { "e": "ACCOUNT_UPDATE", "T": 1688480712432, "E": 1688480712436, "a": { "B": [{ "a": "USDT", "wb": "5730.08008394", "cw": "5730.08008394", "bc": "0.00801253" }], "P": [], "m": "ADMIN_DEPOSIT" } };
let balance = account_update["a"]["B"];

for (let item of balance) {
    if (item["a"] === "USDT") {
        console.log(JSON.stringify(item["wb"]));
        let today = moment.now();
        let wallet_balance = stratutils.round(item["wb"]);
        let pnl = wallet_balance - this.init_balance;
        let ret = pnl / this.init_balance;
        let ret_per = `${parseFloat(ret * 100).toFixed(2)}%`;
        let n_days = - this.init_date.diff(today, "days");
        let annul_return = ret / n_days * 365;
        let annul_return_per = `${parseFloat(annul_return * 100).toFixed(2)}%`;
        let txt = `init\t\tcurr\t\tpnl\t\tret\t\tannul\n${this.init_balance}\t\t${wallet_balance}\t\t${pnl}\t\t${ret_per}\t\t${annul_return_per}`;
        slack.info(txt);
    }
}