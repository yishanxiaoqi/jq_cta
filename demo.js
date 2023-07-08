const fs = require("fs");

let aliases = ["R01", "R06", "R12", "R24"];
let symbols = [];

for (let alias of aliases) {
    let cfg = JSON.parse(fs.readFileSync(`./config/cfg_${alias}.json`));

    for (let symbol of cfg["symbols"]) {
        if (!symbols.includes(symbol)) symbols.push(symbol);
    }
}

console.log(symbols);
console.log(symbols.length);

for (let symbol of symbols) {
    let i = 0;
    for (let alias of aliases) {
        let cfg = JSON.parse(fs.readFileSync(`./config/cfg_${alias}.json`));
    
        if (cfg["symbols"].includes(symbol)) i += 1;
    }
    console.log(symbol, i);

    if (i == 4) console.log(symbol, "===");
}

let cfg = JSON.parse(fs.readFileSync(`./config/cfg_STR.json`));
let symbols_STR = cfg["idfs"].map((e) => {return e.split(".")[1]});
console.log(symbols_STR.sort().length);

symbols = symbols.concat(symbols_STR);
symbols = [...new Set(symbols)];
console.log(symbols.sort());
console.log(symbols.length);

// -----

console.log(arguments.__callee);

