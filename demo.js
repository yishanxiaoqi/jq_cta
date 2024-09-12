require("./config/typedef.js");
const stratutils = require("./utils/strat_util.js");

idf = "BinanceU.ADAUSDT.perp";
console.log(stratutils.transform_with_tick_size(0.36763999999999997, PRICE_TICK_SIZE[idf]));
console.log(0.3677 >= stratutils.transform_with_tick_size(0.36763999999999997, PRICE_TICK_SIZE[idf]));