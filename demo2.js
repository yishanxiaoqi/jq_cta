const Slack = require("./module/slack").Slack;
const moment = require("moment");

let slack = new Slack();

const table = require('table').table;
const fs = require('fs');

// let data = [
//     ['init_usdt', 'curr_usdt', 'pnl', 'return', 'annul_return'],
//     [500, 501, 1, '1%', '20%']
// ];

// let output = table(data);
// console.log(output);

// let txt = `init\t\tcurr\t\tpnl\t\tret\t\tannul\n500\t\t501\t\t1\t\t2%\t\t20%`;
// slack.info(txt);

let init_date = moment("2023-06-23");
let today = moment.now();

let n_days = - init_date.diff(today, "days");

console.log(n_days);