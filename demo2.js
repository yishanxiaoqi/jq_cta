const fs = require('fs');

let aliases = ["R01"];
let text = "";
let add_items = ["status", "triggered", "pos", "fee", "net_profit", "stoploss_price", "up", "dn"];

for (let alias of aliases) {
    text += `========${alias}========\nidf\tstatus\ttriggered\tpos\tfee\tnp\tsp\tup\tdn\n`;
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
// this.slack.info(text);

console.log(text);

// console.log(status_map);