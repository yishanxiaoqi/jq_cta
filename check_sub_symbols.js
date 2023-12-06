require("./config/stratdef");
const fs = require("fs");


let aliases = ["R01", "R06", "R12", "R24", "STR", "SRE", "XEM"];
let live_idfs = [];

for (let alias of aliases) {
    let cfg = JSON.parse(fs.readFileSync(`./config/cfg_${alias}.json`, 'utf8'));
    for (let idf of cfg["idfs"]) {
        if (! live_idfs.includes(idf)) live_idfs.push(idf);
    }
}

// 目前只订阅了trade数据
let sub_idfs = SUBSCRIPTION_LIST.map(e => e.split("|").slice(0, 3).join("."));

// console.log(live_idfs, live_idfs.length);
// console.log(sub_idfs, sub_idfs.length);

// 需要订阅，但是没有订阅的idf
let diff_1 = live_idfs.filter(e => !sub_idfs.includes(e));
console.log(diff_1);

// 不需要订阅，但是已经订阅的idf
let diff_2 = sub_idfs.filter(e => !live_idfs.includes(e));
console.log(diff_2);
