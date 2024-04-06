const utils = require("./utils/util_func");
const fs = require("fs");
const csv = require('csv-parser');

var firstDay = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

console.log(utils._util_get_human_readable_timestamp());
let now = utils._util_get_human_readable_timestamp();
let month_start = now.slice(0, 6) + "01000000";
console.log(month_start);

let month_init_equity;
let account = "th_binance_cny_master";
fs.createReadStream("/root/jq_cta/log/account_summary.csv")
.pipe(csv())
.on('data', function (data) {
    try {
        let now = utils._util_get_human_readable_timestamp();
        let month_start = now.slice(0, 6) + "01000000";
        if ((data.account_id === account) && (data.ts.slice(0, 14) === month_start)) month_init_equity = +data.equity;
    } catch (err) {
        console.log(err);
    }
})
.on("end", function(){
    console.log("month_init_equity1", month_init_equity);
});

console.log("month_init_equity2", month_init_equity);