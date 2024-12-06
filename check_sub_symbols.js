require("./config/stratdef");
const fs = require("fs");


let aliases = ALIASES;
let live_idfs = [];
let live_idfs_d = {};

console.log(aliases);

for (let alias of aliases) {
    let cfg = JSON.parse(fs.readFileSync(`./config/cfg_${alias}.json`, 'utf8'));
    let loop_entries = (alias.startsWith("R")) ? cfg["idfs"] : cfg["entries"];
    for (let entry of loop_entries) {
        let idf = entry.split(".").slice(0, 3).join(".");
        if (! live_idfs.includes(idf)) live_idfs.push(idf);

        let act_id = (alias.startsWith("R")) ? cfg[idf]["act_id"] : cfg[entry]["act_id"];
        if (act_id in live_idfs_d) {
            if (! live_idfs_d[act_id].includes(idf)) live_idfs_d[act_id].push(idf);
        } else {
            live_idfs_d[act_id] = [idf];
        }
    }
}

// 目前只订阅了trade数据
let sub_idfs = SUBSCRIPTION_LIST.map(e => e.split("|").slice(0, 3).join("."));

// console.log(live_idfs, live_idfs.length);
// console.log(sub_idfs, sub_idfs.length);
console.log("正在订阅的频道个数：", sub_idfs.length);

// 需要订阅，但是没有订阅的idf
let diff_1 = live_idfs.filter(e => !sub_idfs.includes(e));
console.log("需要订阅，但是没有订阅的频道：", diff_1);

// 不需要订阅，但是已经订阅的idf
let diff_2 = sub_idfs.filter(e => !live_idfs.includes(e));
console.log("不需要订阅，但是已经订阅的频道：", diff_2);

// 检查每个account_id交易的symbol个数
for (let act_id of Object.keys(live_idfs_d)) {
    let length = live_idfs_d[act_id].length;
    console.log(`${act_id}订阅的频道个数：${length}`);
}
